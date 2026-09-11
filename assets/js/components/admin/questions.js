/* إدارة أسئلة اختبار واحد (Phase D) — إنشاء/تعديل/حذف لكل الأنواع الخمسة
 * (mcq/tf/fill/match/order) + عرض قراءة فقط للنوع المفتوح (open) بلا تصحيح
 * آلي. يعتمد على admin_get_quiz_questions RPC (005_admin_read_functions.sql)
 * للقراءة الكاملة (بما فيها الإجابات)، وعلى adminInsert/adminUpdate/
 * adminDelete/adminReplaceQuestionChildren (core/api.js) للكتابة — كل الحماية
 * الفعلية في سياسات RLS questions_write_admin/options_write_admin/... .
 *
 * قرار نطاق متعمَّد: لا يمكن تغيير نوع سؤال موجود بعد إنشائه (يتطلّب تنظيف
 * جداول فرعية بأنواع مختلفة تماماً بحسب النوع القديم) — يُعرض النوع كنص ثابت
 * عند التعديل، ويُختار مرة واحدة فقط عند الإنشاء. كذلك: لا عمود ترتيب صريح في
 * questions (انظر SUPABASE_MIGRATION_AUDIT.md §1.8) — ترتيب الأسئلة يُحدَّد
 * بترتيب المعرّف نفسه (لاحقة رقمية)، فلا زر "إعادة ترتيب" هنا؛ يُشرَح ذلك في
 * تلميح حقل المعرّف عند الإنشاء. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };
  var shared = DLP.adminShared;

  var currentUser = null;
  if (DLP.auth && typeof DLP.auth.onChange === 'function') {
    DLP.auth.onChange(function (user) { currentUser = user; });
  }

  var editingId = null; // null | 'new' | معرّف سؤال
  var formType = 'mcq'; // النوع المختار في نموذج الإنشاء فقط
  var message = null;

  function questionSeq(id) {
    var m = /-(\d+)$/.exec(id || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  /* ---------------------------------------------------------------------- */
  /* عرض قراءة (موروث من السقالة الأولى، بلا تغيير في المنطق)                 */
  /* ---------------------------------------------------------------------- */

  function correctAnswerLabel(question) {
    switch (question.type) {
      case 'mcq': {
        var correctOption = (question.options || []).filter(function (o) { return o.is_correct; })[0];
        return correctOption ? correctOption.label : '—';
      }
      case 'tf':
        return question.answer === true ? t('quiz.true') : t('quiz.false');
      case 'fill':
        return Array.isArray(question.answer) ? question.answer.join(t('common.listSeparator')) : String(question.answer || '—');
      case 'match':
        return (question.pairs || []).map(function (p) { return p.left + ' ← ' + p.right; }).join(' | ') || '—';
      case 'order':
        return (question.items || []).map(function (i) { return i.text; }).join(' ← ') || '—';
      default:
        return '—';
    }
  }

  function renderOptionsCell(question) {
    if (question.type === 'mcq') {
      return '<ul class="detail-list">' + (question.options || []).map(function (o) {
        return '<li>' + esc(o.label) + (o.is_correct ? ' — ✓ ' + esc(t('admin.correctMark')) : '') + '</li>';
      }).join('') + '</ul>';
    }
    return '—';
  }

  /* ---------------------------------------------------------------------- */
  /* تحويل نص↔بيانات لكل نوع سؤال (سطر واحد لكل عنصر في textarea)             */
  /* ---------------------------------------------------------------------- */

  function linesOf(raw) { return (raw || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }

  function parseMcqOptions(raw) {
    var correctIndex = 0;
    var options = linesOf(raw).map(function (line, i) {
      var isCorrect = line.charAt(0) === '*';
      if (isCorrect) { correctIndex = i; }
      return { position: i, label: isCorrect ? line.slice(1).trim() : line, is_correct: isCorrect };
    });
    return { options: options, correctIndex: correctIndex };
  }
  function mcqOptionsToText(options) {
    return (options || []).slice().sort(function (a, b) { return a.position - b.position; }).map(function (o) {
      return (o.is_correct ? '*' : '') + o.label;
    }).join('\n');
  }

  function parsePairs(raw) {
    return linesOf(raw).map(function (line, i) {
      var parts = line.split('::');
      return { position: i, left_text: (parts[0] || '').trim(), right_text: (parts.slice(1).join('::') || '').trim() };
    });
  }
  function pairsToText(pairs) {
    return (pairs || []).slice().sort(function (a, b) { return a.position - b.position; }).map(function (p) {
      return p.left + ' :: ' + p.right;
    }).join('\n');
  }

  function parseItems(raw) {
    return linesOf(raw).map(function (line, i) { return { position: i, item_text: line }; });
  }
  function itemsToText(items) {
    return (items || []).slice().sort(function (a, b) { return a.position - b.position; }).map(function (i) { return i.text; }).join('\n');
  }

  function parseRubric(raw) {
    return linesOf(raw).map(function (line) {
      var parts = line.split('::');
      var keywords = parts[1] ? parts[1].split(',').map(function (k) { return k.trim(); }).filter(Boolean) : [];
      return { text: (parts[0] || '').trim(), keywords: keywords };
    });
  }
  function rubricToText(rubric) {
    return (rubric || []).map(function (p) {
      return p.text + (p.keywords && p.keywords.length ? ' :: ' + p.keywords.join(',') : '');
    }).join('\n');
  }

  /* ---------------------------------------------------------------------- */
  /* نموذج الإنشاء/التعديل                                                   */
  /* ---------------------------------------------------------------------- */

  var TYPES = ['mcq', 'tf', 'fill', 'match', 'order', 'open'];

  function renderTypeSpecificFields(type, row) {
    switch (type) {
      case 'mcq':
        return shared.textareaField('options_raw', t('admin.question.options'), row ? mcqOptionsToText(row.options) : '', { rows: 5 });
      case 'tf':
        return shared.selectField('answer_bool', t('admin.questionAnswer'), row && row.answer === false ? 'false' : 'true', [
          { value: 'true', label: t('admin.question.answerTrue') }, { value: 'false', label: t('admin.question.answerFalse') }
        ]);
      case 'fill':
        return shared.textareaField('fill_answers_raw', t('admin.question.fillAnswers'), row ? (row.answer || []).join('\n') : '', { rows: 3 });
      case 'match':
        return shared.textareaField('pairs_raw', t('admin.question.pairs'), row ? pairsToText(row.pairs) : '', { rows: 5 });
      case 'order':
        return shared.textareaField('items_raw', t('admin.question.items'), row ? itemsToText(row.items) : '', { rows: 5 });
      case 'open':
        return shared.textareaField('rubric_raw', t('admin.question.rubric'), row ? rubricToText(row.rubric) : '', { rows: 4 });
      default:
        return '';
    }
  }

  function renderQuestionFormRow(quizId, row) {
    var isNew = !row;
    var type = isNew ? formType : row.type;
    var idField = isNew
      ? shared.textField('id', t('admin.field.id'), '', { required: true, hint: t('admin.field.idHint') + ' — ' + t('admin.field.number') })
      : '<div class="admin-field"><span>' + esc(t('admin.field.id')) + '</span><code>' + esc(row.id) + '</code></div>';
    var typeField = isNew
      ? shared.selectField('type', t('admin.questionType'), type, TYPES.map(function (tp) { return { value: tp, label: t('admin.question.type.' + tp) }; }))
      : '<div class="admin-field"><span>' + esc(t('admin.questionType')) + '</span><code>' + esc(t('admin.question.type.' + type)) + '</code></div>';
    return '<tr><td colspan="5">' +
      '<form class="admin-form" data-question-form data-id="' + esc(isNew ? '' : row.id) + '" data-type="' + esc(type) + '">' +
        idField + typeField +
        shared.textareaField('prompt', t('admin.field.prompt'), row ? row.prompt : '', { required: true, rows: 3 }) +
        shared.textField('difficulty', t('admin.field.difficulty'), row ? row.difficulty : '') +
        (type !== 'open' ? shared.textareaField('explanation', t('admin.question.explanation'), row ? row.explanation : '', { rows: 2 }) : '') +
        renderTypeSpecificFields(type, row) +
        shared.statusField(row ? row.status : 'draft') +
        '<div class="admin-form-actions">' +
          '<button class="btn btn-primary btn-sm" type="submit">' + esc(t('admin.action.save')) + '</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="cancel">' + esc(t('admin.action.cancel')) + '</button>' +
        '</div>' +
      '</form>' +
    '</td></tr>';
  }

  function renderQuestionRow(question) {
    if (editingId === question.id) { return renderQuestionFormRow(question.quiz_id, question); }
    return '<tr>' +
      '<td>' + esc(question.id) + '</td>' +
      '<td>' + esc(t('admin.question.type.' + question.type, question.type)) + '</td>' +
      '<td>' + esc(question.prompt) + '</td>' +
      '<td>' + renderOptionsCell(question) + '</td>' +
      '<td>' + esc(correctAnswerLabel(question)) + '</td>' +
      '<td class="admin-row-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="edit" data-id="' + esc(question.id) + '">✎ ' + esc(t('admin.action.edit')) + '</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="delete" data-id="' + esc(question.id) + '">🗑 ' + esc(t('admin.action.delete')) + '</button>' +
      '</td>' +
    '</tr>';
  }

  function renderMessage() {
    if (!message) { return ''; }
    return '<div class="admin-inline-message ' + (message.kind === 'ok' ? 'ok' : 'bad') + '">' + esc(message.text) + '</div>';
  }

  function renderQuestionsTable(quizId, questions) {
    var sorted = questions.slice().sort(function (a, b) { return questionSeq(a.id) - questionSeq(b.id); });
    return '<section class="prose-card">' +
      '<p><a class="btn btn-ghost btn-sm" href="#/admin">← ' + esc(t('admin.backToSubjects')) + '</a></p>' +
      '<h2>' + esc(t('admin.questionsTitle')) + ' — ' + esc(quizId) + '</h2>' +
      renderMessage() +
      (editingId === 'new'
        ? '<table class="data-table"><tbody>' + renderQuestionFormRow(quizId, null) + '</tbody></table>'
        : '<p><button class="btn btn-gold btn-sm" type="button" data-crud-action="add">+ ' + esc(t('admin.question.addTitle')) + '</button></p>') +
      (sorted.length
        ? '<table class="data-table"><thead><tr>' +
            '<th>ID</th><th>' + esc(t('admin.questionType')) + '</th><th>' + esc(t('quiz.question')) + '</th>' +
            '<th>' + esc(t('admin.questionOptions')) + '</th><th>' + esc(t('admin.questionAnswer')) + '</th><th></th>' +
          '</tr></thead><tbody>' + sorted.map(renderQuestionRow).join('') + '</tbody></table>'
        : '<div class="empty-state"><p>' + esc(t('admin.emptyList')) + '</p></div>') +
    '</section>';
  }

  function render() {
    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('admin.title'), href: '#/admin' }, { label: t('admin.questionsTitle') }]) +
      '<section class="subject-hero" style="margin-top:14px"><h1>🛠️ ' + esc(t('admin.questionsTitle')) + '</h1></section>' +
      '<div data-admin-body>' +
        (!shared.isAuthAvailable() ? shared.renderNotAvailable() : (currentUser ? shared.renderLoading() : shared.renderSignInPrompt())) +
      '</div>' +
      DLP.layout.endActions() +
    '</div>';
  }

  function refresh(root, quizId) {
    var body = root.querySelector('[data-admin-body]');
    if (!body) { return; }
    if (!shared.isAuthAvailable()) { body.innerHTML = shared.renderNotAvailable(); return; }
    if (!currentUser) { body.innerHTML = shared.renderSignInPrompt(); return; }
    body.innerHTML = shared.renderLoading();
    DLP.api.isAdminOrInstructor().then(function (isAdmin) {
      if (!isAdmin) { body.innerHTML = shared.renderAccessDenied(); return; }
      return DLP.api.fetchQuizQuestionsAdmin(quizId).then(function (questions) {
        body.innerHTML = renderQuestionsTable(quizId, questions || []);
      });
    }).catch(function () {
      body.innerHTML = shared.renderError();
    });
  }

  /** يبني {questionPayload, children} من نموذج مُرسَل: questionPayload صالح
   * لـ adminInsert/adminUpdate('questions', ...)؛ children وصف صفوف فرعية
   * يجب استبدالها عبر adminReplaceQuestionChildren بعد معرفة معرّف السؤال
   * (مهم للإنشاء: المعرّف يأتي من raw.id مباشرة لأن المفاتيح نصّية بلا توليد
   * تلقائي من القاعدة — لسنا مضطرين لانتظار نتيجة الإدراج لمعرفته). */
  function collectQuestionSubmission(form, quizId) {
    var raw = shared.formToObject(form);
    var type = form.dataset.type;
    var payload = {
      quiz_id: quizId, type: type, prompt: raw.prompt, difficulty: raw.difficulty || null,
      status: raw.status, explanation: raw.explanation || null, answer: null, rubric: null
    };
    if (raw.id) { payload.id = raw.id; }
    var children = null;
    switch (type) {
      case 'mcq': {
        var mcq = parseMcqOptions(raw.options_raw || '');
        payload.answer = mcq.correctIndex;
        children = { table: 'question_options', rows: mcq.options };
        break;
      }
      case 'tf':
        payload.answer = raw.answer_bool === 'true';
        break;
      case 'fill':
        payload.answer = linesOf(raw.fill_answers_raw);
        break;
      case 'match':
        children = { table: 'question_pairs', rows: parsePairs(raw.pairs_raw || '') };
        break;
      case 'order':
        children = { table: 'question_items', rows: parseItems(raw.items_raw || '') };
        break;
      case 'open':
        payload.rubric = parseRubric(raw.rubric_raw || '');
        break;
    }
    return { payload: payload, children: children };
  }

  function bind(quizId) {
    var root = document.getElementById('main');
    if (!root) { return; }
    refresh(root, quizId);
    shared.bindCommonActions(root, function () { refresh(root, quizId); });

    root.addEventListener('change', function (event) {
      var typeSelect = event.target.closest('[name="type"]');
      if (typeSelect && editingId === 'new') { formType = typeSelect.value; refresh(root, quizId); }
    });

    root.addEventListener('click', function (event) {
      var addBtn = event.target.closest('[data-crud-action="add"]');
      if (addBtn) { editingId = 'new'; formType = 'mcq'; message = null; refresh(root, quizId); return; }
      var cancelBtn = event.target.closest('[data-crud-action="cancel"]');
      if (cancelBtn) { editingId = null; refresh(root, quizId); return; }
      var editBtn = event.target.closest('[data-crud-action="edit"]');
      if (editBtn) { editingId = editBtn.dataset.id; message = null; refresh(root, quizId); return; }
      var deleteBtn = event.target.closest('[data-crud-action="delete"]');
      if (deleteBtn) {
        if (!global.confirm(t('admin.confirmDelete'))) { return; }
        DLP.api.adminDelete('questions', deleteBtn.dataset.id).then(function () {
          message = { kind: 'ok', text: t('admin.deleteSuccess') };
          refresh(root, quizId);
        }).catch(function () {
          message = { kind: 'bad', text: t('admin.deleteError') };
          refresh(root, quizId);
        });
      }
    });

    root.addEventListener('submit', function (event) {
      var form = event.target.closest('[data-question-form]');
      if (!form) { return; }
      event.preventDefault();
      var id = form.dataset.id;
      var submission = collectQuestionSubmission(form, quizId);
      var savePromise = id
        ? DLP.api.adminUpdate('questions', id, submission.payload)
        : DLP.api.adminInsert('questions', submission.payload);
      savePromise.then(function (savedRow) {
        var questionId = id || (savedRow && savedRow.id) || submission.payload.id;
        if (submission.children) {
          return DLP.api.adminReplaceQuestionChildren(submission.children.table, questionId, submission.children.rows);
        }
      }).then(function () {
        message = { kind: 'ok', text: t('admin.saveSuccess') };
        editingId = null;
        refresh(root, quizId);
      }).catch(function () {
        message = { kind: 'bad', text: t('admin.saveError') };
        refresh(root, quizId);
      });
    });
  }

  DLP.adminQuestionsView = {
    render: render, bind: bind,
    /** للاختبارات فقط. */
    __test: {
      correctAnswerLabel: correctAnswerLabel, renderQuestionRow: renderQuestionRow,
      parseMcqOptions: parseMcqOptions, mcqOptionsToText: mcqOptionsToText,
      parsePairs: parsePairs, pairsToText: pairsToText,
      parseItems: parseItems, itemsToText: itemsToText,
      parseRubric: parseRubric, rubricToText: rubricToText,
      collectQuestionSubmission: collectQuestionSubmission
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
