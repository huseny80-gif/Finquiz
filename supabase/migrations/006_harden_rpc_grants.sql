-- ============================================================================
-- 006_harden_rpc_grants.sql — تشديد صلاحيات تنفيذ دوال RPC الخاصة بالمستخدم
-- المسجَّل/الإدارة، واكتشاف أُصلح أثناء بناء سقالة الإدارة (Stage 4).
--
-- الاكتشاف: `revoke all on function ... from public;` في الملفات 003/005 لا
-- يُلغي فعلياً صلاحية anon/authenticated لأن Supabase يمنح EXECUTE افتراضياً
-- لهذين الدورين تحديداً (anon, authenticated) عبر ALTER DEFAULT PRIVILEGES
-- عند إنشاء أي دالة — لا عبر الدور الوهمي PUBLIC. وبما أن REVOKE ... FROM
-- PUBLIC لا يسحب امتيازاً مُنحاً صراحةً لدور مسمّى، بقيت anon قادرة تقنياً
-- على استدعاء reveal_question_answer/start_quiz_attempt/save_quiz_answer/
-- finish_quiz_attempt/admin_get_quiz_questions عبر /rest/v1/rpc/<fn> — وإن
-- كانت كل هذه الدوال ترفض anon داخلياً برسالة خطأ واضحة (auth.uid() is null
-- أو is_admin_or_instructor()=false)، فلا تسريب بيانات فعلي وقع، لكن توسيع
-- سطح النداء بلا داعٍ يستحق التضييق الصريح.
--
-- الإصلاح: REVOKE EXECUTE من anon تحديداً (لا من PUBLIC) على دوال المستخدم
-- المسجَّل/الإدارة، وسحب صلاحية التنفيذ بالكامل من anon وauthenticated على
-- الدالتين الداخليتين البحتتين (handle_new_user: مُشغَّلة عبر trigger فقط؛
-- recompute_student_progress: تُستدعى داخلياً من finish_quiz_attempt فقط).
--
-- ما لم يُغيَّر عمداً: has_role() وis_admin_or_instructor() تبقيان قابلتين
-- للتنفيذ من anon/authenticated لأنهما تُستخدَمان داخل تعبيرات USING في كل
-- سياسات RLS تقريباً؛ سحب EXECUTE منهما سيكسر تقييم RLS نفسه لأي قارئ عادي.
-- هذا موثّق كتحذير أمان منخفض المخاطر مقبول في DATABASE_SCHEMA.md.
-- ============================================================================

revoke execute on function public.reveal_question_answer(text) from anon;
revoke execute on function public.start_quiz_attempt(text) from anon;
revoke execute on function public.save_quiz_answer(uuid, text, jsonb) from anon;
revoke execute on function public.finish_quiz_attempt(uuid) from anon;
revoke execute on function public.admin_get_quiz_questions(text) from anon;

-- handle_new_user لم تُقيَّد صراحةً في 003_functions.sql، فبقيت على الامتياز
-- الافتراضي القياسي في PostgreSQL: EXECUTE ممنوحة للدور الوهمي PUBLIC (لا
-- anon/authenticated تحديداً) — لذا REVOKE ... FROM PUBLIC هو الصيغة الصحيحة
-- هنا تحديداً، بخلاف بقية دوال هذا الملف الممنوحة صراحةً لأدوار مسمّاة.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.recompute_student_progress(uuid, text) from anon, authenticated;
