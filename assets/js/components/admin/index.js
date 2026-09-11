/* سقالة الإدارة (Stage 4) — هيكل قراءة فقط لقوائم المواد والاختبارات.
 * لا نماذج تحرير أو حذف في هذه المرحلة — الكتابة تبقى محكومة بالكامل عبر RLS
 * (content_write_admin/questions_write_admin/... في supabase/migrations/002_rls.sql)
 * وستُضاف واجهتها في مرحلة لاحقة. الحماية الفعلية دائماً على مستوى القاعدة؛ فحص
 * الدور هنا (isAdminOrInstructor) تحسين تجربة استخدام فقط، لا حدود أمان بذاته. */
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

  function renderSubjectsOverview() {
    var subjects = DLP.store.subjects();
    return '<section class="prose-card">' +
      '<h2>' + esc(t('admin.subjectsTitle')) + '</h2>' +
      '<table class="data-table">' +
        '<thead><tr>' +
          '<th>' + esc(t('common.subject')) + '</th>' +
          '<th>' + esc(t('admin.quizzesTitle')) + '</th>' +
        '</tr></thead>' +
        '<tbody>' +
          subjects.map(function (subject) {
            var quizzes = DLP.store.list(subject, 'quizzes');
            return '<tr>' +
              '<td>' + esc(subject.title) + '</td>' +
              '<td>' +
                (quizzes.length
                  ? quizzes.map(function (quiz) {
                      return '<a class="btn btn-ghost btn-sm" style="margin:2px" href="#/admin/quiz/' + esc(quiz.id) + '">' +
                        esc(quiz.title) + ' — ' + esc(t('admin.viewQuestions')) +
                      '</a>';
                    }).join('')
                  : '—') +
              '</td>' +
            '</tr>';
          }).join('') +
        '</tbody>' +
      '</table>' +
    '</section>';
  }

  function render() {
    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('admin.title') }]) +
      '<section class="subject-hero" style="margin-top:14px">' +
        '<h1>🛠️ ' + esc(t('admin.title')) + '</h1>' +
        '<p>' + esc(t('admin.intro')) + '</p>' +
        '<ul class="chips"><li class="chip badge-soon">' + esc(t('admin.readOnlyNotice')) + '</li></ul>' +
      '</section>' +
      '<div data-admin-body>' +
        (!isAuthAvailable() ? renderNotAvailable() : (currentUser ? renderLoading() : renderSignInPrompt())) +
      '</div>' +
      DLP.layout.endActions() +
    '</div>';
  }

  function refresh(root) {
    var body = root.querySelector('[data-admin-body]');
    if (!body) { return; }
    if (!isAuthAvailable()) { body.innerHTML = renderNotAvailable(); return; }
    if (!currentUser) { body.innerHTML = renderSignInPrompt(); return; }
    body.innerHTML = renderLoading();
    DLP.api.isAdminOrInstructor().then(function (isAdmin) {
      body.innerHTML = isAdmin ? renderSubjectsOverview() : renderAccessDenied();
    }).catch(function () {
      body.innerHTML = renderError();
    });
  }

  function bind() {
    var root = document.getElementById('main');
    if (!root) { return; }
    refresh(root);

    root.addEventListener('click', function (event) {
      var target = event.target.closest('[data-admin-action]');
      if (!target) { return; }
      var action = target.dataset.adminAction;
      if (action === 'sign-in' && DLP.auth) {
        target.disabled = true;
        DLP.auth.signInWithGoogle().catch(function () { target.disabled = false; });
      } else if (action === 'retry') {
        refresh(root);
      }
    });
  }

  DLP.adminView = {
    render: render, bind: bind,
    /** للاختبارات فقط. */
    __test: { isAuthAvailable: isAuthAvailable, setCurrentUser: function (user) { currentUser = user; } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
