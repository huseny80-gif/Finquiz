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

  function renderAdminSubjectHub(params) {
    setTitle([t('admin.title')], t('admin.intro'));
    paint(DLP.adminSubjectHubView.render());
    DLP.adminSubjectHubView.bind(params.id);
  }

  /** يربط مسار #/admin/subject/:id/:section بملف الإدارة الصحيح — نفس فكرة
   * ADMIN_SECTION_VIEWS بدل if/else متكرّر لكل قسم. */
  var ADMIN_SECTION_VIEWS = {
    lectures: 'adminLecturesView', summaries: 'adminSummariesView', assignments: 'adminAssignmentsView',
    quizzes: 'adminQuizzesView', references: 'adminReferencesView', resources: 'adminResourcesView',
    updates: 'adminUpdatesView'
  };

  function renderAdminSection(params) {
    var viewName = ADMIN_SECTION_VIEWS[params.section];
    if (!viewName || !DLP[viewName]) { return renderNotFound(); }
    setTitle([t('admin.hub.' + params.section), t('admin.title')], t('admin.intro'));
    paint(DLP[viewName].render());
    DLP[viewName].bind(params.id);
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
    DLP.router.add('/admin/subject/:id', renderAdminSubjectHub);
    DLP.router.add('/admin/subject/:id/:section', renderAdminSection);
    DLP.router.add('/subject/:id', renderSubject);
    DLP.router.add('/subject/:id/:section', renderSubject);
    DLP.router.setNotFound(renderNotFound);
    DLP.router.start();

    // محاولة ملء البيانات من Supabase في الخلفية بمعزل تام عن العرض الأول — تسقط
    // بهدوء على البيانات الثابتة عند أي فشل/بطء/غياب اتصال (انظر core/store.js
    // hydrate()، بما فيها مهلتها الداخلية).
    DLP.store.hydrate().then(function (changed) {
      if (!changed) { return; }
      // حالة اختبار مخزَّنة في الذاكرة (quiz-view.js) قد تشير إلى كائنات أسئلة من
      // البيانات الثابتة القديمة (لو كان المستخدم قد فتح اختباراً قبل نجاح hydrate) —
      // بلا هذا التحديث تبقى تلك الكائنات القديمة (بلا pairsLeft/pairsRight مثلاً)
      // بينما remoteMode() أصبحت true عالمياً، فينكسر رسم بعض أنواع الأسئلة بصمت.
      // نُحدِّث كائنات الأسئلة بالمعرّف فقط (ترتيبها مضمون التطابق) — تُستخدَم فوراً
      // في أي رسم لاحق (renderQuiz/renderQuestion يُستدعيان طبيعياً مع أي تفاعل قادم).
      if (DLP.quizView && typeof DLP.quizView.refreshAllQuestionObjects === 'function') {
        DLP.quizView.refreshAllQuestionObjects();
      }
      // عمداً: لا نُعيد رسم الهيكل/المسار الحالي فوراً هنا. جرّبنا ذلك (renderShell +
      // router.navigate) وكشف CI حقيقي سباقاً خطيراً: إعادة الرسم القسرية تستبدل DOM
      // بأكمله حتى لو كان المستخدم يتفاعل مع اختبار في تلك اللحظة بالذات (يختار من
      // قائمة منسدلة، أو بانتظار نتيجة "تحقّق" قيد التنفيذ) — يقطع مقابض العناصر
      // القديمة ويُفسد التفاعل الجاري بصمت. بما أن render* كلها تُستدعى طبيعياً مع أي
      // إجراء تالٍ (تالٍ/تحقّق/تصفية)، تحديث البيانات وحده (أعلاه) يكفي لضمان صحة أي
      // رسم لاحق؛ الصفحة المفتوحة حالياً تبقى بصرياً كما هي حتى أول تفاعل تالٍ من
      // المستخدم، والتنقّلات الجديدة (لصفحة أخرى أو لاحقاً لنفس الصفحة) تُبنى دائماً
      // من DLP.data المُحدَّثة فعلياً.
    });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

  DLP.app = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
