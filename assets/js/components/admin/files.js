/* إدارة ملفات مادة واحدة — عرض/رفع/ربط/حذف صفوف جدول files. ليست مبنية على
 * مصنع admin/crud-page.js (خلافاً لبقية الكيانات المسطّحة) لأن files تحتاج
 * سلوكاً مختلفاً جوهرياً عند الإنشاء: إمّا رفع ملف فعلي إلى Storage (عبر
 * DLP.api.adminUploadFile) أو إدخال رابط (external_url)، لا نموذج حقول
 * مسطّح واحد. كل الحماية الفعلية تبقى في سياسات RLS (storage.objects
 * وfiles) — هذا الملف عرض واستدعاء فقط، تماماً كبقية admin/*.js.
 *
 * قرار نطاق متعمَّد: لا إعادة رفع/تبديل نمط ملف موجود بعد إنشائه (يتطلّب حذف
 * كائن Storage القديم يدوياً أولاً) — يطابق سابقة "لا تغيير نوع سؤال بعد
 * إنشائه" في admin/questions.js. التعديل يقتصر على تسمية/نوع/حالة/ربط. */
(function (global) {
  'use strict';
  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };
  var shared = DLP.adminShared;

  var FILE_TYPE_OPTIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'image', 'video', 'link'];

  /** target_type يحدّد أي عمود من lecture_id/summary_id/assignment_id يُملأ —
   * حقل نصّي حرّ لقيمته (نفس سابقة lecture_id في admin/summaries.js) بدل قائمة
   * منسدلة حيّة؛ معرّف خاطئ يُرفَض بوضوح من قيد المفتاح الأجنبي عند الحفظ. */
  var TARGET_TYPES = ['lecture_id', 'summary_id', 'assignment_id'];

  /** الفئة/المجلّد داخل Bucket course-files تُشتقّ تلقائياً من نوع الربط —
   * مطابقة تماماً لـ STORAGE_CATEGORIES في core/api.js. */
  function deriveCategory(targetType) {
    if (targetType === 'lecture_id') { return 'lectures'; }
    if (targetType === 'summary_id') { return 'summaries'; }
    if (targetType === 'assignment_id') { return 'assignments'; }
    return 'resources';
  }

  function targetTypeOf(row) {
    if (row.lecture_id) { return 'lecture_id'; }
    if (row.summary_id) { return 'summary_id'; }
    if (row.assignment_id) { return 'assignment_id'; }
    return '';
  }

  function targetLabel(row) {
    var kind = targetTypeOf(row);
    if (kind === 'lecture_id') { return t('admin.files.targetLecture') + ': ' + row.lecture_id; }
    if (kind === 'summary_id') { return t('admin.files.targetSummary') + ': ' + row.summary_id; }
    if (kind === 'assignment_id') { return t('admin.files.targetAssignment') + ': ' + row.assignment_id; }
    return t('admin.files.targetNone');
  }

  function typeOptionsHtml() {
    return FILE_TYPE_OPTIONS.map(function (v) { return { value: v, label: t('file.type.' + v) }; });
  }

  /** يبني كائن {lecture_id,summary_id,assignment_id} من target_type/target_id
   * المُختارَين — يضمن حصر الربط بحقل واحد على الأكثر (لا تعارض بين الثلاثة). */
  function targetPatch(raw) {
    var patch = { lecture_id: null, summary_id: null, assignment_id: null };
    if (raw.target_type && raw.target_id) { patch[raw.target_type] = raw.target_id; }
    return patch;
  }

  function targetTypeOptionsHtml() {
    return [{ value: '', label: t('admin.files.targetNone') }].concat(
      TARGET_TYPES.map(function (v) {
        var key = v === 'lecture_id' ? 'admin.files.targetLecture' : v === 'summary_id' ? 'admin.files.targetSummary' : 'admin.files.targetAssignment';
        return { value: v, label: t(key) };
      })
    );
  }

  function createFilesView() {
    var currentUser = null;
    var editingId = null; // null | 'new' | معرّف صفّ
    var message = null;

    if (DLP.auth && typeof DLP.auth.onChange === 'function') {
      DLP.auth.onChange(function (user) { currentUser = user; });
    }

    function renderRow(row) {
      if (editingId === row.id) { return renderFormRow(row); }
      var url = row.__url;
      return '<tr>' +
        '<td>' + esc(row.label || row.file_name || row.name || '') + '<br><small>' + esc(t('file.type.' + row.type, row.type)) + ' · ' + esc(targetLabel(row)) + '</small></td>' +
        '<td>' + esc(t('admin.status.' + (row.status || 'draft'))) + '</td>' +
        '<td class="admin-row-actions">' +
          (url ? '<a class="btn btn-ghost btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">↗ ' + esc(t('admin.files.openLink')) + '</a>' : '<span class="admin-field-hint">' + esc(t('admin.files.noLink')) + '</span>') +
          '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="edit" data-id="' + esc(row.id) + '">✎ ' + esc(t('admin.action.edit')) + '</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="delete" data-id="' + esc(row.id) + '">🗑 ' + esc(t('admin.action.delete')) + '</button>' +
        '</td>' +
      '</tr>';
    }

    function renderFormRow(row) {
      var isNew = !row;
      var targetType = row ? targetTypeOf(row) : '';
      var targetId = row ? (row[targetType] || '') : '';
      return '<tr><td colspan="3">' +
        '<form class="admin-form" data-file-form data-id="' + esc(isNew ? '' : row.id) + '">' +
          shared.textField('label', t('admin.files.label'), row ? row.label : '', { required: true }) +
          shared.selectField('type', t('admin.field.type'), row ? row.type : 'pdf', typeOptionsHtml(), { required: true }) +
          shared.selectField('target_type', t('admin.files.target'), targetType, targetTypeOptionsHtml()) +
          shared.textField('target_id', t('admin.files.targetIdLabel'), targetId, { hint: t('admin.files.targetIdHint') }) +
          (isNew
            ? '<div class="admin-field"><span>' + esc(t('admin.files.mode')) + '</span>' +
                '<label style="display:inline-flex;gap:6px;align-items:center;margin-inline-end:16px">' +
                  '<input type="radio" name="mode" value="upload" checked> ' + esc(t('admin.files.modeUpload')) +
                '</label>' +
                '<label style="display:inline-flex;gap:6px;align-items:center">' +
                  '<input type="radio" name="mode" value="link"> ' + esc(t('admin.files.modeLink')) +
                '</label>' +
              '</div>' +
              '<div data-file-mode-panel="upload">' +
                '<div class="admin-field"><span>' + esc(t('admin.files.pickFile')) + '</span>' +
                  '<input type="file" name="file"><small class="admin-field-hint">' + esc(t('admin.files.pickFileHint')) + '</small>' +
                '</div>' +
              '</div>' +
              '<div data-file-mode-panel="link" hidden>' +
                shared.textField('external_url', t('admin.field.url'), '', { hint: t('admin.files.urlHint') }) +
              '</div>'
            : '') +
          shared.statusField(row ? row.status : 'draft') +
          '<div class="admin-form-actions">' +
            '<button class="btn btn-primary btn-sm" type="submit">' + esc(t('admin.action.save')) + '</button>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="cancel">' + esc(t('admin.action.cancel')) + '</button>' +
          '</div>' +
        '</form>' +
      '</td></tr>';
    }

    function renderMessage() {
      if (!message) { return ''; }
      return '<div class="admin-inline-message ' + (message.kind === 'ok' ? 'ok' : 'bad') + '">' + esc(message.text) + '</div>';
    }

    function renderList(subjectId, rows) {
      return '<section class="prose-card">' +
        '<p><a class="btn btn-ghost btn-sm" href="#/admin/subject/' + esc(subjectId) + '">← ' + esc(t('admin.backToSubject')) + '</a></p>' +
        '<h2>' + esc(t('admin.files.title')) + '</h2>' +
        '<p class="admin-field-hint">' + esc(t('admin.files.storageHint')) + '</p>' +
        renderMessage() +
        (editingId === 'new' ? '<table class="data-table"><tbody>' + renderFormRow(null) + '</tbody></table>' :
          '<p><button class="btn btn-gold btn-sm" type="button" data-crud-action="add">+ ' + esc(t('admin.action.add')) + '</button></p>') +
        (rows.length
          ? '<table class="data-table"><tbody>' + rows.map(renderRow).join('') + '</tbody></table>'
          : '<div class="empty-state"><p>' + esc(t('admin.emptyList')) + '</p></div>') +
      '</section>';
    }

    function render() {
      return '<div class="wrap">' +
        DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('admin.title'), href: '#/admin' }, { label: t('admin.files.title') }]) +
        '<section class="subject-hero" style="margin-top:14px">' +
          '<h1>🛠️ ' + esc(t('admin.files.title')) + '</h1>' +
        '</section>' +
        '<div data-admin-body>' +
          (!shared.isAuthAvailable() ? shared.renderNotAvailable() : (currentUser ? shared.renderLoading() : shared.renderSignInPrompt())) +
        '</div>' +
        DLP.layout.endActions() +
      '</div>';
    }

    function refresh(root, subjectId) {
      var body = root.querySelector('[data-admin-body]');
      if (!body) { return; }
      if (!shared.isAuthAvailable()) { body.innerHTML = shared.renderNotAvailable(); return; }
      if (!currentUser) { body.innerHTML = shared.renderSignInPrompt(); return; }
      body.innerHTML = shared.renderLoading();
      DLP.api.isAdminOrInstructor().then(function (isAdmin) {
        if (!isAdmin) { body.innerHTML = shared.renderAccessDenied(); return; }
        return DLP.api.adminList('files', { subject_id: subjectId }, 'created_at').then(function (rows) {
          rows = rows || [];
          return Promise.all(rows.map(function (row) {
            return DLP.api.adminResolveFileUrl(row).then(function (url) { row.__url = url; return row; });
          }));
        }).then(function (rows) {
          body.innerHTML = renderList(subjectId, rows);
        });
      }).catch(function () {
        body.innerHTML = shared.renderError();
      });
    }

    function bind(subjectId) {
      var root = document.getElementById('main');
      if (!root) { return; }
      refresh(root, subjectId);
      shared.bindCommonActions(root, function () { refresh(root, subjectId); });

      root.addEventListener('change', function (event) {
        var radio = event.target.closest('input[name="mode"]');
        if (!radio) { return; }
        var form = radio.closest('form');
        var uploadPanel = form.querySelector('[data-file-mode-panel="upload"]');
        var linkPanel = form.querySelector('[data-file-mode-panel="link"]');
        if (uploadPanel) { uploadPanel.hidden = radio.value !== 'upload'; }
        if (linkPanel) { linkPanel.hidden = radio.value !== 'link'; }
      });

      root.addEventListener('click', function (event) {
        var addBtn = event.target.closest('[data-crud-action="add"]');
        if (addBtn) { editingId = 'new'; message = null; refresh(root, subjectId); return; }
        var cancelBtn = event.target.closest('[data-crud-action="cancel"]');
        if (cancelBtn) { editingId = null; refresh(root, subjectId); return; }
        var editBtn = event.target.closest('[data-crud-action="edit"]');
        if (editBtn) { editingId = editBtn.dataset.id; message = null; refresh(root, subjectId); return; }
        var deleteBtn = event.target.closest('[data-crud-action="delete"]');
        if (deleteBtn) {
          if (!global.confirm(t('admin.confirmDelete'))) { return; }
          var id = deleteBtn.dataset.id;
          DLP.api.adminList('files', { subject_id: subjectId }, null).then(function (rows) {
            var row = (rows || []).filter(function (r) { return r.id === id; })[0];
            if (!row) { throw new Error('not found'); }
            return DLP.api.adminDeleteFile(row);
          }).then(function () {
            message = { kind: 'ok', text: t('admin.deleteSuccess') };
            refresh(root, subjectId);
          }).catch(function () {
            message = { kind: 'bad', text: t('admin.deleteError') };
            refresh(root, subjectId);
          });
        }
      });

      root.addEventListener('submit', function (event) {
        var form = event.target.closest('[data-file-form]');
        if (!form) { return; }
        event.preventDefault();
        var id = form.dataset.id;
        var raw = shared.formToObject(form);
        var targets = targetPatch(raw);

        if (id) { // تعديل: تسمية/نوع/حالة/ربط فقط — لا تبديل نمط الملف نفسه
          var patch = { label: raw.label, type: raw.type, status: raw.status,
            lecture_id: targets.lecture_id, summary_id: targets.summary_id, assignment_id: targets.assignment_id };
          DLP.api.adminUpdate('files', id, patch).then(function () {
            message = { kind: 'ok', text: t('admin.saveSuccess') };
            editingId = null;
            refresh(root, subjectId);
          }).catch(function () {
            message = { kind: 'bad', text: t('admin.saveError') };
            refresh(root, subjectId);
          });
          return;
        }

        var mode = raw.mode || 'upload';
        var savePromise;
        if (mode === 'upload') {
          var fileInput = form.querySelector('input[name="file"]');
          var file = fileInput && fileInput.files && fileInput.files[0];
          if (!file) {
            message = { kind: 'bad', text: t('admin.files.pickFile') };
            refresh(root, subjectId);
            return;
          }
          savePromise = DLP.api.adminUploadFile(file, {
            subjectId: subjectId, lectureId: targets.lecture_id, summaryId: targets.summary_id,
            assignmentId: targets.assignment_id, category: deriveCategory(raw.target_type),
            label: raw.label, type: raw.type, status: raw.status
          });
        } else {
          var safe = DLP.utils.safeUrl(raw.external_url);
          if (!safe) {
            message = { kind: 'bad', text: t('admin.files.invalidUrl') };
            refresh(root, subjectId);
            return;
          }
          savePromise = DLP.api.adminInsert('files', {
            subject_id: subjectId, lecture_id: targets.lecture_id, summary_id: targets.summary_id,
            assignment_id: targets.assignment_id, name: raw.label, label: raw.label, type: raw.type,
            external_url: safe, status: raw.status
          });
        }

        savePromise.then(function () {
          message = { kind: 'ok', text: t('admin.saveSuccess') };
          editingId = null;
          refresh(root, subjectId);
        }).catch(function (err) {
          message = { kind: 'bad', text: (err && err.message) || t('admin.saveError') };
          refresh(root, subjectId);
        });
      });
    }

    return {
      render: render, bind: bind,
      /** للاختبارات فقط. */
      __test: { setCurrentUser: function (user) { currentUser = user; }, renderRow: renderRow }
    };
  }

  DLP.adminFilesView = createFilesView();
  DLP.adminFilesView.__test = DLP.adminFilesView.__test || {};
  DLP.adminFilesView.__test.deriveCategory = deriveCategory;
  DLP.adminFilesView.__test.targetTypeOf = targetTypeOf;
  DLP.adminFilesView.__test.targetLabel = targetLabel;
  DLP.adminFilesView.__test.targetPatch = targetPatch;
  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminFilesView; }
})(typeof window !== 'undefined' ? window : globalThis);
