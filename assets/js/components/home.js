/* الصفحة الرئيسية: البطاقات، الإحصائيات، آخر التحديثات. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function statsSection() {
    var stats = DLP.store.stats();
    var cards = [
      { key: 'subjects',    value: stats.subjects },
      { key: 'lectures',    value: stats.lectures },
      { key: 'summaries',   value: stats.summaries },
      { key: 'assignments', value: stats.assignments },
      { key: 'quizzes',     value: stats.quizzes },
      { key: 'questions',   value: stats.questions }
    ];
    return '' +
      '<section class="section-block" aria-labelledby="statsTitle">' +
        '<div class="section-title"><h2 id="statsTitle">' + esc(t('stats.title')) + '</h2>' +
        '<span class="sub">' + esc(t('stats.subtitle')) + '</span></div>' +
        '<div class="stats-grid">' +
          cards.map(function (card) {
            return '<div class="stat-card">' +
              '<span class="stat-num">' + esc(card.value) + '</span>' +
              '<span class="stat-label">' + esc(t('stats.' + card.key)) + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</section>';
  }

  function subjectCard(subject) {
    var counts = DLP.store.subjectCounts(subject);
    return '' +
      '<article class="subject-card" style="--card-accent:' + esc(subject.accent || '#123B4A') + '">' +
        '<div class="subject-card-head">' +
          '<span class="subject-icon" aria-hidden="true">' + esc(subject.icon) + '</span>' +
          '<h3><a href="#/subject/' + esc(subject.id) + '">' + esc(subject.title) + '</a></h3>' +
        '</div>' +
        '<p class="subject-desc">' + esc(subject.description) + '</p>' +
        '<ul class="chips">' +
          '<li class="chip">' + esc(t('section.lectures')) + ' <b>' + counts.lectures + '</b></li>' +
          '<li class="chip">' + esc(t('section.summaries')) + ' <b>' + counts.summaries + '</b></li>' +
          '<li class="chip">' + esc(t('section.assignments')) + ' <b>' + counts.assignments + '</b></li>' +
          '<li class="chip">' + esc(t('stats.questions')) + ' <b>' + counts.questions + '</b></li>' +
        '</ul>' +
        '<div><a class="btn btn-primary btn-sm" href="#/subject/' + esc(subject.id) + '">' +
          esc(t('home.openSubject')) + ' ←</a></div>' +
      '</article>';
  }

  function updatesSection() {
    var latest = DLP.store.latestUpdates(6);
    if (!latest.length) { return ''; }
    return '' +
      '<section class="section-block" aria-labelledby="updatesTitle">' +
        '<div class="section-title"><h2 id="updatesTitle">' + esc(t('home.updatesTitle')) + '</h2></div>' +
        latest.map(function (row) {
          return '<article class="result-item">' +
            '<span class="subject-icon" aria-hidden="true">' + esc(row.subject.icon) + '</span>' +
            '<div class="r-main">' +
              '<h3>' + esc(row.update.title) + '</h3>' +
              '<p class="r-snippet">' + esc(row.update.body) + '</p>' +
              '<div class="r-meta">' +
                '<span class="badge badge-type">' + esc(row.subject.title) + '</span>' +
                '<span class="badge badge-demo">' + esc(DLP.utils.formatDate(row.update.date)) + '</span>' +
                (row.update.demo ? '<span class="badge badge-medium">' + esc(t('common.demo')) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<a class="btn btn-ghost btn-sm" href="#/subject/' + esc(row.subject.id) + '/updates">' +
              esc(t('search.open')) + '</a>' +
          '</article>';
        }).join('') +
      '</section>';
  }

  function render() {
    var s = DLP.config.site;
    var subjects = DLP.store.subjects();

    return '' +
      '<section class="hero">' +
        '<div class="wrap">' +
          '<span class="eyebrow">' + esc(s.brand.name) + '</span>' +
          '<h1>' + esc(s.program) + '</h1>' +
          '<p class="hero-sub">' + esc(s.course) + '</p>' +
          '<p class="hero-desc">' + esc(s.description) + '</p>' +
          '<div class="hero-actions">' +
            '<a class="btn btn-gold" href="#subjectsTitle">📚 ' + esc(t('home.subjectsTitle')) + '</a>' +
            '<a class="btn btn-ghost" href="#/about">' + esc(t('home.aboutBtn')) + '</a>' +
            '<a class="btn btn-ghost" href="#/about?focus=contact">' + esc(t('nav.contact')) + '</a>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<div class="wrap">' +
        (s.showDemoBadge ? '<p class="notice" style="margin-top:20px">ℹ️ ' + esc(s.demoNotice) + '</p>' : '') +
        statsSection() +
        '<section class="section-block" aria-labelledby="subjectsTitle">' +
          '<div class="section-title">' +
            '<h2 id="subjectsTitle">' + esc(t('home.subjectsTitle')) + '</h2>' +
            '<span class="sub">' + esc(t('home.subjectsSub')) + '</span>' +
          '</div>' +
          '<div class="subjects-grid">' + subjects.map(subjectCard).join('') + '</div>' +
        '</section>' +
        updatesSection() +
        DLP.contactView.block() +
        DLP.layout.endActions() +
      '</div>';
  }

  DLP.homeView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
