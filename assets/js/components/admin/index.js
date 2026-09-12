/* لوحة الإدارة — إدارة كاملة (CRUD) للمواد + مركز روابط لكل مادة نحو مديري
 * محتواها الفرعي (محاضرات/ملخصات/واجبات/اختبارات/مراجع/موارد/تحديثات).
 * الحماية الفعلية دائماً في سياسات RLS *_write_admin (002_rls.sql) —
 * isAdminOrInstructor() هنا تحسين تجربة استخدام فقط. */
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

  var editingId = null;
  var message = null;

  /* ---------------------------------------------------------------------- */
  /* قائمة المواد (CRUD + إعادة ترتيب)                                      */
  /* ---------------------------------------------------------------------- */

  var SUBJECT_FIELDS = [
    { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
    { name: 'short_title', labelKey: 'admin.field.shortTitle', type: 'text' },
    { name: 'icon', labelKey: 'admin.field.icon', type: 'text' },
    { name: 'accent', labelKey: 'admin.field.accent', type: 'text' },
    { name: 'description', labelKey: 'admin.field.description', type: 'textarea' }
  ];

  function renderSubjectFormRow(row) {
    var isNew = !row;
    var idField = isNew
      ? shared.textField('id', t('admin.field.id'), '', { required: true, hint: t('admin.field.idHint') })
      : '<div class="admin-field"><span>' + esc(t('admin.field.id')) + '</span><code>' + esc(row.id) + '</code></div>';
    return '<tr><td colspan="4">' +
      '<form class="admin-form" data-crud-form data-id="' + esc(isNew ? '' : row.id) + '">' +
        idField +
        SUBJECT_FIELDS.map(function (f) {
          var value = row ? row[f.name] : '';
          return f.type === 'textarea' ? shared.textareaField(f.name, t(f.labelKey), value)
            : shared.textField(f.name, t(f.labelKey), value, { required: f.required });
        }).join('') +
        shared.statusField(row ? row.status : 'draft') +
        '<div class="admin-form-actions">' +
          '<button class="btn btn-primary btn-sm" type="submit">' + esc(t('admin.action.save')) + '</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="cancel">' + esc(t('admin.action.cancel')) + '</button>' +
        '</div>' +
      '</form>' +
    '</td></tr>';
  }

  function renderSubjectRow(row, index, total) {
    if (editingId === row.id) { return renderSubjectFormRow(row); }
    return '<tr>' +
      '<td>' + esc(row.title) + '</td>' +
      '<td>' + esc(t('admin.status.' + (row.status || 'draft'))) + '</td>' +
      '<td class="admin-row-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="up" data-id="' + esc(row.id) + '"' + (index === 0 ? ' disabled' : '') + '>↑ ' + esc(t('admin.action.moveUp')) + '</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="down" data-id="' + esc(row.id) + '"' + (index === total - 1 ? ' disabled' : '') + '>↓ ' + esc(t('admin.action.moveDown')) + '</button>' +
      '</td>' +
      '<td class="admin-row-actions">' +
        '<a class="btn btn-gold btn-sm" href="#/admin/subject/' + esc(row.id) + '">🗂️ ' + esc(t('admin.action.manage')) + '</a>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="edit" data-id="' + esc(row.id) + '">✎ ' + esc(t('admin.action.edit')) + '</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="delete" data-id="' + esc(row.id) + '">🗑 ' + esc(t('admin.action.delete')) + '</button>' +
      '</td>' +
    '</tr>';
  }

  function renderMessage() {
    if (!message) { return ''; }
    return '<div class="admin-inline-message ' + (message.kind === 'ok' ? 'ok' : 'bad') + '">' + esc(message.text) + '</div>';
  }

  function renderSubjectsOverview(subjects) {
    return '<section class="prose-card">' +
      '<h2>' + esc(t('admin.subjectsTitle')) + '</h2>' +
      renderMessage() +
      (editingId === 'new' ? '<table class="data-table"><tbody>' + renderSubjectFormRow(null) + '</tbody></table>' :
        '<p><button class="btn btn-gold btn-sm" type="button" data-crud-action="add">+ ' + esc(t('admin.action.add')) + '</button></p>') +
      (subjects.length
        ? '<table class="data-table"><tbody>' + subjects.map(function (s, i) { return renderSubjectRow(s, i, subjects.length); }).join('') + '</tbody></table>'
        : '<div class="empty-state"><p>' + esc(t('admin.emptyList')) + '</p></div>') +
    '</section>';
  }

  function render() {
    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('admin.title') }]) +
      '<section class="subject-hero" style="margin-top:14px">' +
        '<h1>🛠️ ' + esc(t('admin.title')) + '</h1>' +
        '<p>' + esc(t('admin.intro')) + '</p>' +
      '</section>' +
      '<div data-admin-body>' +
        (!shared.isAuthAvailable() ? shared.renderNotAvailable() : (currentUser ? shared.renderLoading() : shared.renderSignInPrompt())) +
      '</div>' +
      DLP.layout.endActions() +
    '</div>';
  }

  function refresh(root) {
    var body = root.querySelector('[data-admin-body]');
    if (!body) { return; }
    if (!shared.isAuthAvailable()) { body.innerHTML = shared.renderNotAvailable(); return; }
    if (!currentUser) { body.innerHTML = shared.renderSignInPrompt(); return; }
    body.innerHTML = shared.renderLoading();
    DLP.api.isAdminOrInstructor().then(function (isAdmin) {
      if (!isAdmin) { body.innerHTML = shared.renderAccessDenied(); return; }
      return DLP.api.adminList('subjects', {}, 'order').then(function (subjects) {
        body.innerHTML = renderSubjectsOverview(subjects || []);
      });
    }).catch(function () {
      body.innerHTML = shared.renderError();
    });
  }

  function collectSubjectPayload(form) {
    var raw = shared.formToObject(form);
    var payload = { status: raw.status };
    if (raw.id) { payload.id = raw.id; }
    SUBJECT_FIELDS.forEach(function (f) { payload[f.name] = raw[f.name] || null; });
    return payload;
  }

  function moveSubject(subjects, id, direction) {
    var ids = subjects.map(function (s) { return s.id; });
    var index = ids.indexOf(id);
    var swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ids.length) { return ids; }
    var tmp = ids[index]; ids[index] = ids[swapWith]; ids[swapWith] = tmp;
    return ids;
  }

  function bind() {
    var root = document.getElementById('main');
    if (!root) { return; }
    refresh(root);
    shared.bindCommonActions(root, function () { refresh(root); });

    root.addEventListener('click', function (event) {
      var addBtn = event.target.closest('[data-crud-action="add"]');
      if (addBtn) { editingId = 'new'; message = null; refresh(root); return; }
      var cancelBtn = event.target.closest('[data-crud-action="cancel"]');
      if (cancelBtn) { editingId = null; refresh(root); return; }
      var editBtn = event.target.closest('[data-crud-action="edit"]');
      if (editBtn) { editingId = editBtn.dataset.id; message = null; refresh(root); return; }

      var moveBtn = event.target.closest('[data-crud-action="up"],[data-crud-action="down"]');
      if (moveBtn) {
        var direction = moveBtn.dataset.crudAction === 'up' ? -1 : 1;
        DLP.api.adminList('subjects', {}, 'order').then(function (subjects) {
          var orderedIds = moveSubject(subjects, moveBtn.dataset.id, direction);
          return DLP.api.adminReorder('subjects', 'order', orderedIds);
        }).then(function () { refresh(root); }).catch(function () {
          message = { kind: 'bad', text: t('admin.saveError') };
          refresh(root);
        });
        return;
      }

      var deleteBtn = event.target.closest('[data-crud-action="delete"]');
      if (deleteBtn) {
        var id = deleteBtn.dataset.id;
        var checks = ['lectures', 'summaries', 'assignments', 'quizzes', 'references', 'resources', 'updates'];
        Promise.all(checks.map(function (tbl) { return DLP.api.adminCountReferences(tbl, 'subject_id', id); }))
          .then(function (counts) {
            var total = counts.reduce(function (a, b) { return a + b; }, 0);
            if (total > 0) {
              message = { kind: 'bad', text: t('admin.deleteBlockedByChildren') + ' ' + total };
              refresh(root);
              return;
            }
            if (!global.confirm(t('admin.confirmDelete'))) { return; }
            return DLP.api.adminDelete('subjects', id).then(function () {
              message = { kind: 'ok', text: t('admin.deleteSuccess') };
              refresh(root);
            }).catch(function () {
              message = { kind: 'bad', text: t('admin.deleteError') };
              refresh(root);
            });
          });
      }
    });

    root.addEventListener('submit', function (event) {
      var form = event.target.closest('[data-crud-form]');
      if (!form) { return; }
      event.preventDefault();
      var id = form.dataset.id;
      var payload = collectSubjectPayload(form);
      var promise = id ? DLP.api.adminUpdate('subjects', id, payload) : DLP.api.adminInsert('subjects', payload);
      promise.then(function () {
        message = { kind: 'ok', text: t('admin.saveSuccess') };
        editingId = null;
        refresh(root);
      }).catch(function () {
        message = { kind: 'bad', text: t('admin.saveError') };
        refresh(root);
      });
    });
  }

  DLP.adminView = {
    render: render, bind: bind,
    /** للاختبارات فقط. */
    __test: {
      isAuthAvailable: shared.isAuthAvailable, setCurrentUser: function (user) { currentUser = user; },
      collectSubjectPayload: collectSubjectPayload, moveSubject: moveSubject, renderSubjectRow: renderSubjectRow
    }
  };

  /* ---------------------------------------------------------------------- */
  /* مركز روابط مادة واحدة نحو مديري محتواها الفرعي                          */
  /* ---------------------------------------------------------------------- */

  var HUB_SECTIONS = [
    { key: 'lectures', labelKey: 'admin.hub.lectures', icon: '📚' },
    { key: 'summaries', labelKey: 'admin.hub.summaries', icon: '📝' },
    { key: 'assignments', labelKey: 'admin.hub.assignments', icon: '📋' },
    { key: 'quizzes', labelKey: 'admin.hub.quizzes', icon: '❓' },
    { key: 'references', labelKey: 'admin.hub.references', icon: '📖' },
    { key: 'resources', labelKey: 'admin.hub.resources', icon: '🔗' },
    { key: 'updates', labelKey: 'admin.hub.updates', icon: '📣' },
    { key: 'files', labelKey: 'admin.hub.files', icon: '📎' }
  ];

  function renderHubBody(subjectId, subjectRow) {
    return '<section class="prose-card">' +
      '<p><a class="btn btn-ghost btn-sm" href="#/admin">← ' + esc(t('admin.backToSubjects')) + '</a></p>' +
      '<h2>' + esc(subjectRow ? subjectRow.title : subjectId) + '</h2>' +
      '<div class="admin-hub-grid">' +
        HUB_SECTIONS.map(function (s) {
          return '<a class="admin-hub-card" href="#/admin/subject/' + esc(subjectId) + '/' + esc(s.key) + '">' +
            '<span>' + s.icon + ' ' + esc(t(s.labelKey)) + '</span><span aria-hidden="true">←</span>' +
          '</a>';
        }).join('') +
      '</div>' +
    '</section>';
  }

  function renderHub() {
    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('admin.title'), href: '#/admin' }]) +
      '<section class="subject-hero" style="margin-top:14px"><h1>🛠️ ' + esc(t('admin.title')) + '</h1></section>' +
      '<div data-admin-body>' +
        (!shared.isAuthAvailable() ? shared.renderNotAvailable() : (currentUser ? shared.renderLoading() : shared.renderSignInPrompt())) +
      '</div>' +
      DLP.layout.endActions() +
    '</div>';
  }

  function refreshHub(root, subjectId) {
    var body = root.querySelector('[data-admin-body]');
    if (!body) { return; }
    if (!shared.isAuthAvailable()) { body.innerHTML = shared.renderNotAvailable(); return; }
    if (!currentUser) { body.innerHTML = shared.renderSignInPrompt(); return; }
    body.innerHTML = shared.renderLoading();
    DLP.api.isAdminOrInstructor().then(function (isAdmin) {
      if (!isAdmin) { body.innerHTML = shared.renderAccessDenied(); return; }
      return DLP.api.adminList('subjects', { id: subjectId }, null).then(function (rows) {
        body.innerHTML = renderHubBody(subjectId, (rows && rows[0]) || null);
      });
    }).catch(function () {
      body.innerHTML = shared.renderError();
    });
  }

  function bindHub(subjectId) {
    var root = document.getElementById('main');
    if (!root) { return; }
    refreshHub(root, subjectId);
    shared.bindCommonActions(root, function () { refreshHub(root, subjectId); });
  }

  DLP.adminSubjectHubView = { render: renderHub, bind: bindHub };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminView; }
})(typeof window !== 'undefined' ? window : globalThis);
