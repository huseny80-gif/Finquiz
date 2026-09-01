/* طبقة الترجمة — كل نصوص الواجهة تمرّ عبر t(). */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var locale = 'ar';

  function dict() {
    var strings = (DLP.config && DLP.config.strings) || {};
    return strings[locale] || strings.ar || {};
  }

  function t(key, fallback) {
    var table = dict();
    if (Object.prototype.hasOwnProperty.call(table, key)) { return table[key]; }
    return fallback !== undefined ? fallback : key;
  }

  function setLocale(next) {
    var strings = (DLP.config && DLP.config.strings) || {};
    if (!strings[next]) { return false; }
    locale = next;
    if (global.document) {
      global.document.documentElement.setAttribute('lang', t('lang', next));
      global.document.documentElement.setAttribute('dir', t('dir', 'rtl'));
    }
    return true;
  }

  DLP.i18n = { t: t, setLocale: setLocale, getLocale: function () { return locale; } };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.i18n; }
})(typeof window !== 'undefined' ? window : globalThis);
