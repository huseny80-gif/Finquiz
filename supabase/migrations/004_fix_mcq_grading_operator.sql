-- ============================================================================
-- 004_fix_mcq_grading_operator.sql — استبدال المشغّل غير الموثّق ->>0 بـ #>>'{}'
-- في تصحيح أسئلة الاختيار من متعدد داخل save_quiz_answer.
--
-- ->>0 على قيمة jsonb عددية (scalar) يُعيد فعلياً القيمة النصية على نسخة
-- PostgreSQL 17.6 الحالية (تحقّقنا تجريبياً)، لكن هذا سلوك غير موثّق رسمياً في
-- توثيق jsonb (التوثيق الرسمي يذكر أن ->> على قيمة ليست مصفوفة يُعيد NULL).
-- #>>'{}' هو المشغّل الموثّق والمضمون لاستخراج نص أي قيمة jsonb عددية/منطقية/
-- نصية بصرف النظر عن كونها scalar أو لا — وهو المستخدم أصلاً لنوع tf في نفس
-- الدالة. هذا التعديل يوحّد الأسلوب ويزيل الاعتماد على سلوك غير مضمون مستقبلاً.
-- ============================================================================

create or replace function public.save_quiz_answer(p_attempt_id uuid, p_question_id text, p_response jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns boolean;
  v_type text;
  v_answer jsonb;
  v_correct boolean := false;
begin
  select exists (
    select 1 from quiz_attempts a where a.id = p_attempt_id and a.user_id = auth.uid()
  ) into v_owns;

  if not v_owns then
    raise exception 'لا تملك هذه المحاولة' using errcode = '42501';
  end if;

  select type, answer into v_type, v_answer from questions where id = p_question_id;

  case v_type
    when 'mcq' then
      v_correct := (p_response #>> '{}')::int = (v_answer #>> '{}')::int;
    when 'tf' then
      v_correct := (p_response#>>'{}')::boolean = (v_answer#>>'{}')::boolean;
    when 'fill' then
      v_correct := exists (
        select 1 from jsonb_array_elements_text(v_answer) a
        where lower(trim(a)) = lower(trim(p_response#>>'{}'))
      );
    when 'order' then
      v_correct := (
        select coalesce(jsonb_agg(item_text order by position), '[]'::jsonb)
        from question_items where question_id = p_question_id
      ) = p_response;
    when 'match' then
      v_correct := (
        select coalesce(jsonb_agg(right_text order by position), '[]'::jsonb)
        from question_pairs where question_id = p_question_id
      ) = p_response;
    else
      v_correct := false; -- open: لا تصحيح آلي
  end case;

  insert into quiz_answers (attempt_id, question_id, response, is_correct)
  values (p_attempt_id, p_question_id, p_response, v_correct)
  on conflict (attempt_id, question_id)
  do update set response = excluded.response, is_correct = excluded.is_correct, answered_at = now();

  return v_correct;
end;
$$;

revoke all on function public.save_quiz_answer(uuid, text, jsonb) from public;
grant execute on function public.save_quiz_answer(uuid, text, jsonb) to authenticated;
