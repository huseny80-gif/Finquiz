-- ============================================================================
-- 008: _grade_response يجب أن تبقى داخلية بحتة (تُستدعى فقط من check_answer/
-- save_quiz_answer) — نفس اكتشاف 006 بالضبط: revoke all ... from public لا يسحب
-- EXECUTE الممنوح افتراضياً لـ anon/authenticated تحديداً عند إنشاء أي دالة.
-- ============================================================================
revoke execute on function public._grade_response(text, jsonb) from anon, authenticated;
