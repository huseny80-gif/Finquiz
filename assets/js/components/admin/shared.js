/* أدوات مشتركة بين كل ملفات لوحة الإدارة (admin/*.js) — حالات الدخول/الأذونات
 * المتكرّرة حرفياً في كل صفحة إدارية (بلا اتصال/بانتظار تسجيل الدخول/رُفض
 * الوصول/تحميل/خطأ)، بالإضافة إلى بنّائي حقول نماذج بسيطين. لا منطق أعمال هنا
 * — فقط عرض متكرّر وتحقّق مدخلات سطحي (التحقّق الحقيقي دائماً في RLS/القاعدة).
 * الحماية الفعلية لكل عمليات الكتابة تبقى في سياسات *_write_admin
 * (supabase/migrations/002_rls.sql) — isAdminOrInstructor() هنا تحسين تجربة
 * استخدام فقط (إخفاء نماذج لا يجوز لهذا المستخدم استخدامها أصلاً)، لا حدّ أمان. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function isAuthAvailable() { return !!DLP.auth && typeof DLP.auth.isAvailable === 'function' && DLP.auth.isAvailable(); }

  /** يشترك في DLP.auth.onChange ويعيد دالة getCurrentUser() — نمط مكرَّر حرفياً
   * في كل ملف admin/*.js سابقاً؛ استدعِها مرة واحدة أعلى كل ملف. */
  function trackCurrentUser() {
    var currentUser = null;
    if (DLP.auth && typeof DLP.auth.onChange === 'function') {
      DLP.auth.onChange(function (user) { currentUser = user; });
    }
    return function getCurrentUser() { return currentUser; };
  }

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

  function renderError(message) {
    return '<div class="empty-state">' +
      '<p>' + esc(message || t('admin.error')) + '</p>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-admin-action="retry">↻ ' + esc(t('dashboard.retry')) + '</button>' +
    '</div>';
  }

  /** يربط أزرار "تسجيل دخول"/"إعادة محاولة" العامّتين — كل صفحة تربط فوق هذا
   * أي أزرار إضافية خاصة بها (data-crud-action مثلاً) بمستمع منفصل. */
  function bindCommonActions(root, onRetry) {
    root.addEventListener('click', function (event) {
      var target = event.target.closest('[data-admin-action]');
      if (!target) { return; }
      var action = target.dataset.adminAction;
      if (action === 'sign-in' && DLP.auth) {
        target.disabled = true;
        DLP.auth.signInWithGoogle().catch(function () { target.disabled = false; });
      } else if (action === 'retry' && typeof onRetry === 'function') {
        onRetry();
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* بنّاؤو حقول نماذج بسيطون — HTML فقط، بلا أي منطق تحقّق أو حفظ.            */
  /* ---------------------------------------------------------------------- */

  function fieldWrap(labelText, inputHtml, hint) {
    return '<label class="admin-field">' +
      '<span>' + esc(labelText) + '</span>' + inputHtml +
      (hint ? '<small class="admin-field-hint">' + esc(hint) + '</small>' : '') +
    '</label>';
  }

  function textField(name, labelText, value, opts) {
    opts = opts || {};
    return fieldWrap(labelText,
      '<input type="text" name="' + esc(name) + '" value="' + esc(value == null ? '' : value) + '"' +
      (opts.required ? ' required' : '') + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>',
      opts.hint);
  }

  function dateField(name, labelText, value, opts) {
    opts = opts || {};
    return fieldWrap(labelText,
      '<input type="date" name="' + esc(name) + '" value="' + esc(value || '') + '"' +
      (opts.required ? ' required' : '') + '>', opts.hint);
  }

  function textareaField(name, labelText, value, opts) {
    opts = opts || {};
    return fieldWrap(labelText,
      '<textarea name="' + esc(name) + '" rows="' + (opts.rows || 4) + '"' + (opts.required ? ' required' : '') + '>' +
        esc(value == null ? '' : value) +
      '</textarea>', opts.hint);
  }

  function selectField(name, labelText, value, options, opts) {
    opts = opts || {};
    var html = '<select name="' + esc(name) + '"' + (opts.required ? ' required' : '') + '>' +
      options.map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') +
    '</select>';
    return fieldWrap(labelText, html, opts.hint);
  }

  var STATUS_VALUES = ['draft', 'published', 'archived'];

  function statusField(value) {
    var options = STATUS_VALUES.map(function (v) { return { value: v, label: t('admin.status.' + v) }; });
    return selectField('status', t('admin.field.status'), value || 'draft', options);
  }

  /** يبني FormData → كائن JS بسيط (كل الحقول نصوصاً؛ التحويل الرقمي/المنطقي
   * مسؤولية المستدعي بحسب حاجته لكل حقل). */
  function formToObject(form) {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) { return; }
      data[el.name] = el.value;
    });
    return data;
  }

  DLP.adminShared = {
    isAuthAvailable: isAuthAvailable,
    trackCurrentUser: trackCurrentUser,
    renderNotAvailable: renderNotAvailable,
    renderSignInPrompt: renderSignInPrompt,
    renderAccessDenied: renderAccessDenied,
    renderLoading: renderLoading,
    renderError: renderError,
    bindCommonActions: bindCommonActions,
    textField: textField,
    dateField: dateField,
    textareaField: textareaField,
    selectField: selectField,
    statusField: statusField,
    formToObject: formToObject
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminShared; }
})(typeof window !== 'undefined' ? window : globalThis);
