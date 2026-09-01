/* صفحة المادة: التبويبات السبعة وعرض المحتوى لكل قسم. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };
  var fmt = function (v) { return DLP.utils.formatDate(v); };

  var FILE_TAGS = {
    pdf: 'file.type.pdf', docx: 'file.type.docx', doc: 'file.type.docx',
    pptx: 'file.type.pptx', ppt: 'file.type.pptx',
    xlsx: 'file.type.xlsx', image: 'file.type.image', video: 'file.type.video', link: 'file.type.link'
  };

  function demoBadge(item) {
    return item && item.demo ? '<span class="badge badge-demo">' + esc(t('common.demo')) + '</span>' : '';
  }

  function fileChip(file) {
    var tag = FILE_TAGS[file.type] ? t(FILE_TAGS[file.type]) : String(file.type || '').toUpperCase();
    var url = DLP.utils.safeUrl(file.url);
    var label = file.label || file.title || tag;
    if (!url) {
      return '<span class="file-item is-unavailable">' +
        '<span class="ftag">' + esc(tag) + '</span>' + esc(label) +
        '<span class="fstate">— ' + esc(t('file.soon')) + '</span></span>';
    }
    var external = /^https?:/i.test(url);
    return '<a class="file-item" href="' + esc(url) + '"' +
      (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
      '<span class="ftag">' + esc(tag) + '</span>' + esc(label) + '</a>';
  }

  function fileList(files) {
    if (!files || !files.length) { return ''; }
    return '<div class="file-list" style="margin-top:12px">' + files.map(fileChip).join('') + '</div>';
  }

  function emptyState() {
    return '<div class="empty-state">' +
      '<div class="big" aria-hidden="true">🗂️</div>' +
      '<p>' + esc(t('common.empty')) + '</p>' +
      '<p style="font-size:.85rem">' + esc(t('common.emptyHint')) + '</p>' +
    '</div>';
  }

  /* ---------------- 01 المحاضرات ---------------- */
  function lecturesSection(subject) {
    var items = DLP.store.list(subject, 'lectures');
    if (!items.length) { return emptyState(); }
    return items.map(function (lecture) {
      return '<article class="card" id="' + esc(lecture.id) + '">' +
        '<div class="card-head">' +
          '<span class="card-num" aria-hidden="true">' + esc(lecture.number) + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<h3 class="card-title">' + esc(t('lecture.number')) + ' ' + esc(lecture.number) + ' — ' + esc(lecture.title) + '</h3>' +
            '<div class="card-meta">' +
              '<span>📅 ' + esc(t('lecture.added')) + ': ' + esc(fmt(lecture.date)) + '</span>' +
              (lecture.demo ? '<span>' + demoBadge(lecture) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-body"><p>' + esc(lecture.description) + '</p>' +
          (lecture.objectives && lecture.objectives.length
            ? '<p class="subhead">🎯 ' + esc(t('lecture.objectives')) + '</p><ul class="detail-list">' +
              lecture.objectives.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul>'
            : '') +
          fileList(lecture.files) +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="btn btn-primary btn-sm" type="button" data-toggle-details="' + esc(lecture.id) + '-details"' +
            ' aria-expanded="false" aria-controls="' + esc(lecture.id) + '-details">' + esc(t('lecture.open')) + '</button>' +
          '<a class="btn btn-ghost btn-sm" href="#/subject/' + esc(subject.id) + '/summaries">📝 ' + esc(t('section.summaries')) + '</a>' +
        '</div>' +
        '<div class="card-body" id="' + esc(lecture.id) + '-details" hidden>' +
          '<p class="subhead">📄 ' + esc(t('lecture.content')) + '</p>' +
          '<p>' + esc(lecture.description) + '</p>' +
          '<p class="notice" style="margin-top:12px">' + esc(t('lecture.contentSoon')) + '</p>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ---------------- 02 الملخصات ---------------- */
  function summariesSection(subject) {
    var items = DLP.store.list(subject, 'summaries');
    if (!items.length) { return emptyState(); }
    return items.map(function (summary) {
      return '<article class="card" id="' + esc(summary.id) + '">' +
        '<div class="card-head">' +
          '<span class="card-num" aria-hidden="true">📝</span>' +
          '<div style="flex:1;min-width:0">' +
            '<h3 class="card-title">' + esc(summary.title) + '</h3>' +
            '<div class="card-meta"><span>📅 ' + esc(fmt(summary.date)) + '</span>' + demoBadge(summary) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          (summary.keyPoints && summary.keyPoints.length
            ? '<p class="subhead">🔑 ' + esc(t('summary.keyPoints')) + '</p><ul class="detail-list">' +
              summary.keyPoints.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'
            : '') +
          (summary.concepts && summary.concepts.length
            ? '<p class="subhead">💡 ' + esc(t('summary.concepts')) + '</p><div class="term-grid">' +
              summary.concepts.map(function (c) {
                return '<div class="term-item"><b>' + esc(c.term) + ':</b> ' + esc(c.definition) + '</div>';
              }).join('') + '</div>'
            : '') +
          (summary.terms && summary.terms.length
            ? '<p class="subhead">🏷️ ' + esc(t('summary.terms')) + '</p><ul class="chips">' +
              summary.terms.map(function (term) { return '<li class="chip">' + esc(term) + '</li>'; }).join('') + '</ul>'
            : '') +
          fileList(summary.files) +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ---------------- 03 التمارين والواجبات ---------------- */
  function assignmentsSection(subject) {
    var items = DLP.store.list(subject, 'assignments');
    if (!items.length) { return emptyState(); }
    return items.map(function (task) {
      var level = task.difficulty || 'medium';
      return '<article class="card" id="' + esc(task.id) + '">' +
        '<div class="card-head">' +
          '<span class="card-num" aria-hidden="true">✏️</span>' +
          '<div style="flex:1;min-width:0">' +
            '<h3 class="card-title">' + esc(task.title) + '</h3>' +
            '<div class="card-meta">' +
              '<span>📅 ' + esc(t('common.date')) + ': ' + esc(fmt(task.date)) + '</span>' +
              (task.due ? '<span>⏳ ' + esc(t('assignment.due')) + ': ' + esc(fmt(task.due)) + '</span>' : '') +
              '<span class="badge badge-' + esc(level) + '">' + esc(t('assignment.difficulty')) + ': ' +
                esc(t('difficulty.' + level)) + '</span>' +
              demoBadge(task) +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-body"><p>' + esc(task.description) + '</p>' + fileList(task.files) + '</div>' +
        '<div class="card-actions">' +
          '<button class="btn btn-primary btn-sm" type="button" data-toggle-details="' + esc(task.id) + '-details"' +
            ' aria-expanded="false" aria-controls="' + esc(task.id) + '-details">' + esc(t('assignment.open')) + '</button>' +
        '</div>' +
        '<div class="card-body" id="' + esc(task.id) + '-details" hidden>' +
          '<p class="subhead">📌 ' + esc(t('assignment.details')) + '</p><p>' + esc(task.description) + '</p>' +
          (task.due ? '<p class="notice" style="margin-top:12px">⏳ ' + esc(t('assignment.dueNote')) + ': ' + esc(fmt(task.due)) + '</p>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ---------------- 05 المراجع والمصادر ---------------- */
  function referencesSection(subject) {
    var items = DLP.store.list(subject, 'references');
    if (!items.length) { return emptyState(); }
    return items.map(function (ref) {
      var url = DLP.utils.safeUrl(ref.url);
      var meta = [ref.author, ref.publisher, ref.year].filter(Boolean).join(' — ');
      return '<article class="card" id="' + esc(ref.id) + '">' +
        '<div class="card-head">' +
          '<span class="card-num" aria-hidden="true">📚</span>' +
          '<div style="flex:1;min-width:0">' +
            '<h3 class="card-title">' + esc(ref.title) + '</h3>' +
            '<div class="card-meta">' +
              '<span class="badge badge-type">' + esc(t('ref.type.' + ref.type, ref.type)) + '</span>' +
              (meta ? '<span>' + esc(meta) + '</span>' : '') + demoBadge(ref) +
            '</div>' +
          '</div>' +
        '</div>' +
        (ref.note ? '<div class="card-body"><p>' + esc(ref.note) + '</p></div>' : '') +
        '<div class="card-actions">' +
          (url
            ? '<a class="btn btn-ghost btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">🔗 ' + esc(t('file.open')) + '</a>'
            : '<span class="btn btn-ghost btn-sm" aria-disabled="true">' + esc(t('file.unavailable')) + '</span>') +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ---------------- 06 الملفات والموارد ---------------- */
  function resourcesSection(subject) {
    var items = DLP.store.list(subject, 'resources');
    if (!items.length) { return emptyState(); }
    return '<div class="card"><div class="card-body" style="margin-top:0">' +
      '<div class="file-list">' +
        items.map(function (res) {
          return fileChip({ type: res.type, label: res.title + ' (' + fmt(res.date) + ')', url: res.url });
        }).join('') +
      '</div>' +
      '<p class="notice" style="margin-top:16px">📎 ' + esc(t('resources.note')) + '</p>' +
    '</div></div>';
  }

  /* ---------------- 07 الإعلانات والتحديثات ---------------- */
  function updatesSection(subject) {
    var items = DLP.store.list(subject, 'updates').slice().sort(DLP.utils.byDateDesc);
    if (!items.length) { return emptyState(); }
    return items.map(function (update) {
      return '<article class="card" id="' + esc(update.id) + '">' +
        '<div class="card-head">' +
          '<span class="card-num" aria-hidden="true">📣</span>' +
          '<div style="flex:1;min-width:0">' +
            '<h3 class="card-title">' + esc(update.title) + '</h3>' +
            '<div class="card-meta"><span>📅 ' + esc(fmt(update.date)) + '</span>' +
              '<span class="badge badge-type">' + esc(update.type) + '</span>' + demoBadge(update) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-body"><p>' + esc(update.body) + '</p></div>' +
      '</article>';
    }).join('');
  }

  var RENDERERS = {
    lectures: lecturesSection,
    summaries: summariesSection,
    assignments: assignmentsSection,
    quizzes: function (subject) { return DLP.quizView.renderSection(subject); },
    references: referencesSection,
    resources: resourcesSection,
    updates: updatesSection
  };

  function sectionExists(key) {
    return DLP.store.SECTIONS.some(function (section) { return section.key === key; });
  }

  function render(subject, activeSection) {
    var counts = DLP.store.subjectCounts(subject);
    var active = sectionExists(activeSection) ? activeSection : 'lectures';

    var tabs = DLP.store.SECTIONS.map(function (section) {
      var count = section.key === 'quizzes' ? counts.questions : counts[section.key];
      var isActive = section.key === active;
      return '<button class="sectionbar-btn" type="button" role="tab" id="tab-' + esc(section.key) + '"' +
        ' aria-selected="' + (isActive ? 'true' : 'false') + '"' +
        ' tabindex="' + (isActive ? '0' : '-1') + '"' +
        ' aria-controls="sectionPanel" data-section="' + esc(section.key) + '">' +
        esc(section.num) + ' · ' + esc(section.icon) + ' ' + esc(t(section.labelKey)) +
        '<span class="cnt">' + esc(count) + '</span></button>';
    }).join('');

    return '' +
      '<div class="wrap">' +
        DLP.layout.breadcrumbs([
          { label: t('nav.home'), href: '#/' },
          { label: subject.title, href: '#/subject/' + subject.id },
          { label: t('section.' + active) }
        ]) +
        '<section class="subject-hero" style="border-inline-start-color:' + esc(subject.accent || '#B8891B') + '">' +
          '<h1><span aria-hidden="true">' + esc(subject.icon) + '</span> ' + esc(subject.title) + '</h1>' +
          '<p>' + esc(subject.description) + '</p>' +
          '<ul class="chips">' +
            '<li class="chip">' + esc(t('section.lectures')) + ' <b>' + counts.lectures + '</b></li>' +
            '<li class="chip">' + esc(t('section.summaries')) + ' <b>' + counts.summaries + '</b></li>' +
            '<li class="chip">' + esc(t('section.assignments')) + ' <b>' + counts.assignments + '</b></li>' +
            '<li class="chip">' + esc(t('stats.questions')) + ' <b>' + counts.questions + '</b></li>' +
            '<li class="chip">' + esc(t('section.references')) + ' <b>' + counts.references + '</b></li>' +
            '<li class="chip">' + esc(t('section.resources')) + ' <b>' + counts.resources + '</b></li>' +
          '</ul>' +
        '</section>' +
        '<div class="sectionbar" role="tablist" aria-label="' + esc(t('a11y.tabs')) + '">' + tabs + '</div>' +
        '<section id="sectionPanel" role="tabpanel" aria-labelledby="tab-' + esc(active) + '" tabindex="-1">' +
          '<div class="section-title"><h2>' + esc(t('section.' + active)) + '</h2></div>' +
          RENDERERS[active](subject) +
        '</section>' +
        DLP.layout.endActions() +
      '</div>';
  }

  /** ربط أحداث الصفحة بعد الرسم. */
  function bind(subject, activeSection) {
    var bar = document.querySelector('.sectionbar');
    if (bar) {
      bar.addEventListener('click', function (event) {
        var button = event.target.closest('.sectionbar-btn');
        if (!button) { return; }
        DLP.router.navigate('#/subject/' + subject.id + '/' + button.dataset.section);
      });
      bar.addEventListener('keydown', function (event) {
        var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (keys.indexOf(event.key) === -1) { return; }
        var buttons = Array.prototype.slice.call(bar.querySelectorAll('.sectionbar-btn'));
        var index = buttons.indexOf(document.activeElement);
        if (index === -1) { return; }
        event.preventDefault();

        var next;
        if (event.key === 'Home') { next = 0; }
        else if (event.key === 'End') { next = buttons.length - 1; }
        else {
          // الاتجاه يتبع اتجاه الصفحة: في RTL السهم الأيسر يتقدّم
          var rtl = document.documentElement.getAttribute('dir') === 'rtl';
          var forward = rtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight';
          next = (index + (forward ? 1 : -1) + buttons.length) % buttons.length;
        }

        // roving tabindex: العنصر المركّز وحده يبقى في تسلسل Tab
        buttons.forEach(function (button, i) { button.setAttribute('tabindex', i === next ? '0' : '-1'); });
        buttons[next].focus();
      });
    }

    var panel = document.getElementById('sectionPanel');
    if (panel) {
      panel.addEventListener('click', function (event) {
        var toggle = event.target.closest('[data-toggle-details]');
        if (!toggle) { return; }
        var target = document.getElementById(toggle.getAttribute('data-toggle-details'));
        if (!target) { return; }
        var open = target.hasAttribute('hidden');
        if (open) { target.removeAttribute('hidden'); } else { target.setAttribute('hidden', ''); }
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.textContent = open ? DLP.i18n.t('lecture.close') : toggle.dataset.openLabel || toggle.textContent;
      });
      Array.prototype.forEach.call(panel.querySelectorAll('[data-toggle-details]'), function (button) {
        button.dataset.openLabel = button.textContent;
      });
    }

    if (activeSection === 'quizzes') { DLP.quizView.bind(subject); }
  }

  DLP.subjectView = { render: render, bind: bind, sectionExists: sectionExists, fileChip: fileChip };
})(typeof window !== 'undefined' ? window : globalThis);
