/* الهيكل العام: الترويسة، التنقل، البحث، التذييل، أزرار الرجوع. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function site() { return DLP.config.site; }

  /** قائمة روابط التنقل الموحّدة (تُستخدم في الهيدر، الشريط الجانبي، وشريط الجوال السفلي). */
  function navItems() {
    var subjects = DLP.store.subjects();
    return {
      home: { href: '#/', icon: '🏠', label: t('nav.home') },
      subjects: subjects.map(function (subject) {
        return { href: '#/subject/' + subject.id, icon: subject.icon || '📘', label: subject.shortTitle || subject.title, title: subject.title };
      }),
      more: [
        { href: '#/library', icon: '📚', label: t('nav.library'), badge: t('common.comingSoon') },
        { href: '#/assistant', icon: '🤖', label: t('nav.assistant'), badge: t('common.comingSoon') },
        { href: '#/certificates', icon: '🎓', label: t('nav.certificates'), badge: t('common.comingSoon') },
        { href: '#/about', icon: 'ℹ️', label: t('nav.about') },
        { href: '#/about?focus=contact', icon: '✉️', label: t('nav.contact') }
      ]
    };
  }

  function renderHeader() {
    var s = site();
    var nav = navItems();
    // الشريط الجانبي (Desktop) يعرض القائمة كاملة؛ شريط الهيدر العلوي يبقى مختصراً على
    // الشاشات الواسعة (الرئيسية + المواد + من نحن) لتفادي الازدواج، مع بقاء القائمة
    // الكاملة في قائمة الجوال المنسدلة (نفس <nav id="mainNav">).
    var extraHrefs = ['#/library', '#/assistant', '#/certificates'];
    var links = [nav.home].concat(nav.subjects).concat(nav.more
      .filter(function (item) { return item.href !== '#/about?focus=contact'; })
      .map(function (item) {
        if (extraHrefs.indexOf(item.href) !== -1) {
          return { href: item.href, label: item.label, title: item.title, extra: true };
        }
        return item;
      }));

    return '' +
      '<a class="skip-link" href="#main">' + esc(t('nav.skip')) + '</a>' +
      '<header class="site-header">' +
        '<div class="header-inner">' +
          '<a class="brand" href="#/">' +
            '<img class="brand-logo" src="' + esc(s.brand.logoImage) + '" alt="" aria-hidden="true">' +
            '<span class="brand-text">' +
              '<span class="brand-name">' + esc(s.brand.name) + '</span>' +
              '<span class="brand-sub">' + esc(s.program) + '</span>' +
            '</span>' +
          '</a>' +
          '<button class="theme-toggle" id="themeToggle" type="button" aria-pressed="false" aria-label="' + esc(t('theme.toggle')) + '" title="' + esc(t('theme.toggle')) + '">' +
            '<span aria-hidden="true" id="themeToggleIcon">🌙</span>' +
          '</button>' +
          '<button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="mainNav">' +
            '☰ ' + esc(t('nav.menu')) +
          '</button>' +
          '<nav class="main-nav" id="mainNav" aria-label="' + esc(t('nav.menu')) + '">' +
            '<ul class="nav-list">' +
              links.map(function (link) {
                return '<li><a class="nav-link' + (link.extra ? ' nav-link-extra' : '') + '" href="' + esc(link.href) + '"' +
                  (link.title ? ' title="' + esc(link.title) + '"' : '') + '>' + esc(link.label) + '</a></li>';
              }).join('') +
            '</ul>' +
          '</nav>' +
        '</div>' +
        '<div class="search-bar">' +
          '<form class="search-inner" id="globalSearchForm" role="search">' +
            '<label class="visually-hidden" for="globalSearchInput">' + esc(t('search.label')) + '</label>' +
            '<input class="search-input" id="globalSearchInput" type="search" autocomplete="off" ' +
              'placeholder="' + esc(t('search.placeholder')) + '">' +
            '<button class="btn-search" type="submit">🔍 ' + esc(t('search.button')) + '</button>' +
          '</form>' +
        '</div>' +
      '</header>';
  }

  function renderFooter() {
    var s = site();
    var subjects = DLP.store.subjects();
    return '' +
      '<footer class="site-footer">' +
        '<div class="wrap">' +
          '<div class="footer-grid">' +
            '<div class="footer-col footer-brand">' +
              '<p class="fb-name">' + esc(s.brand.name) + '</p>' +
              '<p class="fb-gold">' + esc(s.program) + '</p>' +
              '<p>' + esc(s.course) + '</p>' +
              '<p style="margin-top:10px">' + esc(s.author) + '</p>' +
            '</div>' +
            '<div class="footer-col">' +
              '<h3>' + esc(t('footer.subjects')) + '</h3>' +
              '<ul>' + subjects.map(function (subject) {
                return '<li><a href="#/subject/' + esc(subject.id) + '">' + esc(subject.title) + '</a></li>';
              }).join('') + '</ul>' +
            '</div>' +
            '<div class="footer-col">' +
              '<h3>' + esc(t('footer.links')) + '</h3>' +
              '<ul>' +
                '<li><a href="#/">' + esc(t('nav.home')) + '</a></li>' +
                '<li><a href="#/about">' + esc(t('nav.about')) + '</a></li>' +
                '<li><a href="#/about?focus=contact">' + esc(t('nav.contact')) + '</a></li>' +
                '<li><a href="#/search">' + esc(t('search.results')) + '</a></li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
          '<div class="footer-bottom">' +
            '<span>© ' + esc(s.updatedYear) + ' ' + esc(s.brand.name) + ' — ' + esc(t('footer.rights')) + '</span>' +
            '<span>' + esc(t('footer.updated')) + ': ' + esc(s.updatedYear) + '</span>' +
          '</div>' +
        '</div>' +
      '</footer>';
  }

  /** الشريط الجانبي (Desktop، مع وضع مطوي). */
  function renderSidebar() {
    var nav = navItems();
    function link(item) {
      return '<a class="side-link" href="' + esc(item.href) + '"' +
        (item.title ? ' title="' + esc(item.title) + '"' : '') + '>' +
          '<span class="side-icon" aria-hidden="true">' + esc(item.icon) + '</span>' +
          '<span class="side-label">' + esc(item.label) + '</span>' +
          (item.badge ? '<span class="side-badge">' + esc(item.badge) + '</span>' : '') +
        '</a>';
    }
    return '' +
      '<nav class="app-sidebar" id="appSidebar" aria-label="' + esc(t('nav.menu')) + '">' +
        link(nav.home) +
        '<div class="side-group-title">' + esc(t('nav.subjects')) + '</div>' +
        nav.subjects.map(link).join('') +
        '<div class="side-group-title">' + esc(t('nav.bottomMenu')) + '</div>' +
        nav.more.map(link).join('') +
        '<button class="sidebar-toggle" id="sidebarToggle" type="button" aria-pressed="false">' +
          '<span aria-hidden="true" id="sidebarToggleIcon">⇤</span>' +
          '<span id="sidebarToggleLabel">' + esc(t('nav.sidebarCollapse')) + '</span>' +
        '</button>' +
      '</nav>';
  }

  /** شريط التنقل السفلي (الجوال). */
  function renderBottomNav() {
    var nav = navItems();
    var items = [
      nav.home,
      { href: '#/search', icon: '🔍', label: t('search.button') },
      { href: '#/library', icon: '📚', label: t('nav.library') },
      { href: '#bottomMenuTrigger', icon: '☰', label: t('nav.bottomMenu'), isMenu: true }
    ];
    return '' +
      '<nav class="bottom-nav" aria-label="' + esc(t('nav.menu')) + '">' +
        '<ul class="bottom-nav-list">' +
          items.map(function (item) {
            return '<li>' + (item.isMenu
              ? '<button class="bottom-nav-link" type="button" id="bottomMenuTrigger">' +
                  '<span class="bn-icon" aria-hidden="true">' + esc(item.icon) + '</span>' + esc(item.label) +
                '</button>'
              : '<a class="bottom-nav-link" href="' + esc(item.href) + '">' +
                  '<span class="bn-icon" aria-hidden="true">' + esc(item.icon) + '</span>' + esc(item.label) +
                '</a>') + '</li>';
          }).join('') +
        '</ul>' +
      '</nav>';
  }

  /** أزرار "الرجوع إلى أعلى" و"الرئيسية" في نهاية الصفحة. */
  function endActions() {
    return '' +
      '<div class="page-end-actions">' +
        '<button class="btn btn-ghost" type="button" data-action="scroll-top">↑ ' + esc(t('common.backToTop')) + '</button>' +
        '<span class="divider" aria-hidden="true"></span>' +
        '<a class="btn btn-primary" href="#/">⌂ ' + esc(t('common.home')) + '</a>' +
      '</div>';
  }

  function breadcrumbs(items) {
    return '' +
      '<nav class="breadcrumbs" aria-label="' + esc(t('a11y.breadcrumbs')) + '"><ol>' +
        items.map(function (item, index) {
          var isLast = index === items.length - 1;
          return '<li>' + (isLast || !item.href
            ? '<span aria-current="page">' + esc(item.label) + '</span>'
            : '<a href="' + esc(item.href) + '">' + esc(item.label) + '</a>') + '</li>';
        }).join('') +
      '</ol></nav>';
  }

  function scrollTop() {
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** تفعيل السلوكيات المشتركة بعد رسم الهيكل (مرة واحدة). */
  function bindShell() {
    var toggle = document.getElementById('navToggle');
    var nav = document.getElementById('mainNav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.addEventListener('click', function (event) {
        if (event.target.closest('a')) {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    var form = document.getElementById('globalSearchForm');
    var input = document.getElementById('globalSearchInput');
    if (form && input) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = input.value.trim();
        DLP.router.navigate(value ? '#/search?q=' + encodeURIComponent(value) : '#/search');
      });
    }

    var fab = document.getElementById('fabTop');
    if (fab) {
      fab.addEventListener('click', scrollTop);
      global.addEventListener('scroll', function () {
        if (global.scrollY > 400) { fab.classList.add('show'); }
        else { fab.classList.remove('show'); }
      }, { passive: true });
    }

    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-action="scroll-top"]');
      if (trigger) { scrollTop(); }
    });

    bindThemeToggle();
    bindSidebar();

    var bottomMenuTrigger = document.getElementById('bottomMenuTrigger');
    if (bottomMenuTrigger && toggle) {
      bottomMenuTrigger.addEventListener('click', function () { toggle.click(); });
    }
  }

  /** مفتاح الوضع الداكن/الفاتح — يُطبَّق مبكراً في theme-init.js، وهنا يُفعَّل التبديل والحفظ فقط. */
  function bindThemeToggle() {
    var btn = document.getElementById('themeToggle');
    var icon = document.getElementById('themeToggleIcon');
    if (!btn) { return; }
    function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
    function sync() {
      var dark = isDark();
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? t('theme.light') : t('theme.dark'));
      btn.setAttribute('title', dark ? t('theme.light') : t('theme.dark'));
      if (icon) { icon.textContent = dark ? '☀️' : '🌙'; }
    }
    btn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { global.localStorage.setItem('dlp.theme', next); } catch (e) { /* تجاهل غياب التخزين المحلي */ }
      sync();
    });
    sync();
  }

  /** طي/توسيع الشريط الجانبي (Desktop) — حالة محفوظة عبر الجلسات. */
  function bindSidebar() {
    var sidebar = document.getElementById('appSidebar');
    var toggle = document.getElementById('sidebarToggle');
    var icon = document.getElementById('sidebarToggleIcon');
    var label = document.getElementById('sidebarToggleLabel');
    if (!sidebar || !toggle) { return; }
    function apply(collapsed) {
      sidebar.classList.toggle('collapsed', collapsed);
      toggle.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      if (icon) { icon.textContent = collapsed ? '⇥' : '⇤'; }
      if (label) { label.textContent = collapsed ? t('nav.sidebarExpand') : t('nav.sidebarCollapse'); }
    }
    var saved;
    try { saved = global.localStorage.getItem('dlp.sidebar.collapsed') === '1'; } catch (e) { saved = false; }
    apply(saved);
    toggle.addEventListener('click', function () {
      var collapsed = !sidebar.classList.contains('collapsed');
      apply(collapsed);
      try { global.localStorage.setItem('dlp.sidebar.collapsed', collapsed ? '1' : '0'); } catch (e) { /* تجاهل */ }
    });
  }

  /** تحديث الرابط النشط في كل عناصر التنقل (الهيدر، الشريط الجانبي، شريط الجوال). */
  function syncActiveNav(path) {
    var links = document.querySelectorAll('.nav-link, .side-link, .bottom-nav-link[href]');
    Array.prototype.forEach.call(links, function (link) {
      var href = link.getAttribute('href').replace(/^#/, '');
      var active = href === path || (href !== '/' && path.indexOf(href) === 0);
      if (active) { link.setAttribute('aria-current', 'page'); }
      else { link.removeAttribute('aria-current'); }
    });
  }

  DLP.layout = {
    renderHeader: renderHeader,
    renderFooter: renderFooter,
    renderSidebar: renderSidebar,
    renderBottomNav: renderBottomNav,
    endActions: endActions,
    breadcrumbs: breadcrumbs,
    bindShell: bindShell,
    syncActiveNav: syncActiveNav,
    scrollTop: scrollTop
  };
})(typeof window !== 'undefined' ? window : globalThis);
