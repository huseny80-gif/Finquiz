/* صفحة "من نحن" + قسم التواصل. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function render() {
    var about = DLP.config.about;
    var site = DLP.config.site;

    return '<div class="wrap">' +
      DLP.layout.breadcrumbs([{ label: t('nav.home'), href: '#/' }, { label: about.title }]) +
      '<section class="subject-hero" style="margin-top:14px">' +
        '<h1>' + esc(about.title) + '</h1>' +
        '<p>' + esc(about.intro) + '</p>' +
        '<ul class="chips">' +
          '<li class="chip">' + esc(site.program) + '</li>' +
          '<li class="chip">' + esc(site.course) + '</li>' +
        '</ul>' +
      '</section>' +
      about.sections.map(function (section) {
        return '<section class="prose-card" id="' + esc(section.id) + '">' +
          '<h2>' + esc(section.title) + '</h2>' +
          '<ul class="detail-list">' +
            section.items.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') +
          '</ul>' +
        '</section>';
      }).join('') +
      '<section class="prose-card" id="team">' +
        '<h2>' + esc(about.team.title) + '</h2>' +
        '<p><b>' + esc(about.team.name) + '</b> — ' + esc(about.team.role) + '</p>' +
        '<p style="margin-top:6px;color:#5C6B70">' + esc(about.team.bio) + '</p>' +
      '</section>' +
      (about.archive && about.archive.length
        ? '<section class="prose-card" id="archive">' +
            '<h2>🗃️ ' + esc(t('archive.title')) + '</h2>' +
            about.archive.map(function (item) {
              var url = DLP.utils.safeUrl(item.url);
              return '<div style="margin-bottom:12px">' +
                '<p style="font-weight:800;color:#123B4A">' + esc(item.title) + '</p>' +
                '<p style="color:#5C6B70;font-size:.9rem;margin:4px 0 8px">' + esc(item.description) + '</p>' +
                (url
                  ? '<a class="btn btn-ghost btn-sm" href="' + esc(url) + '">📄 ' + esc(t('archive.open')) + '</a>'
                  : '<span class="btn btn-ghost btn-sm" aria-disabled="true">' + esc(t('file.unavailable')) + '</span>') +
              '</div>';
            }).join('') +
          '</section>'
        : '') +
      '<p class="notice">⚠️ ' + esc(about.disclaimer) + '</p>' +
      DLP.contactView.block() +
      DLP.layout.endActions() +
    '</div>';
  }

  DLP.aboutView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
