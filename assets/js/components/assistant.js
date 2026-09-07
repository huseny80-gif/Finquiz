/* صفحة المساعد الذكي — ميزة قيد التطوير (Demo)، بلا اتصال بأي خدمة ذكاء اصطناعي فعلية. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function render() {
    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('nav.assistant') }]) +
      '<section class="subject-hero" style="margin-top:14px">' +
        '<h1>🤖 ' + esc(t('nav.assistant')) + '</h1>' +
        '<p>' + esc(t('assistant.intro')) + '</p>' +
        '<ul class="chips"><li class="chip badge-soon">🚧 ' + esc(t('common.comingSoon')) + '</li></ul>' +
      '</section>' +
      '<div class="soon-card">' +
        '<div class="big" aria-hidden="true">🤖</div>' +
        '<span class="badge badge-soon" style="margin-bottom:10px">' + esc(t('common.demoFeature')) + '</span>' +
        '<h2>' + esc(t('nav.assistant')) + ' — ' + esc(t('common.comingSoon')) + '</h2>' +
        '<p>' + esc(t('common.comingSoonHint')) + '</p>' +
      '</div>' +
      DLP.layout.endActions() +
    '</div>';
  }

  DLP.assistantView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
