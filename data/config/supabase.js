/**
 * إعدادات الاتصال بـ Supabase — تُقرأ من هنا فقط، ولا تحتوي أي سرّ.
 *
 * القيمتان أدناه (URL ومفتاح publishable/anon) آمنتان للنشر العلني في كود
 * المتصفح بتصميم Supabase نفسه: كل الحماية الفعلية تقع على مستوى قاعدة
 * البيانات (Row Level Security + إخفاء أعمدة عبر GRANT/REVOKE — انظر
 * supabase/migrations/002_rls.sql)، لا على إخفاء هذا المفتاح.
 *
 * مفتاح الصلاحية الكاملة (الخادمي، غير الآمن للنشر) لا يظهر هنا ولا في أي ملف
 * آخر تحت assets/ أو data/ — يُستخدم فقط من طرف الخادم/أداة تطبيق الـ migrations،
 * ولا يصل للمتصفح إطلاقاً.
 */
(function (global) {
  'use strict';

  var SUPABASE_CONFIG = {
    url: 'https://kotbarynxzyhxhzribpf.supabase.co',
    publishableKey: 'sb_publishable_fYEDizdjzzxiQTHvGks2Hw_IGHXqTCn',
    /** أوقف الاتصال بالكامل بتغيير هذه القيمة إلى false — الموقع يعمل بالكامل من الملفات الثابتة. */
    enabled: true
  };

  global.DLP = global.DLP || {};
  global.DLP.config = global.DLP.config || {};
  global.DLP.config.supabase = SUPABASE_CONFIG;

  if (typeof module !== 'undefined' && module.exports) { module.exports = SUPABASE_CONFIG; }
})(typeof window !== 'undefined' ? window : globalThis);
