/* نقطة التشغيل: تركيب الهيكل، تسجيل المسارات، وبدء الموجّه. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function el(id) { return document.getElementById(id); }

  /** أول رسم للصفحة — لا يُنقل فيه التركيز حفاظاً على ترتيب Tab الطبيعي. */
  var firstRender = true;

  function setTitle(parts, description) {
    var site = DLP.config.site;
    document.title = parts.concat([site.brand.name + ' — ' + site.program]).filter(Boolean).join(' | ');
    var meta = document.querySelector('meta[name="description"]');
    if (meta) { meta.setAttribute('content', description || site.description); }
    announce(parts.filter(Boolean).join(' — '));
  }

  /** إعلان تغيّر الصفحة لقارئ الشاشة. */
  function announce(text) {
    var region = el('routeAnnouncer');
    if (!region) { return; }
    region.textContent = '';
    // تأخير بسيط يضمن التقاط قارئ الشاشة للتغيير
    global.setTimeout(function () { region.textContent = t('nav.nowViewing') + ': ' + text; }, 60);
  }

  function paint(html, focusSelector) {
    var main = el('main');
    main.innerHTML = html;
    DLP.layout.syncActiveNav(DLP.router.getCurrent() ? DLP.router.getCurrent().path : '/');
    if (focusSelector) {
      var target = main.querySelector(focusSelector);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.focus({ preventScroll: true });
      }
    } else {
      global.scrollTo({ top: 0, behavior: 'auto' });
      // نقل التركيز إلى عنوان الصفحة عند التنقل فقط.
      // عند أول تحميل نترك التركيز في بداية المستند حتى يصل المستخدم
      // إلى رابط التخطي وشريط التنقل بمفتاح Tab بشكل طبيعي.
      if (!firstRender) {
        var heading = main.querySelector('h1') || main;
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
    firstRender = false;
  }

  function renderHome() {
    setTitle([t('nav.home')]);
    paint(DLP.homeView.render());
  }

  function renderSubject(params, query) {
    var subject = DLP.store.getSubject(params.id);
    if (!subject) { return renderNotFound(); }
    var section = params.section && DLP.subjectView.sectionExists(params.section) ? params.section : 'lectures';
    setTitle([t('section.' + section), subject.title], subject.description);
    paint(DLP.subjectView.render(subject, section));
    DLP.subjectView.bind(subject, section);

    focusTarget(query);
  }

  function renderSearch(params, query) {
    var value = (query && query.q) || '';
    setTitle([t('search.results')]);
    paint(DLP.searchView.render(value));
    var input = el('globalSearchInput');
    if (input && value) { input.value = value; }
  }

  function renderAbout(params, query) {
    setTitle([t('nav.about')], DLP.config.about.intro);
    paint(DLP.aboutView.render());
    focusTarget(query);
  }

  /** تمرير التركيز إلى عنصر محدّد عبر ?focus= */
  function focusTarget(query) {
    if (!query || !query.focus) { return; }
    var target = document.getElementById(query.focus);
    if (!target) { return; }
    target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }

  function renderNotFound() {
    setTitle([t('common.notFound')]);
    paint('<div class="wrap"><div class="empty-state" style="margin-top:30px">' +
      '<div class="big" aria-hidden="true">🧭</div>' +
      '<h2>' + esc(t('common.notFound')) + '</h2>' +
      '<p>' + esc(t('common.notFoundHint')) + '</p>' +
      '<p style="margin-top:14px"><a class="btn btn-primary" href="#/">⌂ ' + esc(t('common.home')) + '</a></p>' +
    '</div>' + DLP.layout.endActions() + '</div>');
  }

  function init() {
    // بناء الهيكل الثابت مرة واحدة
    el('shellHeader').innerHTML = DLP.layout.renderHeader();
    el('shellFooter').innerHTML = DLP.layout.renderFooter();
    DLP.layout.bindShell();

    DLP.router.add('/', renderHome);
    DLP.router.add('/search', renderSearch);
    DLP.router.add('/about', renderAbout);
    DLP.router.add('/subject/:id', renderSubject);
    DLP.router.add('/subject/:id/:section', renderSubject);
    DLP.router.setNotFound(renderNotFound);
    DLP.router.start();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

  DLP.app = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
