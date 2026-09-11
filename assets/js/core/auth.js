/* تسجيل الدخول عبر Google باستخدام Supabase Auth.
 * قاعدة أساسية: التصفح العام (المحتوى، البحث، الاختبارات كتجربة بلا حفظ) يجب أن
 * يبقى ممكناً بالكامل بلا حساب — تسجيل الدخول مطلوب فقط لحفظ نتيجة اختبار
 * بشكل دائم (quiz_attempts/quiz_answers). لا شيء هنا يمنع تصفّح الموقع بلا اتصال. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};

  function client() { return DLP.supabaseClient || null; }

  function isAvailable() { return !!client(); }

  /** يبدأ تسجيل دخول Google عبر OAuth؛ يُعيد توجيه المتصفح فعلياً عند النجاح. */
  function signInWithGoogle() {
    var c = client();
    if (!c) { return Promise.reject(new Error('تسجيل الدخول غير متاح حالياً (لا يوجد اتصال)')); }
    return c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: global.location.origin + global.location.pathname }
    }).then(function (result) {
      if (result.error) { throw result.error; }
      return result.data;
    });
  }

  function signOut() {
    var c = client();
    if (!c) { return Promise.resolve(); }
    return c.auth.signOut().then(function (result) {
      if (result.error) { throw result.error; }
    });
  }

  /** يعيد المستخدم الحالي أو null (لا يرمي أبداً — التصفح بلا حساب حالة طبيعية). */
  function getUser() {
    var c = client();
    if (!c) { return Promise.resolve(null); }
    return c.auth.getUser().then(function (result) {
      return (result.data && result.data.user) || null;
    }).catch(function () { return null; });
  }

  /** يستدعي callback(user|null) عند كل تغيّر في حالة الدخول، ويعيد دالة لإلغاء الاشتراك. */
  function onChange(callback) {
    var c = client();
    if (!c) { return function unsubscribe() {}; }
    var subscription = c.auth.onAuthStateChange(function (_event, session) {
      callback((session && session.user) || null);
    });
    return function unsubscribe() {
      try { subscription.data.subscription.unsubscribe(); } catch (error) { /* لا شيء */ }
    };
  }

  DLP.auth = {
    isAvailable: isAvailable,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getUser: getUser,
    onChange: onChange
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.auth; }
})(typeof window !== 'undefined' ? window : globalThis);
