/* قسم التواصل — يقرأ من data/config/contact.js ولا يعرض روابط وهمية. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function item(channel) {
    var value = channel.value;
    if (!value) {
      return '<div class="contact-item is-off">' +
        '<span class="ci-icon" aria-hidden="true">' + esc(channel.icon) + '</span>' +
        '<span>' + esc(channel.label) + '<span class="ci-state">' + esc(t('contact.soon')) + '</span></span>' +
      '</div>';
    }
    var href = DLP.utils.safeUrl((channel.hrefPrefix || '') + value);
    if (!href) {
      return '<div class="contact-item is-off">' +
        '<span class="ci-icon" aria-hidden="true">' + esc(channel.icon) + '</span>' +
        '<span>' + esc(channel.label) + '<span class="ci-state">' + esc(t('file.unavailable')) + '</span></span>' +
      '</div>';
    }
    var external = /^https?:/i.test(href);
    return '<a class="contact-item" href="' + esc(href) + '"' +
      (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
      '<span class="ci-icon" aria-hidden="true">' + esc(channel.icon) + '</span>' +
      '<span>' + esc(channel.label) + '<span class="ci-state">' + esc(value) + '</span></span>' +
    '</a>';
  }

  function block() {
    var contact = DLP.config.contact;
    return '' +
      '<section class="section-block" id="contact" aria-labelledby="contactTitle">' +
        '<div class="section-title"><h2 id="contactTitle">' + esc(t('contact.title')) + '</h2></div>' +
        '<div class="contact-grid">' + contact.channels.map(item).join('') + '</div>' +
        (contact.note ? '<p class="notice" style="margin-top:14px">🛠️ ' + esc(contact.note) + '</p>' : '') +
      '</section>';
  }

  DLP.contactView = { block: block };
})(typeof window !== 'undefined' ? window : globalThis);
