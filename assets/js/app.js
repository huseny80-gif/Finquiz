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
    // مسح إعلان الصفحة السابقة فوراً وتزامنياً حتى لا يُقرأ نص قديم أثناء الانتقال
    var announcer = el('routeAnnouncer');
    if (announcer) { announcer.textContent = ''; }
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

  function renderLibrary() {
    setTitle([t('nav.library')], t('library.intro'));
    paint(DLP.libraryView.render());
  }

  function renderAssistant() {
    setTitle([t('nav.assistant')], t('assistant.intro'));
    paint(DLP.assistantView.render());
  }

  function renderCertificates() {
    setTitle([t('nav.certificates')], t('certificates.intro'));
    paint(DLP.certificatesView.render());
  }

  function renderDashboard() {
    setTitle([t('nav.dashboard')], t('dashboard.intro'));
    paint(DLP.dashboardView.render());
    DLP.dashboardView.bind();
  }

  function renderAdmin() {
    setTitle([t('admin.title')], t('admin.intro'));
    paint(DLP.adminView.render());
    DLP.adminView.bind();
  }

  function renderAdminQuiz(params) {
    setTitle([t('admin.questionsTitle'), t('admin.title')], t('admin.intro'));
    paint(DLP.adminQuestionsView.render());
    DLP.adminQuestionsView.bind(params.quizId);
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

  /** يعيد رسم الهيكل الثابت (Header/Sidebar/Footer/BottomNav) وإعادة ربط أحداثه. */
  function renderShell() {
    el('shellHeader').innerHTML = DLP.layout.renderHeader();
    el('shellFooter').innerHTML = DLP.layout.renderFooter();
    el('shellSidebar').outerHTML = DLP.layout.renderSidebar();
    el('shellBottomNav').innerHTML = DLP.layout.renderBottomNav();
    // ملاحظة: bindShell() تُستدعى أيضاً لاحقاً عند نجاح hydrate() (انظر init())،
    // فتُعاد ربط بعض المستمعات على مستوى document/window (scroll-top، fab) مرتين
    // — تأثير عديم الضرر (toggle/scroll idempotent) لا يستحق تعقيد فصل الدالة.
    DLP.layout.bindShell();
  }

  function init() {
    // رسم فوري بالبيانات المتاحة حالياً (ثابتة افتراضياً) — لا ننتظر الشبكة أبداً
    // قبل أول عرض؛ صفحة فارغة لثوانٍ ريثما يُحسم اتصال Supabase تجربة أسوأ من عرض
    // فوري ثم تحديث لاحق صامت عند نجاح hydrate() (انظر أسفله).
    renderShell();

    DLP.router.add('/', renderHome);
    DLP.router.add('/search', renderSearch);
    DLP.router.add('/about', renderAbout);
    DLP.router.add('/library', renderLibrary);
    DLP.router.add('/assistant', renderAssistant);
    DLP.router.add('/certificates', renderCertificates);
    DLP.router.add('/dashboard', renderDashboard);
    DLP.router.add('/admin', renderAdmin);
    DLP.router.add('/admin/quiz/:quizId', renderAdminQuiz);
    DLP.router.add('/subject/:id', renderSubject);
    DLP.router.add('/subject/:id/:section', renderSubject);
    DLP.router.setNotFound(renderNotFound);
    DLP.router.start();

    // محاولة ملء البيانات من Supabase في الخلفية بمعزل تام عن العرض الأول — تسقط
    // بهدوء على البيانات الثابتة عند أي فشل/بطء/غياب اتصال (انظر core/store.js
    // hydrate()، بما فيها مهلتها الداخلية). عند النجاح فقط، نُعيد رسم الهيكل
    // والمسار الحالي مرة واحدة ليعكسا البيانات الحقيقية.
    DLP.store.hydrate().then(function (changed) {
      if (!changed) { return; }
      // حالة اختبار مخزَّنة في الذاكرة (quiz-view.js) قد تشير إلى كائنات أسئلة من
      // البيانات الثابتة القديمة (لو كان المستخدم قد فتح اختباراً قبل نجاح hydrate) —
      // بلا هذا التصفير تبقى تلك الكائنات القديمة (بلا pairsLeft/pairsRight مثلاً)
      // بينما remoteMode() أصبحت true عالمياً، فينكسر رسم بعض أنواع الأسئلة بصمت.
      // إعادة التحميل من localStorage بعد التصفير تُبقي تقدّم المستخدم (index/إجابات).
      if (DLP.quizView && typeof DLP.quizView.resetStates === 'function') { DLP.quizView.resetStates(); }
      renderShell();
      DLP.router.navigate(global.location.hash || '#/');
    });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

  DLP.app = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
