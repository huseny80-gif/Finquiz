/* تهيئة عميل Supabase — طبقة اتصال فقط، بلا أي منطق عمل.
 * لا يستخدم هذا الملف سوى مفتاح anon/publishable العلني (data/config/supabase.js).
 * إن تعذّرت التهيئة لأي سبب (بلا شبكة، بلا مكتبة العميل، أو تعطيل صريح)
 * يبقى DLP.supabaseClient = null ويعمل الموقع بكامله من البيانات الثابتة — لا استثناء يُرمى هنا أبداً. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};

  function createClient() {
    var config = (DLP.config && DLP.config.supabase) || {};
    if (!config.enabled || !config.url || !config.publishableKey) { return null; }

    // مكتبة العميل مُحمَّلة محلياً (assets/vendor/supabase-js.min.js) بسبب
    // Content-Security-Policy الحالي (script-src 'self') — لا تحميل من CDN.
    var lib = global.supabase;
    if (!lib || typeof lib.createClient !== 'function') { return null; }

    try {
      return lib.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (error) {
      return null;
    }
  }

  var client = createClient();

  DLP.supabaseClient = client;
  DLP.supabaseReady = !!client;

  if (typeof module !== 'undefined' && module.exports) { module.exports = { client: client }; }
})(typeof window !== 'undefined' ? window : globalThis);
