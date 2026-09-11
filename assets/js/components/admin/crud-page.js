/* مصنع صفحات CRUD عامة لكيانات المحتوى المرتبطة بمادة (subject_id) وذات نموذج
 * مسطّح بسيط: lectures/summaries/assignments/references/resources/updates/
 * quizzes. لا يُستخدَم لـ subjects (لا subject_id، وله ترتيب/حذف آمن خاص) ولا
 * لـ questions (نماذج فرعية مختلفة تماماً بحسب النوع) — هذان بملفّين منفصلين.
 *
 * كل الحماية الفعلية في سياسات RLS *_write_admin (002_rls.sql)؛ هذا الملف
 * عرض واستدعاء فقط. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };
  var shared = DLP.adminShared;

  /** يحوّل حقلاً واحداً من قيمة نصية (من input/textarea) إلى قيمته المخزَّنة
   * فعلياً بحسب نوعه — العكس التام لـ fieldToInputValue(). */
  function parseFieldValue(field, raw) {
    switch (field.type) {
      case 'number': return raw === '' ? null : Number(raw);
      case 'lines': return raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      case 'concepts':
        return raw.split('\n').map(function (line) { return line.trim(); }).filter(Boolean).map(function (line) {
          var parts = line.split('::');
          return { term: (parts[0] || '').trim(), definition: (parts.slice(1).join('::') || '').trim() };
        });
      default: return raw === '' ? null : raw;
    }
  }

  /** العكس: يحوّل القيمة المخزَّنة إلى نص قابل للعرض داخل input/textarea. */
  function fieldToInputValue(field, row) {
    var value = row ? row[field.name] : null;
    if (field.type === 'lines') { return (value || []).join('\n'); }
    if (field.type === 'concepts') {
      return (value || []).map(function (c) { return (c.term || '') + ' :: ' + (c.definition || ''); }).join('\n');
    }
    return value == null ? '' : value;
  }

  function renderField(field, row) {
    var label = t(field.labelKey);
    var value = fieldToInputValue(field, row);
    var opts = { required: field.required, hint: field.hintKey ? t(field.hintKey) : null };
    switch (field.type) {
      case 'textarea': case 'lines': case 'concepts':
        return shared.textareaField(field.name, label, value, opts);
      case 'date':
        return shared.dateField(field.name, label, value, opts);
      case 'number':
        return shared.textField(field.name, label, value, opts); // input[type=number] غير ضروري: تحقّق كافٍ عبر Number() عند الحفظ
      default:
        return shared.textField(field.name, label, value, opts);
    }
  }

  function createPage(config) {
    var currentUser = null;
    var editingId = null; // null = لا يوجد نموذج تعديل مفتوح، 'new' = نموذج إضافة، غير ذلك = معرّف صفّ يُحرَّر
    var message = null; // { kind: 'ok'|'bad', text }

    function init() {
      if (DLP.auth && typeof DLP.auth.onChange === 'function') {
        DLP.auth.onChange(function (user) { currentUser = user; });
      }
    }

    function renderRow(subjectId, row) {
      if (editingId === row.id) { return renderFormRow(subjectId, row); }
      return '<tr>' +
        '<td>' + esc(config.rowLabel(row)) + '</td>' +
        '<td>' + esc(t('admin.status.' + (row.status || 'draft'))) + '</td>' +
        '<td class="admin-row-actions">' +
          (config.extraRowActions ? config.extraRowActions(row) : '') +
          '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="edit" data-id="' + esc(row.id) + '">✎ ' + esc(t('admin.action.edit')) + '</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-crud-action="delete" data-id="' + esc(row.id) + '">🗑 ' + esc(t('admin.action.delete')) + '</button>' +
        '</td>' +
      '</tr>';
    }

    function renderFormRow(subjectId, row) {
      var isNew = !row;
      // المفاتيح الأساسية في كل جداول المحتوى نصّية بلا قيمة افتراضية من القاعدة
      // (text primary key بلا default) — يجب على المُنشئ اختيار معرّف صريح يتبع
      // نمط <بادئة المادة>-<نوع><رقم> (انظر SUPABASE_MIGRATION_AUDIT.md §1.8).
      // لا يجوز تغيير المعرّف بعد الإنشاء (جداول أخرى قد تشير إليه بمفتاح أجنبي).
      var idField = isNew
        ? shared.textField('id', t('admin.field.id'), '', { required: true, hint: t('admin.field.idHint') })
        : '<div class="admin-field"><span>' + esc(t('admin.field.id')) + '</span><code>' + esc(row.id) + '</code></div>';
      return '<tr><td colspan="3">' +
        '<form class="admin-form" data-crud-form data-id="' + esc(isNew ? '' : row.id) + '">' +
          idField +
          config.fields.map(function (field) { return renderField(field, row); }).join('') +
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
        '<h2>' + esc(t(config.titleKey)) + '</h2>' +
        renderMessage() +
        (editingId === 'new' ? '<table class="data-table"><tbody>' + renderFormRow(subjectId, null) + '</tbody></table>' :
          '<p><button class="btn btn-gold btn-sm" type="button" data-crud-action="add">+ ' + esc(t('admin.action.add')) + '</button></p>') +
        (rows.length
          ? '<table class="data-table"><tbody>' + rows.map(function (row) { return renderRow(subjectId, row); }).join('') + '</tbody></table>'
          : '<div class="empty-state"><p>' + esc(t('admin.emptyList')) + '</p></div>') +
      '</section>';
    }

    function render() {
      return '<div class="wrap">' +
        DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('admin.title'), href: '#/admin' }, { label: t(config.titleKey) }]) +
        '<section class="subject-hero" style="margin-top:14px">' +
          '<h1>🛠️ ' + esc(t(config.titleKey)) + '</h1>' +
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
        return DLP.api.adminList(config.table, { subject_id: subjectId }, config.orderColumn).then(function (rows) {
          body.innerHTML = renderList(subjectId, rows || []);
        });
      }).catch(function () {
        body.innerHTML = shared.renderError();
      });
    }

    function collectPayload(form, subjectId) {
      var raw = shared.formToObject(form);
      var payload = { subject_id: subjectId, status: raw.status };
      if (raw.id) { payload.id = raw.id; } // موجود فقط عند الإنشاء (انظر renderFormRow) — التعديل لا يغيّر المعرّف أبداً
      config.fields.forEach(function (field) { payload[field.name] = parseFieldValue(field, raw[field.name] || ''); });
      return payload;
    }

    function bind(subjectId) {
      var root = document.getElementById('main');
      if (!root) { return; }
      init();
      refresh(root, subjectId);
      shared.bindCommonActions(root, function () { refresh(root, subjectId); });

      root.addEventListener('click', function (event) {
        var addBtn = event.target.closest('[data-crud-action="add"]');
        if (addBtn) { editingId = 'new'; message = null; refresh(root, subjectId); return; }
        var cancelBtn = event.target.closest('[data-crud-action="cancel"]');
        if (cancelBtn) { editingId = null; refresh(root, subjectId); return; }
        var editBtn = event.target.closest('[data-crud-action="edit"]');
        if (editBtn) { editingId = editBtn.dataset.id; message = null; refresh(root, subjectId); return; }
        var deleteBtn = event.target.closest('[data-crud-action="delete"]');
        if (deleteBtn) {
          var id = deleteBtn.dataset.id;
          var checks = config.childrenChecks || [];
          Promise.all(checks.map(function (c) { return DLP.api.adminCountReferences(c.table, c.fk, id); }))
            .then(function (counts) {
              var total = counts.reduce(function (a, b) { return a + b; }, 0);
              if (total > 0) {
                message = { kind: 'bad', text: t('admin.deleteBlockedByChildren') + ' ' + total };
                refresh(root, subjectId);
                return;
              }
              if (!global.confirm(t('admin.confirmDelete'))) { return; }
              return DLP.api.adminDelete(config.table, id).then(function () {
                message = { kind: 'ok', text: t('admin.deleteSuccess') };
                refresh(root, subjectId);
              }).catch(function () {
                message = { kind: 'bad', text: t('admin.deleteError') };
                refresh(root, subjectId);
              });
            });
        }
      });

      root.addEventListener('submit', function (event) {
        var form = event.target.closest('[data-crud-form]');
        if (!form) { return; }
        event.preventDefault();
        var id = form.dataset.id;
        var payload = collectPayload(form, subjectId);
        var promise = id ? DLP.api.adminUpdate(config.table, id, payload) : DLP.api.adminInsert(config.table, payload);
        promise.then(function () {
          message = { kind: 'ok', text: t('admin.saveSuccess') };
          editingId = null;
          refresh(root, subjectId);
        }).catch(function () {
          message = { kind: 'bad', text: t('admin.saveError') };
          refresh(root, subjectId);
        });
      });
    }

    return { render: render, bind: bind, __test: { renderRow: renderRow, collectPayload: collectPayload, parseFieldValue: parseFieldValue } };
  }

  DLP.adminCrud = { createPage: createPage };
  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminCrud; }
})(typeof window !== 'undefined' ? window : globalThis);
