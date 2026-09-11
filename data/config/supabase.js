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
     * مفعَّل: القراءة الحية من القاعدة (hydrate()) نشطة. الفجوتان اللتان كانتا
     * تمنعان هذا سابقاً حُلَّتا:
     * 1) question_pairs (أسئلة المطابقة) — get_match_pairs() RPC تعيد الطرفين
     *    كمصفوفتين منفصلتين تماماً بلا ترابط (007_safe_match_pairs_and_public_check.sql).
     * 2) api.js كان يستخدم select('*') على questions/question_options/question_items —
     *    هذه الأعمدة محجوبة جزئياً على مستوى العمود (002_rls.sql)، وselect('*') كان
     *    سيفشل بـ 42501 فعلياً على أي اتصال حقيقي. أُصلح باستخدام قوائم أعمدة صريحة
     *    تطابق ما هو ممنوح بالضبط (انظر assets/js/core/api.js وtests/run.js التي
     *    تحاكي هذا القيد فعلياً وتفشل عمداً لو رجع select('*')).
     * التصحيح لمحتوى القاعدة أصبح خادمياً (check_answer/save_quiz_answer عبر RPC)
     * بدل المقارنة المحلية المباشرة — انظر quiz-view.js وIMPLEMENTATION_REPORT.md
     * لتفاصيل ما تحقّق منه فعلياً قبل هذا التفعيل، وما تبقّى غير مُتحقَّق منه في
     * متصفح حقيقي متصل (محجوب في بيئة تطوير هذه الجلسة بسياسة شبكة خارجية).
     */
    enabled: true
  };

  global.DLP = global.DLP || {};
  global.DLP.config = global.DLP.config || {};
  global.DLP.config.supabase = SUPABASE_CONFIG;

  if (typeof module !== 'undefined' && module.exports) { module.exports = SUPABASE_CONFIG; }
})(typeof window !== 'undefined' ? window : globalThis);
