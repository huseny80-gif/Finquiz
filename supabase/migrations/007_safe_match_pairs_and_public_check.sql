-- ============================================================================
-- 007: حل فجوة question_pairs (عرض آمن غير مترابط) + دالة تصحيح عامة بلا حفظ
-- ============================================================================
-- المشكلة: question_pairs مقصور بالكامل على admin/instructor لأن كل صف يحمل
-- left_text وright_text معاً (الترابط الصحيح نفسه) — لا يمكن منح anon/authenticated
-- قراءة الجدول مباشرة، ولو بأعمدة محدودة، دون كشف الإجابة الصحيحة لكل زوج.
--
-- الحل: دالة SECURITY DEFINER تعيد الطرفين كمصفوفتين منفصلتين تماماً بلا أي ترابط
-- في الشكل المُعاد: 'left' مرتّبة حسب position (الترتيب نفسه ليس سرّاً، فقط الربط
-- الصحيح بين طرف وطرف هو السرّ)، و'right' بترتيب عشوائي مستقل يتغيّر مع كل استدعاء.
-- الواجهة (quiz-view.js) أصلاً تُعيد ترتيب الخيارات أبجدياً قبل العرض، فلا حاجة
-- لأي ترتيب معيّن في 'right' أصلاً.
--
-- كذلك: core/quiz.js يصحّح كل الأنواع محلياً بمقارنة مباشرة بـ question.answer/
-- pairs[].right/items — وهذه القيم غير متوفرة أبداً لعميل anon/authenticated عادي
-- (محجوبة عمداً على مستوى العمود منذ 002_rls.sql). لذلك عند تفعيل القراءة الحية من
-- القاعدة مستقبلاً، لا يمكن للتصحيح المحلي أن يعمل بلا معرفة الإجابة. الحل: دالة
-- تصحيح عامة (check_answer) لا تحفظ شيئاً ولا تتطلب تسجيل دخول — تعيد فقط true/false
-- لإجابة واحدة مرسلة صراحة من المستخدم، بلا أي كشف للبنك الكامل من الإجابات. هذا لا
-- يوسّع سطح الكشف مقارنة بالوضع الحالي: النظام الحالي (data/subjects/*.js الثابتة)
-- يمنح فعلياً نفس القدر من المعلومة (تصحيح فوري لأي إجابة) لكل زائر بلا استثناء.
-- ============================================================================

create or replace function public.get_match_pairs(p_question_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'left', (
      select coalesce(jsonb_agg(left_text order by position), '[]'::jsonb)
      from question_pairs where question_id = p_question_id
    ),
    'right', (
      select coalesce(jsonb_agg(right_text order by random()), '[]'::jsonb)
      from question_pairs where question_id = p_question_id
    )
  );
$$;

revoke all on function public.get_match_pairs(text) from public;
grant execute on function public.get_match_pairs(text) to anon, authenticated;

-- دالة تصحيح داخلية مشتركة (لا تُمنح لأي دور خارجي مباشرة) — يستخدمها كل من
-- check_answer (عامة، بلا حفظ) وsave_quiz_answer (محدَّثة أدناه لتستدعيها بدل
-- تكرار نفس منطق الـ case) لتفادي انحراف منطق التصحيح بين الاثنتين مستقبلاً.
create or replace function public._grade_response(p_question_id text, p_response jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_answer jsonb;
  v_correct boolean := false;
begin
  select type, answer into v_type, v_answer
  from questions where id = p_question_id and status = 'published';

  if v_type is null then
    raise exception 'السؤال غير موجود أو غير منشور' using errcode = '42704';
  end if;

  case v_type
    when 'mcq' then
      v_correct := (p_response #>> '{}')::int = (v_answer #>> '{}')::int;
    when 'tf' then
      v_correct := (p_response #>> '{}')::boolean = (v_answer #>> '{}')::boolean;
    when 'fill' then
      v_correct := exists (
        select 1 from jsonb_array_elements_text(v_answer) a
        where lower(trim(a)) = lower(trim(p_response #>> '{}'))
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

  return v_correct;
end;
$$;

-- بلا أي GRANT لـ anon/authenticated عمداً — تُستدعى فقط من دوال SECURITY DEFINER
-- أخرى يملكها نفس مالك الدالة (postgres)، فتُنفَّذ بصلاحية المالك بصرف النظر عن
-- صلاحيات الدور المستدعي الأصلي؛ راجع توثيق PostgreSQL لدوال SECURITY DEFINER.
revoke all on function public._grade_response(text, jsonb) from public;

-- تحديث save_quiz_answer لاستخدام الدالة المشتركة بدل تكرار المنطق (سلوك مطابق تماماً).
create or replace function public.save_quiz_answer(p_attempt_id uuid, p_question_id text, p_response jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns boolean;
  v_correct boolean;
begin
  select exists (
    select 1 from quiz_attempts a where a.id = p_attempt_id and a.user_id = auth.uid()
  ) into v_owns;

  if not v_owns then
    raise exception 'لا تملك هذه المحاولة' using errcode = '42501';
  end if;

  v_correct := public._grade_response(p_question_id, p_response);

  insert into quiz_answers (attempt_id, question_id, response, is_correct)
  values (p_attempt_id, p_question_id, p_response, v_correct)
  on conflict (attempt_id, question_id)
  do update set response = excluded.response, is_correct = excluded.is_correct, answered_at = now();

  return v_correct;
end;
$$;

revoke all on function public.save_quiz_answer(uuid, text, jsonb) from public;
grant execute on function public.save_quiz_answer(uuid, text, jsonb) to authenticated;

-- دالة عامة: تصحيح فوري بلا حفظ، بلا تسجيل دخول مطلوب. لا تُعيد أي شيء غير
-- boolean لسؤال واحد محدَّد بإجابة مرسلة صراحةً من المستخدم؛ لا تكشف بنك الإجابات.
create or replace function public.check_answer(p_question_id text, p_response jsonb)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public._grade_response(p_question_id, p_response);
$$;

revoke all on function public.check_answer(text, jsonb) from public;
grant execute on function public.check_answer(text, jsonb) to anon, authenticated;
