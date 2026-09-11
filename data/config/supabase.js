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
    /**
     * معطَّل عمداً حتى الآن رغم أن كل طبقة الاتصال (supabase.js/api.js/auth.js)
     * وhydrate() في core/store.js مكتملة ومُختبرة: أسئلة المطابقة (question_pairs)
     * محجوبة بالكامل عن anon في RLS الحالي (فجوة موثّقة في DATABASE_SCHEMA.md)،
     * وتفعيل القراءة الحية الآن يعني وصول pairs=[] لكل سؤال مطابقة على الموقع
     * الفعلي — أي كسر صامت لنوع سؤال كامل. لا يُفعَّل (true) قبل حل تلك الفجوة
     * والتحقق يدوياً بمتصفح حقيقي متصل بالمشروع. الموقع يعمل حالياً بالكامل من
     * الملفات الثابتة بلا أي فرق ملحوظ.
     */
    enabled: false
  };

  global.DLP = global.DLP || {};
  global.DLP.config = global.DLP.config || {};
  global.DLP.config.supabase = SUPABASE_CONFIG;

  if (typeof module !== 'undefined' && module.exports) { module.exports = SUPABASE_CONFIG; }
})(typeof window !== 'undefined' ? window : globalThis);
