/* أدوات مساعدة عامة — لا تعتمد على أي مكتبة خارجية. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};

  /** تهريب النص قبل إدراجه في HTML (حماية من XSS). */
  function escapeHtml(value) {
    if (value === null || value === undefined) { return ''; }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** تهريب قيمة تُستخدم داخل خاصية HTML. */
  function escapeAttr(value) { return escapeHtml(value); }

  /**
   * السماح فقط بالروابط الآمنة (http/https/mailto/tel أو مسار نسبي).
   * ترجع null لأي رابط غير موثوق مثل javascript: أو data:.
   */
  function safeUrl(url) {
    if (!url || typeof url !== 'string') { return null; }
    var value = url.trim();
    if (!value) { return null; }
    if (/^(https?:|mailto:|tel:)/i.test(value)) { return value; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) { return null; }   // أي بروتوكول آخر مرفوض
    if (/^\/\//.test(value)) { return null; }
    return value;                                              // مسار نسبي
  }

  /** تنسيق التاريخ بصيغة عربية مقروءة. */
  function formatDate(iso) {
    if (!iso) { return ''; }
    var parts = String(iso).split('-');
    if (parts.length !== 3) { return String(iso); }
    var months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (isNaN(m) || isNaN(d) || m < 1 || m > 12) { return String(iso); }
    return d + ' ' + months[m - 1] + ' ' + parts[0];
  }

  /** تطبيع النص العربي للبحث والمقارنة: إزالة التشكيل وتوحيد الألف والياء والتاء المربوطة. */
  function normalizeArabic(text) {
    if (text === null || text === undefined) { return ''; }
    return String(text)
      .replace(/[ً-ْٰـ]/g, '')
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[‌-‏؜]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /** تقصير النص مع علامة حذف. */
  function truncate(text, max) {
    var value = String(text || '');
    if (value.length <= max) { return value; }
    return value.slice(0, max - 1).trim() + '…';
  }

  /** ترتيب تنازلي حسب التاريخ (ISO). */
  function byDateDesc(a, b) {
    return String(b.date || '').localeCompare(String(a.date || ''));
  }

  DLP.utils = {
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    safeUrl: safeUrl,
    formatDate: formatDate,
    normalizeArabic: normalizeArabic,
    truncate: truncate,
    byDateDesc: byDateDesc
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.utils; }
})(typeof window !== 'undefined' ? window : globalThis);
