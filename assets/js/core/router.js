/* موجّه بسيط قائم على hash — يعمل على GitHub Pages وNetlify وVercel وحتى من الملف مباشرة. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var routes = [];
  var notFoundHandler = null;
  var current = null;

  /** تسجيل مسار: نمط مثل '/subject/:id/:section' */
  function add(pattern, handler) {
    var names = [];
    var regexSource = '^' + pattern.replace(/:[A-Za-z0-9_]+/g, function (match) {
      names.push(match.slice(1));
      return '([^/]+)';
    }) + '$';
    routes.push({ regex: new RegExp(regexSource), names: names, handler: handler });
  }

  function setNotFound(handler) { notFoundHandler = handler; }

  function parse(hash) {
    var raw = (hash || '').replace(/^#/, '');
    if (!raw || raw === '/') { raw = '/'; }
    var queryIndex = raw.indexOf('?');
    var path = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
    var queryString = queryIndex === -1 ? '' : raw.slice(queryIndex + 1);
    var params = {};
    queryString.split('&').filter(Boolean).forEach(function (pair) {
      var bits = pair.split('=');
      try { params[decodeURIComponent(bits[0])] = decodeURIComponent((bits[1] || '').replace(/\+/g, ' ')); }
      catch (e) { /* تجاهل الترميز غير الصالح */ }
    });
    if (path.length > 1 && path.charAt(path.length - 1) === '/') { path = path.slice(0, -1); }
    return { path: path, query: params };
  }

  function resolve(hash) {
    var parsed = parse(hash);
    for (var i = 0; i < routes.length; i++) {
      var match = routes[i].regex.exec(parsed.path);
      if (match) {
        var params = {};
        routes[i].names.forEach(function (name, index) {
          try { params[name] = decodeURIComponent(match[index + 1]); }
          catch (e) { params[name] = match[index + 1]; }
        });
        return { route: routes[i], params: params, query: parsed.query, path: parsed.path };
      }
    }
    return { route: null, params: {}, query: parsed.query, path: parsed.path };
  }

  function handle() {
    var resolved = resolve(global.location ? global.location.hash : '');
    current = resolved;
    if (resolved.route) { resolved.route.handler(resolved.params, resolved.query); }
    else if (notFoundHandler) { notFoundHandler(resolved.path); }
  }

  function navigate(hash) {
    if (global.location.hash === hash) { handle(); }
    else { global.location.hash = hash; }
  }

  function start() {
    global.addEventListener('hashchange', handle);
    handle();
  }

  DLP.router = {
    add: add, setNotFound: setNotFound, start: start, navigate: navigate,
    parse: parse, resolve: resolve, getCurrent: function () { return current; }
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.router; }
})(typeof window !== 'undefined' ? window : globalThis);
