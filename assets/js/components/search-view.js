/* صفحة نتائج البحث. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function resultItem(entry) {
    var href = entry.route + (entry.anchor ? '?focus=' + encodeURIComponent(entry.anchor) : '');
    return '<article class="result-item">' +
      '<span class="subject-icon" aria-hidden="true">' + esc(entry.subjectIcon) + '</span>' +
      '<div class="r-main">' +
        '<h3>' + esc(DLP.utils.truncate(entry.title, 140)) + '</h3>' +
        (entry.body ? '<p class="r-snippet">' + esc(DLP.utils.truncate(entry.body, 180)) + '</p>' : '') +
        '<div class="r-meta">' +
          '<span class="badge badge-type">' + esc(entry.subjectTitle) + '</span>' +
          '<span class="badge badge-demo">' + esc(entry.typeLabel) + '</span>' +
          (entry.date ? '<span class="badge badge-demo">' + esc(DLP.utils.formatDate(entry.date)) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<a class="btn btn-primary btn-sm" href="' + esc(href) + '">' + esc(t('search.open')) + ' ←</a>' +
    '</article>';
  }

  function render(query) {
    var value = (query || '').trim();
    var results = value ? DLP.search.query(value) : [];
    var body;

    if (!value) {
      body = '<div class="empty-state"><div class="big" aria-hidden="true">🔍</div><p>' + esc(t('search.hint')) + '</p></div>';
    } else if (!results.length) {
      body = '<div class="empty-state"><div class="big" aria-hidden="true">🔍</div><p>' + esc(t('search.empty')) + '</p></div>';
    } else {
      body = results.map(resultItem).join('');
    }

    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: t('search.results') }]) +
      '<div class="section-title" style="margin-top:16px">' +
        '<h2>' + esc(t('search.results')) + (value ? ': «' + esc(value) + '»' : '') + '</h2>' +
        (value ? '<span class="sub">' + results.length + ' ' + esc(t('search.count')) + '</span>' : '') +
      '</div>' +
      body +
      DLP.layout.endActions() +
    '</div>';
  }

  DLP.searchView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
