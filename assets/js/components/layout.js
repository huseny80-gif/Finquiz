/* الهيكل العام: الترويسة، التنقل، البحث، التذييل، أزرار الرجوع. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  function site() { return DLP.config.site; }

  function renderHeader() {
    var s = site();
    var subjects = DLP.store.subjects();
    var links = [{ href: '#/', label: t('nav.home') }]
      .concat(subjects.map(function (subject) {
        return { href: '#/subject/' + subject.id, label: subject.shortTitle || subject.title, title: subject.title };
      }))
      .concat([{ href: '#/about', label: t('nav.about') }]);

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
          '<button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="mainNav">' +
            '☰ ' + esc(t('nav.menu')) +
          '</button>' +
          '<nav class="main-nav" id="mainNav" aria-label="' + esc(t('nav.menu')) + '">' +
            '<ul class="nav-list">' +
              links.map(function (link) {
                return '<li><a class="nav-link" href="' + esc(link.href) + '"' +
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
  }

  /** تحديث الرابط النشط في شريط التنقل. */
  function syncActiveNav(path) {
    var links = document.querySelectorAll('.nav-link');
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
    endActions: endActions,
    breadcrumbs: breadcrumbs,
    bindShell: bindShell,
    syncActiveNav: syncActiveNav,
    scrollTop: scrollTop
  };
})(typeof window !== 'undefined' ? window : globalThis);
