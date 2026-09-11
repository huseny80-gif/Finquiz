-- ============================================================================
-- 005_admin_read_functions.sql — دالة قراءة آمنة لسقالة الإدارة (Stage 4).
--
-- المشكلة التي تحلّها: أعمدة الإجابات في questions/question_options (answer,
-- rubric, explanation, is_correct) محجوبة عن anon/authenticated على مستوى
-- العمود منذ 002_rls.sql (لمنع تسريبها للطلاب). لكن هذا الحجب غير مشروط —
-- GRANT/REVOKE على مستوى العمود لا يمكن أن يُقيَّد بشرط "إلا إذا كان admin"،
-- فحتى مستخدم admin/instructor حقيقي لا يستطيع قراءة هذه الأعمدة عبر REST
-- مباشرة اليوم؛ منحها لـ service_role فقط (كما في 002_rls.sql) يكفي
-- للـ migrations لكنه لا يكفي للوحة إدارة تعمل من المتصفح بحساب المستخدم
-- العادي (authenticated لا service_role).
--
-- الحل: دالة SECURITY DEFINER واحدة تتحقّق من is_admin_or_instructor() أولاً
-- (وترفض بوضوح إن لم يكن كذلك)، ثم تُعيد الأسئلة كاملة الأعمدة (بما فيها
-- الإجابات) كـ jsonb — تماماً كما تفعل reveal_question_answer لسؤال واحد، لكن
-- هنا لكل أسئلة اختبار واحد دفعة واحدة، ولـ admin/instructor فقط لا الطالب.
-- ============================================================================

create or replace function public.admin_get_quiz_questions(p_quiz_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin_or_instructor() then
    raise exception 'صلاحية غير كافية — للمشرفين والمدرّسين فقط' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id, 'quiz_id', q.quiz_id, 'lecture_id', q.lecture_id, 'type', q.type,
      'difficulty', q.difficulty, 'prompt', q.prompt, 'kind', q.kind, 'status', q.status,
      'explanation', q.explanation, 'answer', q.answer, 'rubric', q.rubric,
      'options', (
        select coalesce(jsonb_agg(
          jsonb_build_object('position', o.position, 'label', o.label, 'is_correct', o.is_correct)
          order by o.position), '[]'::jsonb)
        from question_options o where o.question_id = q.id
      ),
      'pairs', (
        select coalesce(jsonb_agg(
          jsonb_build_object('position', p.position, 'left', p.left_text, 'right', p.right_text)
          order by p.position), '[]'::jsonb)
        from question_pairs p where p.question_id = q.id
      ),
      'items', (
        select coalesce(jsonb_agg(
          jsonb_build_object('position', i.position, 'text', i.item_text)
          order by i.position), '[]'::jsonb)
        from question_items i where i.question_id = q.id
      )
    ) order by q.id
  ), '[]'::jsonb) into v_result
  from questions q
  where q.quiz_id = p_quiz_id;

  return v_result;
end;
$$;

revoke all on function public.admin_get_quiz_questions(text) from public;
grant execute on function public.admin_get_quiz_questions(text) to authenticated;
