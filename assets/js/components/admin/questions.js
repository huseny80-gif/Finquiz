/* سقالة الإدارة (Stage 4) — عرض أسئلة اختبار واحد كاملة الأعمدة (بما فيها
 * الإجابات) للمشرفين/المدرّسين فقط، عبر admin_get_quiz_questions RPC. قراءة
 * فقط بالكامل — لا نموذج تحرير أو حذف في هذه المرحلة. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  var currentUser = null;
  if (DLP.auth && typeof DLP.auth.onChange === 'function') {
    DLP.auth.onChange(function (user) { currentUser = user; });
  }

  function isAuthAvailable() { return !!DLP.auth && typeof DLP.auth.isAvailable === 'function' && DLP.auth.isAvailable(); }

  function renderNotAvailable() {
    return '<div class="soon-card">' +
      '<div class="big" aria-hidden="true">🛠️</div>' +
      '<span class="badge badge-soon" style="margin-bottom:10px">' + esc(t('common.demoFeature')) + '</span>' +
      '<h2>' + esc(t('admin.title')) + ' — ' + esc(t('common.comingSoon')) + '</h2>' +
      '<p>' + esc(t('admin.notAvailableHint')) + '</p>' +
    '</div>';
  }

  function renderSignInPrompt() {
    return '<div class="soon-card">' +
      '<div class="big" aria-hidden="true">🔐</div>' +
      '<p>' + esc(t('admin.signInPrompt')) + '</p>' +
      '<button class="btn btn-primary" type="button" data-admin-action="sign-in">🔓 ' + esc(t('dashboard.signInGoogle')) + '</button>' +
    '</div>';
  }

  function renderAccessDenied() {
    return '<div class="empty-state"><p>' + esc(t('admin.accessDenied')) + '</p></div>';
  }

  function renderLoading() {
    return '<div class="empty-state"><p>' + esc(t('admin.loading')) + '</p></div>';
  }

  function renderError() {
    return '<div class="empty-state">' +
      '<p>' + esc(t('admin.error')) + '</p>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-admin-action="retry">↻ ' + esc(t('dashboard.retry')) + '</button>' +
    '</div>';
  }

  /** يبني عرض "الإجابة الصحيحة" المقروء لكل نوع سؤال من الصف الكامل الذي
   * تُعيده admin_get_quiz_questions (نفس منطق core/quiz.js#correctAnswerOf
   * لكن على بيانات قادمة من القاعدة بدل data/subjects/*.js). */
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

  function renderQuestionRow(question) {
    return '<tr>' +
      '<td>' + esc(question.id) + '</td>' +
      '<td>' + esc(question.type) + '</td>' +
      '<td>' + esc(question.prompt) + '</td>' +
      '<td>' + renderOptionsCell(question) + '</td>' +
      '<td>' + esc(correctAnswerLabel(question)) + '</td>' +
    '</tr>';
  }

  function renderQuestionsTable(quizId, questions) {
    return '<section class="prose-card">' +
      '<p><a class="btn btn-ghost btn-sm" href="#/admin">← ' + esc(t('admin.backToSubjects')) + '</a></p>' +
      '<h2>' + esc(t('admin.questionsTitle')) + ' — ' + esc(quizId) + '</h2>' +
      (questions.length
        ? '<table class="data-table"><thead><tr>' +
            '<th>ID</th><th>' + esc(t('admin.questionType')) + '</th><th>' + esc(t('quiz.question')) + '</th>' +
            '<th>' + esc(t('admin.questionOptions')) + '</th><th>' + esc(t('admin.questionAnswer')) + '</th>' +
          '</tr></thead><tbody>' + questions.map(renderQuestionRow).join('') + '</tbody></table>'
        : '<div class="empty-state"><p>' + esc(t('common.empty')) + '</p></div>') +
    '</section>';
  }

  function render() {
    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('admin.title'), href: '#/admin' }, { label: t('admin.questionsTitle') }]) +
      '<section class="subject-hero" style="margin-top:14px">' +
        '<h1>🛠️ ' + esc(t('admin.questionsTitle')) + '</h1>' +
        '<ul class="chips"><li class="chip badge-soon">' + esc(t('admin.readOnlyNotice')) + '</li></ul>' +
      '</section>' +
      '<div data-admin-body>' +
        (!isAuthAvailable() ? renderNotAvailable() : (currentUser ? renderLoading() : renderSignInPrompt())) +
      '</div>' +
      DLP.layout.endActions() +
    '</div>';
  }

  function refresh(root, quizId) {
    var body = root.querySelector('[data-admin-body]');
    if (!body) { return; }
    if (!isAuthAvailable()) { body.innerHTML = renderNotAvailable(); return; }
    if (!currentUser) { body.innerHTML = renderSignInPrompt(); return; }
    body.innerHTML = renderLoading();
    DLP.api.isAdminOrInstructor().then(function (isAdmin) {
      if (!isAdmin) { body.innerHTML = renderAccessDenied(); return; }
      return DLP.api.fetchQuizQuestionsAdmin(quizId).then(function (questions) {
        body.innerHTML = renderQuestionsTable(quizId, questions || []);
      });
    }).catch(function () {
      body.innerHTML = renderError();
    });
  }

  function bind(quizId) {
    var root = document.getElementById('main');
    if (!root) { return; }
    refresh(root, quizId);

    root.addEventListener('click', function (event) {
      var target = event.target.closest('[data-admin-action]');
      if (!target) { return; }
      var action = target.dataset.adminAction;
      if (action === 'sign-in' && DLP.auth) {
        target.disabled = true;
        DLP.auth.signInWithGoogle().catch(function () { target.disabled = false; });
      } else if (action === 'retry') {
        refresh(root, quizId);
      }
    });
  }

  DLP.adminQuestionsView = {
    render: render, bind: bind,
    /** للاختبارات فقط. */
    __test: { correctAnswerLabel: correctAnswerLabel, renderQuestionRow: renderQuestionRow }
  };
})(typeof window !== 'undefined' ? window : globalThis);
