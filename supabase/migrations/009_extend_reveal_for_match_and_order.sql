-- ============================================================================
-- 009: توسيع reveal_question_answer لتغطية match/order — كانت تعيد answer/rubric/
-- explanation فقط، وanswer عمود في questions لا يُستخدم أصلاً لهذين النوعين (الإجابة
-- الصحيحة لـmatch في question_pairs، ولـorder في ترتيب question_items) — أي أنها كانت
-- تعيد إجابة فارغة (null) لهذين النوعين منذ إنشائها، بلا استخدام فعلي حتى الآن يكشف ذلك.
-- ============================================================================
create or replace function public.reveal_question_answer(p_question_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question record;
  v_options jsonb;
  v_pairs jsonb;
  v_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول لعرض الإجابة الصحيحة' using errcode = '42501';
  end if;

  select id, type, answer, rubric, explanation, kind
    into v_question
  from questions
  where id = p_question_id and status = 'published';

  if not found then
    raise exception 'السؤال غير موجود';
  end if;

  if v_question.type = 'mcq' then
    select jsonb_agg(jsonb_build_object('position', position, 'label', label, 'is_correct', is_correct) order by position)
      into v_options
    from question_options where question_id = p_question_id;
  elsif v_question.type = 'match' then
    select jsonb_agg(jsonb_build_object('left', left_text, 'right', right_text) order by position)
      into v_pairs
    from question_pairs where question_id = p_question_id;
  elsif v_question.type = 'order' then
    select jsonb_agg(item_text order by position)
      into v_items
    from question_items where question_id = p_question_id;
  end if;

  return jsonb_build_object(
    'question_id', v_question.id,
    'type', v_question.type,
    'answer', v_question.answer,
    'rubric', v_question.rubric,
    'explanation', v_question.explanation,
    'options', v_options,
    'pairs', v_pairs,
    'items', v_items
  );
end;
$$;

revoke all on function public.reveal_question_answer(text) from public;
grant execute on function public.reveal_question_answer(text) to authenticated;
