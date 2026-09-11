/* واجهة الأسئلة التفاعلية: عرض سؤال واحد في كل مرة مع تصحيح وتفسير ونتيجة. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };
  function letters() { return t('quiz.letters').split(','); }

  var states = {};   // quizId -> state
  var STORE_PREFIX = 'dlp.quiz.';

  /* ---------------------------------------------------------------------- */
  /* حفظ دائم عبر Supabase لمستخدم مسجَّل (Stage 2) — إضافي بحت، لا يغيّر أي   */
  /* سلوك محلي: التصحيح والعرض يبقيان محلّيين تماماً كما كانا (DLP.quiz.grade */
  /* يعمل على البيانات الثابتة الحالية بلا تغيير)؛ هذا فقط يُبقي نسخة دائمة   */
  /* من كل إجابة في quiz_attempts/quiz_answers حين يكون هناك مستخدم مسجَّل     */
  /* واتصال جاهز — بدل الاعتماد على localStorage وحده (القاعدة رقم 10).      */
  /* أي فشل شبكة/اتصال يُتجاهل بهدوء ولا يُغيّر أي شيء في واجهة المستخدم.      */
  /* ---------------------------------------------------------------------- */

  var currentUser = null;
  if (DLP.auth && typeof DLP.auth.onChange === 'function') {
    DLP.auth.onChange(function (user) { currentUser = user; });
  }

  function canPersist() {
    return !!currentUser && !!DLP.api && typeof DLP.api.isReady === 'function' && DLP.api.isReady();
  }

  var attemptPromises = {}; // quizId -> Promise<attemptId>

  function ensureAttempt(quiz) {
    if (!attemptPromises[quiz.id]) {
      attemptPromises[quiz.id] = DLP.api.startQuizAttempt(quiz.id).catch(function (error) {
        delete attemptPromises[quiz.id]; // يسمح بمحاولة جديدة لاحقاً بدل تجميد الفشل للأبد
        throw error;
      });
    }
    return attemptPromises[quiz.id];
  }

  /** يحوّل إجابة العميل إلى الشكل الذي تتوقعه save_quiz_answer لكل نوع سؤال
   * (انظر supabase/migrations/003_functions.sql وDATABASE_SCHEMA.md). */
  function toServerResponse(question, response) {
    switch (question.type) {
      case 'mcq':  return Number(response);
      case 'tf':   return response === true || response === 'true';
      case 'fill': return String(response == null ? '' : response);
      case 'open': return String(response == null ? '' : response);
      case 'order':
      case 'match': return Array.isArray(response) ? response.slice() : [];
      default: return response;
    }
  }

  /** تُعيد Promise لتسهيل الاختبار؛ نداءات الواجهة الفعلية لا تنتظرها أبداً
   * (fire-and-forget) — أي فشل هنا لا يجوز أن يؤخّر أو يغيّر تفاعل المستخدم. */
  function persistAnswer(quiz, question, response) {
    if (!canPersist()) { return Promise.resolve(false); }
    return ensureAttempt(quiz)
      .then(function (attemptId) { return DLP.api.saveQuizAnswer(attemptId, question.id, toServerResponse(question, response)); })
      .then(function () { return true; })
      .catch(function () { return false; }); // فشل بهدوء — التخزين المحلي (localStorage) يبقى fallback فورياً
  }

  function persistFinish(quiz) {
    if (!canPersist() || !attemptPromises[quiz.id]) { return Promise.resolve(false); }
    return attemptPromises[quiz.id]
      .then(function (attemptId) { return DLP.api.finishQuizAttempt(attemptId); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function discardAttempt(quizId) { delete attemptPromises[quizId]; }

  /* ---------------------------------------------------------------------- */
  /* تصحيح عن بُعد للمحتوى القادم من القاعدة (DATA_SOURCE==='database') —     */
  /* answer/pairs[].right/items الصحيحة غير متوفرة أبداً محلياً لهذا المحتوى  */
  /* (محجوبة عمداً على مستوى العمود)، فالتصحيح المحلي الفوري (core/quiz.js)  */
  /* لا يعمل عليه؛ نستبدله هنا بتصحيح خادمي (RPC) لمستخدم مسجَّل عبر         */
  /* save_quiz_answer (يحفظ أيضاً)، أو check_answer لغير المسجَّل (بلا حفظ،   */
  /* بلا كشف بنك الإجابات — نفس مستوى الكشف الحالي في الوضع الثابت تماماً).  */
  /* المحتوى الثابت (data/subjects/*.js) يبقى يستخدم core/quiz.js كما هو    */
  /* تماماً بلا أي تغيير — الفرع هنا لا يُفعَّل إلا حين remoteMode() صحيحة.   */
  /* ---------------------------------------------------------------------- */

  function remoteMode() {
    return !!(DLP.store && typeof DLP.store.dataSource === 'function' && DLP.store.dataSource() === 'database');
  }

  /** يُستدعى فقط حين remoteMode() — يحدّد صح/خطأ عبر RPC، ويخزّن النتيجة (+كشف
   * الإجابة لمستخدم مسجَّل) في state.remote[question.id]، ثم يُحدّث العرض. */
  function checkRemote(quiz, question, state, root) {
    var existing = state.remote[question.id];
    if (existing && existing.pending) { return Promise.resolve(); }
    state.remote[question.id] = { pending: true };
    refresh(root, state);

    var serverResponse = toServerResponse(question, state.responses[question.id]);
    var gradePromise;
    if (question.type === 'open') {
      gradePromise = Promise.resolve(false); // لا تصحيح آلي لسؤال مفتوح — فقط كشف لاحقاً
    } else if (canPersist()) {
      gradePromise = ensureAttempt(quiz).then(function (attemptId) {
        return DLP.api.saveQuizAnswer(attemptId, question.id, serverResponse);
      });
    } else if (DLP.api && typeof DLP.api.checkAnswer === 'function') {
      gradePromise = DLP.api.checkAnswer(question.id, serverResponse);
    } else {
      gradePromise = Promise.reject(new Error('DLP.api.checkAnswer غير متاح'));
    }

    return gradePromise.then(function (isCorrect) {
      state.checked[question.id] = true;
      state.remote[question.id] = { pending: false, correct: !!isCorrect };
      if (canPersist() && DLP.api && typeof DLP.api.revealQuestionAnswer === 'function') {
        return DLP.api.revealQuestionAnswer(question.id).then(function (revealed) {
          state.remote[question.id].revealed = revealed;
        }).catch(function () { /* تجاهل بهدوء — يبقى صح/خطأ معروفاً بلا تفاصيل الإجابة */ });
      }
    }).catch(function () {
      // فشل شبكة/تحقق — لا نُبقي السؤال معلَّقاً للأبد؛ يعود قابلاً لإعادة المحاولة
      delete state.remote[question.id];
    }).then(function () {
      save(state);
      refresh(root, state);
    });
  }

  /** نتيجة التصحيح لسؤال واحد بشكل موحَّد بصرف النظر عن مصدر البيانات —
   * {correct, correctAnswer} كـ DLP.quiz.grade() تماماً في الوضع الثابت،
   * أو مبنية من state.remote[]/الإجابة المكشوفة في الوضع القادم من القاعدة. */
  function gradedFor(state, question) {
    if (remoteMode()) {
      var r = state.remote[question.id];
      if (!r || r.pending) { return null; }
      return { correct: r.correct, correctAnswer: correctAnswerFromRevealed(question, r.revealed) };
    }
    return state.checked[question.id] ? DLP.quiz.grade(question, state.responses[question.id]) : null;
  }

  /** الإجابة الصحيحة بصيغة عرض من بيانات reveal_question_answer (مستخدم مسجَّل فقط) —
   * تعيد نصاً إرشادياً لتسجيل الدخول إن لم تتوفر (زائر غير مسجَّل، أو فشل الكشف). */
  function correctAnswerFromRevealed(question, revealed) {
    if (!revealed) { return t('quiz.signInToReveal'); }
    switch (question.type) {
      case 'mcq':
        var correctOption = (revealed.options || []).filter(function (o) { return o.is_correct; })[0];
        return correctOption ? correctOption.label : '';
      case 'tf': return revealed.answer ? t('quiz.true') : t('quiz.false');
      case 'fill': return Array.isArray(revealed.answer) ? revealed.answer[0] : revealed.answer;
      case 'match':
        return (revealed.pairs || []).map(function (p) { return p.left + ' ← ' + p.right; }).join(' | ');
      case 'order': return (revealed.items || []).join(' ← ');
      default: return '';
    }
  }

  /** نتيجة الاختبار الكلية للمحتوى القادم من القاعدة — تُحتسب فقط من الأسئلة
   * التي حصلت فعلاً على تصحيح خادمي (state.remote)، بخلاف الوضع الثابت الذي
   * يُحسب فوراً من كل إجابة مُختارة حتى قبل الضغط على "تحقق". بنفس حقول
   * DLP.quiz.score() تماماً ليستخدمها renderProgress/renderResult بلا تفريع. */
  function remoteScore(state) {
    var gradable = 0, correct = 0, answered = 0, gradableAnswered = 0;
    state.questions.forEach(function (q) {
      var r = state.remote[q.id];
      var isAnswered = !!(r && !r.pending);
      if (isAnswered) { answered += 1; }
      if (q.type !== 'open') {
        gradable += 1;
        if (isAnswered) {
          gradableAnswered += 1;
          if (r.correct) { correct += 1; }
        }
      }
    });
    return {
      total: gradable, allTotal: state.questions.length,
      answered: answered, gradableAnswered: gradableAnswered,
      correct: correct, wrong: gradableAnswered - correct,
      percent: gradable ? Math.round((correct / gradable) * 100) : 0
    };
  }

  function scoreFor(state) { return remoteMode() ? remoteScore(state) : DLP.quiz.score(state.questions, state.responses); }

  function createState(quiz) {
    return {
      quiz: quiz,
      difficulty: 'all',
      lecture: 'all',
      questions: quiz.questions.slice(),
      index: 0,
      responses: {},
      checked: {},
      remote: {}, // questionId -> {pending, correct, revealed?} — الوضع القادم من القاعدة فقط
      finished: false
    };
  }

  /** الأسئلة بعد تطبيق فلترَي الصعوبة والمحاضرة معاً. */
  function applyFilters(questions, difficulty, lecture) {
    return DLP.quiz.filterByLecture(DLP.quiz.filterByDifficulty(questions, difficulty), lecture);
  }

  /** قائمة المحاضرات الفعلية الممثَّلة في بنك أسئلة الاختبار (بترتيب رقم المحاضرة). */
  function lecturesInQuiz(quiz, subject) {
    var ids = {};
    quiz.questions.forEach(function (q) { if (q.lectureId) { ids[q.lectureId] = true; } });
    var lectures = (subject.lectures || []).filter(function (l) { return ids[l.id]; });
    lectures.sort(function (a, b) { return (a.number || 0) - (b.number || 0); });
    return lectures;
  }

  /* ---------- حفظ التقدّم في المتصفح (محلي للجهاز، لا يُرسل لأي خادم) ---------- */

  function storageAvailable() {
    try {
      var probe = STORE_PREFIX + 'probe';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (e) { return false; }   // وضع التصفح الخاص أو تخزين معطّل
  }

  function save(state) {
    if (!storageAvailable()) { return; }
    try {
      global.localStorage.setItem(STORE_PREFIX + state.quiz.id, JSON.stringify({
        v: 1,
        difficulty: state.difficulty,
        lecture: state.lecture,
        index: state.index,
        responses: state.responses,
        checked: state.checked,
        finished: state.finished
      }));
    } catch (e) { /* تجاوز الحصة المتاحة — نتجاهل بهدوء */ }
  }

  function load(quiz) {
    var state = createState(quiz);
    if (!storageAvailable()) { return state; }
    try {
      var raw = global.localStorage.getItem(STORE_PREFIX + quiz.id);
      if (!raw) { return state; }
      var saved = JSON.parse(raw);
      if (!saved || saved.v !== 1) { return state; }
      // نقبل فقط إجابات الأسئلة التي ما زالت موجودة في المحتوى الحالي
      var validIds = {};
      quiz.questions.forEach(function (q) { validIds[q.id] = true; });
      ['responses', 'checked'].forEach(function (key) {
        Object.keys(saved[key] || {}).forEach(function (id) {
          if (validIds[id]) { state[key][id] = saved[key][id]; }
        });
      });
      state.difficulty = saved.difficulty || 'all';
      state.lecture = saved.lecture || 'all';
      state.questions = applyFilters(quiz.questions, state.difficulty, state.lecture);
      state.index = Math.min(Math.max(0, saved.index || 0), Math.max(0, state.questions.length - 1));
      state.finished = !!saved.finished;
    } catch (e) { return createState(quiz); }
    return state;
  }

  function clearSaved(quizId) {
    try { global.localStorage.removeItem(STORE_PREFIX + quizId); } catch (e) { /* لا شيء */ }
  }

  function getState(quiz) {
    if (!states[quiz.id]) { states[quiz.id] = load(quiz); }
    return states[quiz.id];
  }

  function resetStates() { states = {}; }

  function current(state) { return state.questions[state.index]; }

  /* ------------------------- رسم أنواع الأسئلة ------------------------- */

  function renderMcq(state, question) {
    var response = state.responses[question.id];
    var checked = state.checked[question.id];
    var remote = remoteMode();
    var graded = checked ? gradedFor(state, question) : null;
    var revealed = remote && state.remote[question.id] ? state.remote[question.id].revealed : null;
    var correctIndex = remote
      ? (revealed && Array.isArray(revealed.options)
        ? (revealed.options.filter(function (o) { return o.is_correct; })[0] || {}).position
        : null)
      : question.answer;
    var knowCorrect = correctIndex !== null && correctIndex !== undefined;
    return '<div class="opt-list" role="group" aria-label="' + esc(t('a11y.optionsGroup')) + '">' +
      question.options.map(function (option, i) {
        var classes = ['opt'];
        var mark = '';
        if (checked) {
          if (knowCorrect) {
            if (i === correctIndex) { classes.push('is-correct'); mark = '✓'; }
            else if (Number(response) === i && !graded.correct) { classes.push('is-wrong'); mark = '✕'; }
          } else if (Number(response) === i) {
            classes.push(graded.correct ? 'is-correct' : 'is-wrong');
            mark = graded.correct ? '✓' : '✕';
          }
        }
        return '<button type="button" class="' + classes.join(' ') + '" data-answer="mcq" data-value="' + i + '"' +
          ' aria-pressed="' + (Number(response) === i ? 'true' : 'false') + '"' + (checked ? ' disabled' : '') + '>' +
          '<span class="let" aria-hidden="true">' + esc(letters()[i] || (i + 1)) + '</span>' +
          '<span>' + esc(option) + '</span>' +
          (mark ? '<span class="mark" aria-hidden="true">' + mark + '</span>' : '') +
        '</button>';
      }).join('') +
    '</div>';
  }

  function renderTf(state, question) {
    var response = state.responses[question.id];
    var checked = state.checked[question.id];
    var remote = remoteMode();
    var graded = checked ? gradedFor(state, question) : null;
    var revealed = remote && state.remote[question.id] ? state.remote[question.id].revealed : null;
    var correctBool = remote ? (revealed ? Boolean(revealed.answer) : null) : Boolean(question.answer);
    var knowCorrect = correctBool !== null;
    var options = [{ value: 'true', label: t('quiz.true'), bool: true }, { value: 'false', label: t('quiz.false'), bool: false }];
    return '<div class="opt-list" role="group" aria-label="' + esc(t('a11y.trueFalseGroup')) + '">' +
      options.map(function (option, i) {
        var classes = ['opt'];
        var mark = '';
        if (checked) {
          if (knowCorrect) {
            if (option.bool === correctBool) { classes.push('is-correct'); mark = '✓'; }
            else if (response === option.value) { classes.push('is-wrong'); mark = '✕'; }
          } else if (response === option.value) {
            classes.push(graded.correct ? 'is-correct' : 'is-wrong');
            mark = graded.correct ? '✓' : '✕';
          }
        }
        return '<button type="button" class="' + classes.join(' ') + '" data-answer="tf" data-value="' + option.value + '"' +
          ' aria-pressed="' + (response === option.value ? 'true' : 'false') + '"' + (checked ? ' disabled' : '') + '>' +
          '<span class="let" aria-hidden="true">' + esc(letters()[i]) + '</span><span>' + esc(option.label) + '</span>' +
          (mark ? '<span class="mark" aria-hidden="true">' + mark + '</span>' : '') +
        '</button>';
      }).join('') +
    '</div>';
  }

  function renderFill(state, question) {
    var response = state.responses[question.id] || '';
    var checked = state.checked[question.id];
    return '<label class="visually-hidden" for="fill-' + esc(question.id) + '">' + esc(t('quiz.fillPlaceholder')) + '</label>' +
      '<input class="fill-input" id="fill-' + esc(question.id) + '" type="text" data-answer="fill" autocomplete="off"' +
      ' placeholder="' + esc(t('quiz.fillPlaceholder')) + '" value="' + esc(response) + '"' + (checked ? ' disabled' : '') + '>';
  }

  function renderMatch(state, question) {
    var response = state.responses[question.id] || [];
    var checked = state.checked[question.id];
    var remote = remoteMode();
    var lefts = remote ? (question.pairsLeft || []) : question.pairs.map(function (p) { return p.left; });
    var rightsRaw = remote ? (question.pairsRight || []) : question.pairs.map(function (p) { return p.right; });
    var options = rightsRaw.slice().sort(function (a, b) { return a.localeCompare(b, 'ar'); });
    var graded = checked ? gradedFor(state, question) : null;
    var revealed = remote && state.remote[question.id] ? state.remote[question.id].revealed : null;
    var correctByLeft = null;
    if (remote && revealed && Array.isArray(revealed.pairs)) {
      correctByLeft = {};
      revealed.pairs.forEach(function (p) { correctByLeft[p.left] = p.right; });
    }
    return '<p class="card-meta">' + esc(t('quiz.matchHint')) + '</p>' +
      lefts.map(function (leftText, i) {
        var value = response[i] || '';
        var rowClass = 'match-row';
        if (checked) {
          if (!remote) {
            rowClass += DLP.utils.normalizeArabic(value) === DLP.utils.normalizeArabic(question.pairs[i].right) ? ' is-correct' : ' is-wrong';
          } else if (correctByLeft) {
            rowClass += DLP.utils.normalizeArabic(value) === DLP.utils.normalizeArabic(correctByLeft[leftText] || '') ? ' is-correct' : ' is-wrong';
          } else {
            rowClass += graded.correct ? ' is-correct' : (value ? ' is-wrong' : '');
          }
        }
        return '<div class="' + rowClass + '">' +
          '<span class="match-left" id="ml-' + esc(question.id) + '-' + i + '">' + esc(leftText) + '</span>' +
          '<select class="match-select" data-answer="match" data-row="' + i + '"' +
            ' aria-labelledby="ml-' + esc(question.id) + '-' + i + '"' + (checked ? ' disabled' : '') + '>' +
            '<option value="">' + esc(t('quiz.choose')) + '</option>' +
            options.map(function (option) {
              return '<option value="' + esc(option) + '"' + (option === value ? ' selected' : '') + '>' + esc(option) + '</option>';
            }).join('') +
          '</select>' +
        '</div>';
      }).join('');
  }

  function renderOrder(state, question) {
    var response = state.responses[question.id] || question.items.slice();
    var checked = state.checked[question.id];
    var remote = remoteMode();
    var graded = checked ? gradedFor(state, question) : null;
    var revealed = remote && state.remote[question.id] ? state.remote[question.id].revealed : null;
    var correctItems = remote ? (revealed && Array.isArray(revealed.items) ? revealed.items : null) : question.items;
    return '<p class="card-meta">' + esc(t('quiz.orderHint')) + '</p>' +
      '<ol class="order-list">' +
        response.map(function (item, i) {
          var itemClass = 'order-item';
          if (checked) {
            if (correctItems) { itemClass += item === correctItems[i] ? ' is-correct' : ' is-wrong'; }
            else { itemClass += graded.correct ? ' is-correct' : ' is-wrong'; }
          }
          return '<li class="' + itemClass + '">' +
            '<span class="pos" aria-hidden="true">' + (i + 1) + '</span>' +
            '<span class="txt">' + esc(item) + '</span>' +
            '<span class="order-btns">' +
              '<button class="icon-btn" type="button" data-answer="order" data-move="up" data-index="' + i + '"' +
                ' aria-label="' + esc(t('quiz.moveUp')) + ': ' + esc(item) + '"' + (checked || i === 0 ? ' disabled' : '') + '>▲</button>' +
              '<button class="icon-btn" type="button" data-answer="order" data-move="down" data-index="' + i + '"' +
                ' aria-label="' + esc(t('quiz.moveDown')) + ': ' + esc(item) + '"' +
                (checked || i === response.length - 1 ? ' disabled' : '') + '>▼</button>' +
            '</span>' +
          '</li>';
        }).join('') +
      '</ol>';
  }

  function renderOpen(state, question) {
    var response = state.responses[question.id] || '';
    var checked = state.checked[question.id];
    return '<label class="visually-hidden" for="open-' + esc(question.id) + '">' + esc(t('quiz.openPlaceholder')) + '</label>' +
      '<textarea class="open-input" id="open-' + esc(question.id) + '" data-answer="open" rows="5" autocomplete="off"' +
      ' placeholder="' + esc(t('quiz.openPlaceholder')) + '"' + (checked ? ' disabled' : '') + '>' + esc(response) + '</textarea>';
  }

  var BODY_RENDERERS = { mcq: renderMcq, tf: renderTf, fill: renderFill, match: renderMatch, order: renderOrder, open: renderOpen };

  /* ------------------------- رسم الاختبار ------------------------- */

  /** معايير التقييم الذاتي لسؤال مفتوح (سيناريو/مقالي) — نقاط + كلمات مفتاحية إرشادية.
   * revealedData (الوضع القادم من القاعدة فقط، لمستخدم مسجَّل): rubric/explanation
   * تأتي منها بدل question.rubric/explanation (محجوبتان دائماً على مستوى العمود). */
  function renderRubric(question, revealedData) {
    var remote = remoteMode();
    var points = remote ? ((revealedData && revealedData.rubric) || []) : (question.rubric || []);
    var explanation = remote ? (revealedData ? revealedData.explanation : null) : question.explanation;
    if (!points.length) {
      if (remote && !revealedData) { return '<div>' + esc(t('quiz.signInToReveal')) + '</div>'; }
      return '<div><b>' + esc(t('quiz.explanation')) + ':</b> ' + esc(explanation || '') + '</div>';
    }
    return '<ol class="detail-list">' +
      points.map(function (point) {
        var keywords = point.keywords && point.keywords.length
          ? ' <span class="kw-hint">(' + esc(point.keywords.join(t('common.listSeparator'))) + ')</span>' : '';
        return '<li>' + esc(point.text) + keywords + '</li>';
      }).join('') +
    '</ol>';
  }

  function renderQuestion(state) {
    var question = current(state);
    if (!question) {
      return '<div class="empty-state"><p>' + esc(t('quiz.noneAtLevel')) + '</p></div>';
    }
    var remote = remoteMode();
    var pending = remote && state.remote[question.id] && state.remote[question.id].pending;
    var checked = state.checked[question.id];
    var isOpen = question.type === 'open';
    var graded = checked ? gradedFor(state, question) : null;
    var revealedData = remote && state.remote[question.id] ? state.remote[question.id].revealed : null;

    var feedbackClass = '';
    var feedbackBody = '';
    if (pending) {
      feedbackClass = 'info show';
      feedbackBody = '<div class="fb-title">⏳ ' + esc(t('quiz.checking')) + '</div>';
    } else if (checked) {
      if (isOpen) {
        feedbackClass = 'info show';
        feedbackBody = '<div class="fb-title">📋 ' + esc(t('quiz.openReveal')) + '</div>' + renderRubric(question, revealedData);
      } else {
        var explanationText = remote ? (revealedData && revealedData.explanation) : question.explanation;
        feedbackClass = graded.correct ? 'ok show' : 'bad show';
        feedbackBody = '<div class="fb-title">' + (graded.correct ? '✓ ' + esc(t('quiz.correct')) : '✕ ' + esc(t('quiz.wrong'))) + '</div>' +
          (graded.correct ? '' : '<div class="fb-answer">' + esc(t('quiz.correctAnswer')) + ': ' + esc(graded.correctAnswer) + '</div>') +
          (explanationText ? '<div><b>' + esc(t('quiz.explanation')) + ':</b> ' + esc(explanationText) + '</div>'
            : (remote ? '<div>' + esc(t('quiz.signInToReveal')) + '</div>' : ''));
      }
    }

    return '' +
      '<div class="q-prompt">' +
        '<span class="qnum">' + esc(t('quiz.question')) + ' ' + (state.index + 1) + '/' + state.questions.length + '</span>' +
        '<span class="badge badge-' + esc(question.difficulty || 'medium') + '">' +
          esc(t('difficulty.' + (question.difficulty || 'medium'))) + '</span>' +
        (isOpen ? '<span class="badge badge-type">' + esc(t('quiz.openTag')) + '</span>' : '') +
        '<br>' + esc(question.prompt) +
      '</div>' +
      BODY_RENDERERS[question.type](state, question) +
      '<div class="feedback ' + feedbackClass + '" role="status" aria-live="polite">' + feedbackBody + '</div>';
  }

  function renderProgress(state) {
    var score = scoreFor(state);
    var percent = state.questions.length ? Math.round((score.answered / state.questions.length) * 100) : 0;
    return '<div class="progress-meta">' +
        '<span>' + esc(t('quiz.progress')) + ': ' + score.answered + '/' + state.questions.length + '</span>' +
        '<span>' + esc(t('quiz.score')) + ': ' + score.correct + '/' + state.questions.length + '</span>' +
      '</div>' +
      '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"' +
        ' aria-label="' + esc(t('quiz.progress')) + '">' +
        '<div class="progress-fill" style="width:' + percent + '%"></div>' +
      '</div>';
  }

  function renderResult(state) {
    if (!state.finished) { return ''; }
    var score = scoreFor(state);
    return '<div class="quiz-result">' +
      '<div class="score-big">' + score.correct + ' / ' + score.total + ' (' + score.percent + esc(t('quiz.percent')) + ')</div>' +
      '<div class="score-sub">' + esc(t('quiz.result')) + '</div>' +
      '<div class="bars">' +
        '<span class="badge badge-easy">✓ ' + esc(t('quiz.correct')) + ': ' + score.correct + '</span>' +
        '<span class="badge badge-hard">✕ ' + esc(t('quiz.wrong')) + ': ' + score.wrong + '</span>' +
        '<span class="badge badge-demo">' + esc(t('quiz.questionsCount')) + ': ' + score.total + '</span>' +
      '</div>' +
      '<div style="margin-top:16px"><button class="btn btn-gold" type="button" data-quiz-action="retry">↻ ' +
        esc(t('quiz.retry')) + '</button></div>' +
    '</div>';
  }

  function renderFoot(state) {
    var question = current(state);
    var isLast = state.index === state.questions.length - 1;
    var checkLabel = question && question.type === 'open' ? t('quiz.reveal') : t('quiz.check');
    var pending = question && remoteMode() && state.remote[question.id] && state.remote[question.id].pending;
    return '' +
      '<button class="btn btn-ghost btn-sm" type="button" data-quiz-action="prev"' +
        (state.index === 0 ? ' disabled' : '') + '>→ ' + esc(t('quiz.prev')) + '</button>' +
      '<button class="btn btn-primary btn-sm" type="button" data-quiz-action="check"' +
        (!question || state.checked[question.id] || pending ? ' disabled' : '') + '>' +
        (pending ? esc(t('quiz.checking')) : esc(checkLabel)) + '</button>' +
      '<span class="spacer"></span>' +
      (isLast
        ? '<button class="btn btn-gold btn-sm" type="button" data-quiz-action="finish">' + esc(t('quiz.finish')) + '</button>'
        : '<button class="btn btn-primary btn-sm" type="button" data-quiz-action="next">' + esc(t('quiz.next')) + ' ←</button>') +
      '<button class="btn btn-ghost btn-sm" type="button" data-quiz-action="retry">↻ ' + esc(t('quiz.retry')) + '</button>';
  }

  function renderLectureFilter(state, quiz, subject) {
    var lectures = lecturesInQuiz(quiz, subject);
    if (lectures.length < 2) { return ''; }
    var options = [{ key: 'all', label: t('quiz.all') }].concat(lectures.map(function (lecture) {
      return { key: lecture.id, label: t('lecture.number') + ' ' + lecture.number, title: lecture.title };
    }));
    return '<div class="quiz-toolbar">' +
      '<span class="label">' + esc(t('quiz.filterLecture')) + ':</span>' +
      options.map(function (option) {
        return '<button class="filter-btn" type="button" data-quiz-lecture-filter="' + esc(option.key) + '"' +
          (option.title ? ' title="' + esc(option.title) + '"' : '') +
          ' aria-pressed="' + (state.lecture === option.key ? 'true' : 'false') + '">' + esc(option.label) + '</button>';
      }).join('') +
    '</div>';
  }

  function renderQuiz(quiz, subject) {
    var state = getState(quiz);
    var levels = [
      { key: 'all', label: t('quiz.all') },
      { key: 'easy', label: t('difficulty.easy') },
      { key: 'medium', label: t('difficulty.medium') },
      { key: 'hard', label: t('difficulty.hard') }
    ];
    return '' +
      '<div class="quiz" id="' + esc(quiz.id) + '" data-quiz="' + esc(quiz.id) + '">' +
        '<div class="quiz-head">' +
          '<h3>' + esc(quiz.title) + '</h3>' +
          (quiz.description ? '<p>' + esc(quiz.description) + '</p>' : '') +
        '</div>' +
        '<div data-quiz-lecture-toolbar>' + renderLectureFilter(state, quiz, subject) + '</div>' +
        '<div class="quiz-toolbar">' +
          '<span class="label">' + esc(t('quiz.filter')) + ':</span>' +
          levels.map(function (level) {
            return '<button class="filter-btn" type="button" data-quiz-filter="' + esc(level.key) + '"' +
              ' aria-pressed="' + (state.difficulty === level.key ? 'true' : 'false') + '">' + esc(level.label) + '</button>';
          }).join('') +
          '<span class="label" style="margin-inline-start:auto" data-quiz-count>' + esc(t('quiz.questionsCount')) + ': ' +
            state.questions.length + '</span>' +
          '<button class="filter-btn" type="button" data-quiz-action="clear" ' +
            'title="' + esc(t('quiz.saved')) + '">🗑️ ' + esc(t('quiz.clearProgress')) + '</button>' +
        '</div>' +
        '<div class="quiz-progress" data-quiz-progress>' + renderProgress(state) + '</div>' +
        '<div class="quiz-body" data-quiz-body>' + renderQuestion(state) + '</div>' +
        '<div class="quiz-foot" data-quiz-foot>' + renderFoot(state) + '</div>' +
        '<div data-quiz-result>' + renderResult(state) + '</div>' +
      '</div>';
  }

  function renderSection(subject) {
    var quizzes = DLP.store.list(subject, 'quizzes');
    if (!quizzes.length) {
      return '<div class="empty-state"><div class="big" aria-hidden="true">❓</div><p>' +
        esc(t('common.empty')) + '</p></div>';
    }
    return quizzes.map(function (quiz) { return renderQuiz(quiz, subject); }).join('');
  }

  /* ------------------------- التفاعل ------------------------- */

  function refresh(root, state) {
    root.querySelector('[data-quiz-progress]').innerHTML = renderProgress(state);
    root.querySelector('[data-quiz-body]').innerHTML = renderQuestion(state);
    root.querySelector('[data-quiz-foot]').innerHTML = renderFoot(state);
    root.querySelector('[data-quiz-result]').innerHTML = renderResult(state);
    var counter = root.querySelector('[data-quiz-count]');
    if (counter) { counter.textContent = t('quiz.questionsCount') + ': ' + state.questions.length; }
    Array.prototype.forEach.call(root.querySelectorAll('[data-quiz-filter]'), function (button) {
      button.setAttribute('aria-pressed', button.dataset.quizFilter === state.difficulty ? 'true' : 'false');
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-quiz-lecture-filter]'), function (button) {
      button.setAttribute('aria-pressed', button.dataset.quizLectureFilter === state.lecture ? 'true' : 'false');
    });
  }

  function stateFromEvent(subject, element) {
    var root = element.closest('[data-quiz]');
    if (!root) { return null; }
    var quiz = DLP.store.findQuiz(subject, root.dataset.quiz);
    if (!quiz) { return null; }
    return { root: root, state: getState(quiz), quiz: quiz };
  }

  function bind(subject) {
    var panel = document.getElementById('sectionPanel');
    if (!panel) { return; }

    panel.addEventListener('click', function (event) {
      var target = event.target.closest('[data-quiz-action],[data-quiz-filter],[data-quiz-lecture-filter],[data-answer]');
      if (!target) { return; }
      var context = stateFromEvent(subject, target);
      if (!context) { return; }
      var state = context.state;
      var question = current(state);

      if (target.hasAttribute('data-quiz-filter')) {
        state.difficulty = target.dataset.quizFilter;
        state.questions = applyFilters(context.quiz.questions, state.difficulty, state.lecture);
        state.index = 0;
        state.finished = false;
        save(state);
        refresh(context.root, state);
        return;
      }

      if (target.hasAttribute('data-quiz-lecture-filter')) {
        state.lecture = target.dataset.quizLectureFilter;
        state.questions = applyFilters(context.quiz.questions, state.difficulty, state.lecture);
        state.index = 0;
        state.finished = false;
        save(state);
        refresh(context.root, state);
        return;
      }

      if (target.hasAttribute('data-quiz-action')) {
        var action = target.dataset.quizAction;
        if (action === 'next' && state.index < state.questions.length - 1) { state.index += 1; }
        else if (action === 'prev' && state.index > 0) { state.index -= 1; }
        else if (action === 'check' && question) {
          if (remoteMode()) {
            checkRemote(context.quiz, question, state, context.root); // غير متزامن — يحفظ/يرسم بنفسه
          } else {
            state.checked[question.id] = true;
            persistAnswer(context.quiz, question, state.responses[question.id]);
          }
        }
        else if (action === 'finish') { state.finished = true; persistFinish(context.quiz); }
        var wiped = false;
        if (action === 'retry' || action === 'clear') {
          var difficulty = action === 'clear' ? 'all' : state.difficulty;
          var lecture = action === 'clear' ? 'all' : state.lecture;
          clearSaved(context.quiz.id);
          discardAttempt(context.quiz.id); // محاولة خادمية جديدة تبدأ مع إجابة جديدة، لا استكمال القديمة
          states[context.quiz.id] = createState(context.quiz);
          states[context.quiz.id].difficulty = difficulty;
          states[context.quiz.id].lecture = lecture;
          states[context.quiz.id].questions = applyFilters(context.quiz.questions, difficulty, lecture);
          state = states[context.quiz.id];
          wiped = true;   // لا نُعيد الكتابة فوراً: التخزين يبقى نظيفاً حتى إجابة جديدة
        }
        if (!wiped) { save(state); }
        refresh(context.root, state);
        if (action === 'finish') { context.root.querySelector('[data-quiz-result]').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }

      // اختيار إجابة
      var isPending = remoteMode() && state.remote[question.id] && state.remote[question.id].pending;
      if (!question || state.checked[question.id] || isPending) { return; }
      var kind = target.dataset.answer;
      if (kind === 'mcq') { state.responses[question.id] = Number(target.dataset.value); }
      else if (kind === 'tf') { state.responses[question.id] = target.dataset.value; }
      else if (kind === 'order') {
        var order = (state.responses[question.id] || question.items.slice()).slice();
        var index = Number(target.dataset.index);
        var swapWith = target.dataset.move === 'up' ? index - 1 : index + 1;
        if (swapWith >= 0 && swapWith < order.length) {
          var tmp = order[index]; order[index] = order[swapWith]; order[swapWith] = tmp;
          state.responses[question.id] = order;
        }
      } else { return; }
      save(state);
      refresh(context.root, state);
    });

    panel.addEventListener('input', function (event) {
      var target = event.target;
      if (target.dataset && (target.dataset.answer === 'fill' || target.dataset.answer === 'open')) {
        var context = stateFromEvent(subject, target);
        if (!context) { return; }
        var question = current(context.state);
        if (question) { context.state.responses[question.id] = target.value; }
        save(context.state);
        context.root.querySelector('[data-quiz-progress]').innerHTML = renderProgress(context.state);
      }
    });

    panel.addEventListener('change', function (event) {
      var target = event.target;
      if (target.dataset && target.dataset.answer === 'match') {
        var context = stateFromEvent(subject, target);
        if (!context) { return; }
        var question = current(context.state);
        if (!question) { return; }
        var answers = (context.state.responses[question.id] || []).slice();
        answers[Number(target.dataset.row)] = target.value;
        context.state.responses[question.id] = answers;
        save(context.state);
        context.root.querySelector('[data-quiz-progress]').innerHTML = renderProgress(context.state);
      }
    });
  }

  DLP.quizView = {
    renderSection: renderSection, renderQuiz: renderQuiz, bind: bind,
    resetStates: resetStates, clearSaved: clearSaved,
    /** للاختبارات فقط — لا يُستخدم من أي مكوّن آخر. */
    __test: {
      canPersist: canPersist, toServerResponse: toServerResponse, discardAttempt: discardAttempt,
      persistAnswer: persistAnswer, persistFinish: persistFinish, ensureAttempt: ensureAttempt,
      remoteMode: remoteMode, checkRemote: checkRemote, gradedFor: gradedFor,
      correctAnswerFromRevealed: correctAnswerFromRevealed, remoteScore: remoteScore,
      scoreFor: scoreFor, createState: createState, getState: getState, refresh: refresh
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
