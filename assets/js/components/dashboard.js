/* لوحة الطالب — تقدّم حقيقي محسوب من quiz_attempts/quiz_answers، لا رقم ثابت.
 * تتطلّب تسجيل دخول (Google عبر Supabase Auth)؛ التصفح العام لبقية الموقع لا يتأثر
 * إطلاقاً بغياب حساب. حين تكون القراءة الحية معطَّلة (enabled:false في
 * data/config/supabase.js) تُعرض حالة "قريباً" بدل أي محاولة اتصال. */
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

  function formatTimestamp(value) {
    if (!value) { return ''; }
    return DLP.utils.formatDate(String(value).slice(0, 10));
  }

  /** يبحث عن عنوان اختبار ومادته عبر كل المواد المنشورة (بنك صغير، بحث مباشر كافٍ). */
  function findQuizContext(quizId) {
    var subjects = DLP.store.subjects();
    for (var i = 0; i < subjects.length; i++) {
      var quiz = DLP.store.findQuiz(subjects[i], quizId);
      if (quiz) { return { quiz: quiz, subject: subjects[i] }; }
    }
    return null;
  }

  function renderNotAvailable() {
    return '<div class="soon-card">' +
      '<div class="big" aria-hidden="true">📊</div>' +
      '<span class="badge badge-soon" style="margin-bottom:10px">' + esc(t('common.demoFeature')) + '</span>' +
      '<h2>' + esc(t('nav.dashboard')) + ' — ' + esc(t('common.comingSoon')) + '</h2>' +
      '<p>' + esc(t('dashboard.notAvailableHint')) + '</p>' +
    '</div>';
  }

  function renderSignInPrompt() {
    return '<div class="soon-card">' +
      '<div class="big" aria-hidden="true">🔐</div>' +
      '<p>' + esc(t('dashboard.signInPrompt')) + '</p>' +
      '<button class="btn btn-primary" type="button" data-dashboard-action="sign-in">' +
        '🔓 ' + esc(t('dashboard.signInGoogle')) +
      '</button>' +
    '</div>';
  }

  function renderLoading() {
    return '<div class="empty-state"><p>' + esc(t('dashboard.loading')) + '</p></div>';
  }

  function renderError() {
    return '<div class="empty-state">' +
      '<p>' + esc(t('dashboard.error')) + '</p>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-dashboard-action="retry">↻ ' + esc(t('dashboard.retry')) + '</button>' +
    '</div>';
  }

  function renderProgressCard(row) {
    var subject = DLP.store.getSubject(row.subject_id);
    var title = subject ? subject.title : row.subject_id;
    var href = subject ? '#/subject/' + esc(subject.id) + '/quizzes' : null;
    var bestScore = (row.best_score_percent === null || row.best_score_percent === undefined)
      ? '—' : Math.round(row.best_score_percent) + t('quiz.percent');
    return '<div class="progress-card">' +
      '<h3>' + (href ? '<a href="' + href + '">' + esc(title) + '</a>' : esc(title)) + '</h3>' +
      '<ul class="detail-list">' +
        '<li><b>' + esc(t('dashboard.quizzesCompleted')) + ':</b> ' + (row.quizzes_completed || 0) + '</li>' +
        '<li><b>' + esc(t('dashboard.bestScore')) + ':</b> ' + bestScore + '</li>' +
        '<li><b>' + esc(t('dashboard.lastActivity')) + ':</b> ' + esc(formatTimestamp(row.last_activity_at) || '—') + '</li>' +
      '</ul>' +
    '</div>';
  }

  function renderAttemptRow(attempt) {
    var context = findQuizContext(attempt.quiz_id);
    var quizTitle = context ? context.quiz.title : attempt.quiz_id;
    var statusKey = 'dashboard.status.' + (attempt.status || 'in_progress');
    var score = attempt.status === 'completed' && attempt.score_percent !== null && attempt.score_percent !== undefined
      ? Math.round(attempt.score_percent) + t('quiz.percent') : '—';
    return '<tr>' +
      '<td>' + esc(quizTitle) + '</td>' +
      '<td>' + esc(formatTimestamp(attempt.started_at)) + '</td>' +
      '<td>' + esc(t(statusKey, attempt.status)) + '</td>' +
      '<td>' + esc(score) + '</td>' +
    '</tr>';
  }

  function renderDashboardContent(progressRows, attempts) {
    var progressHtml = progressRows.length
      ? '<div class="progress-cards">' + progressRows.map(renderProgressCard).join('') + '</div>'
      : '<div class="empty-state"><p>' + esc(t('dashboard.noProgressYet')) + '</p></div>';

    var attemptsHtml = '';
    if (attempts.length) {
      attemptsHtml = '<section class="prose-card">' +
        '<h2>' + esc(t('dashboard.attemptsTitle')) + '</h2>' +
        '<table class="data-table">' +
          '<thead><tr>' +
            '<th>' + esc(t('section.quizzes')) + '</th>' +
            '<th>' + esc(t('dashboard.attemptDate')) + '</th>' +
            '<th>' + esc(t('dashboard.attemptStatus')) + '</th>' +
            '<th>' + esc(t('dashboard.attemptScore')) + '</th>' +
          '</tr></thead>' +
          '<tbody>' + attempts.map(renderAttemptRow).join('') + '</tbody>' +
        '</table>' +
      '</section>';
    }

    return '<section class="prose-card">' +
        '<h2>' + esc(t('dashboard.progressTitle')) + '</h2>' +
        progressHtml +
      '</section>' +
      attemptsHtml;
  }

  function renderSignedInHeader(user) {
    var name = (user && (user.user_metadata && user.user_metadata.full_name || user.email)) || '';
    return '<div class="dashboard-account">' +
      '<span>' + esc(t('dashboard.signedInAs')) + (name ? ': ' + esc(name) : '') + '</span>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-dashboard-action="sign-out">' + esc(t('dashboard.signOut')) + '</button>' +
    '</div>';
  }

  function render() {
    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('nav.dashboard') }]) +
      '<section class="subject-hero" style="margin-top:14px">' +
        '<h1>📊 ' + esc(t('nav.dashboard')) + '</h1>' +
        '<p>' + esc(t('dashboard.intro')) + '</p>' +
      '</section>' +
      '<div data-dashboard-account></div>' +
      '<div data-dashboard-body>' +
        (!isAuthAvailable() ? renderNotAvailable() : (currentUser ? renderLoading() : renderSignInPrompt())) +
      '</div>' +
      DLP.layout.endActions() +
    '</div>';
  }

  function loadAndRenderBody(root) {
    var body = root.querySelector('[data-dashboard-body]');
    if (!body) { return; }
    body.innerHTML = renderLoading();
    Promise.all([
      DLP.api.fetchStudentProgress(currentUser.id),
      DLP.api.fetchMyAttempts(currentUser.id)
    ]).then(function (results) {
      body.innerHTML = renderDashboardContent(results[0] || [], (results[1] || []).slice(0, 10));
    }).catch(function () {
      body.innerHTML = renderError();
    });
  }

  function refresh(root) {
    var accountSlot = root.querySelector('[data-dashboard-account]');
    if (accountSlot) { accountSlot.innerHTML = currentUser ? renderSignedInHeader(currentUser) : ''; }
    var body = root.querySelector('[data-dashboard-body]');
    if (!body) { return; }
    if (!isAuthAvailable()) { body.innerHTML = renderNotAvailable(); return; }
    if (!currentUser) { body.innerHTML = renderSignInPrompt(); return; }
    loadAndRenderBody(root);
  }

  function bind() {
    var root = document.getElementById('main');
    if (!root) { return; }
    refresh(root);

    root.addEventListener('click', function (event) {
      var target = event.target.closest('[data-dashboard-action]');
      if (!target) { return; }
      var action = target.dataset.dashboardAction;
      if (action === 'sign-in' && DLP.auth) {
        target.disabled = true;
        DLP.auth.signInWithGoogle().catch(function () { target.disabled = false; });
      } else if (action === 'sign-out' && DLP.auth) {
        DLP.auth.signOut().then(function () { currentUser = null; refresh(root); });
      } else if (action === 'retry') {
        refresh(root);
      }
    });
  }

  DLP.dashboardView = {
    render: render, bind: bind,
    /** للاختبارات فقط — لا يُستخدم من أي مكوّن آخر. */
    __test: {
      isAuthAvailable: isAuthAvailable, formatTimestamp: formatTimestamp, findQuizContext: findQuizContext,
      renderProgressCard: renderProgressCard, renderAttemptRow: renderAttemptRow,
      setCurrentUser: function (user) { currentUser = user; }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
