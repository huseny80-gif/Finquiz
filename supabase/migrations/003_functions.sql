-- ============================================================================
-- 003_functions.sql — دوال آمنة (SECURITY DEFINER) لكشف الإجابات، حفظ
-- الإجابات، وحساب النتائج والتقدّم من طرف الخادم فقط.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- reveal_question_answer: يعيد الإجابة الصحيح + الشرح لسؤال واحد.
-- متاح فقط للمستخدمين المسجّلين (authenticated) — يمنع كشف كل بنك الإجابات
-- دفعة واحدة قبل بدء الاختبار، ويطابق تماماً لحظة "تحقق" الحالية في الواجهة.
-- ----------------------------------------------------------------------------
create or replace function public.reveal_question_answer(p_question_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question record;
  v_options jsonb;
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
  end if;

  return jsonb_build_object(
    'question_id', v_question.id,
    'type', v_question.type,
    'answer', v_question.answer,
    'rubric', v_question.rubric,
    'explanation', v_question.explanation,
    'options', v_options
  );
end;
$$;

revoke all on function public.reveal_question_answer(text) from public;
grant execute on function public.reveal_question_answer(text) to authenticated;

-- ----------------------------------------------------------------------------
-- start_quiz_attempt: ينشئ محاولة جديدة للمستخدم الحالي ويعيد معرّفها.
-- ----------------------------------------------------------------------------
create or replace function public.start_quiz_attempt(p_quiz_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_id uuid;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول لبدء محاولة اختبار' using errcode = '42501';
  end if;

  insert into quiz_attempts (user_id, quiz_id, total_questions, gradable_questions)
  values (
    auth.uid(),
    p_quiz_id,
    (select count(*) from questions where quiz_id = p_quiz_id and status = 'published'),
    (select count(*) from questions where quiz_id = p_quiz_id and status = 'published' and type <> 'open')
  )
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

revoke all on function public.start_quiz_attempt(text) from public;
grant execute on function public.start_quiz_attempt(text) to authenticated;

-- ----------------------------------------------------------------------------
-- save_quiz_answer: يحفظ/يحدّث إجابة الطالب لسؤال ضمن محاولة يملكها، ويصحّحها
-- من طرف الخادم (نفس منطق core/quiz.js لكن مطبَّقاً على بيانات قاعدة البيانات
-- بدل الاعتماد على القيمة المرسلة من العميل لعمود is_correct).
-- ----------------------------------------------------------------------------
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
      v_correct := (p_response->>0)::int = (v_answer->>0)::int;
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

-- ----------------------------------------------------------------------------
-- finish_quiz_attempt: يحسب النتيجة النهائية من quiz_answers الفعلية ويحفظها،
-- ثم يستدعي recompute_student_progress لتحديث تقدّم المادة.
-- ----------------------------------------------------------------------------
create or replace function public.finish_quiz_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_id text;
  v_result jsonb;
begin
  if not exists (select 1 from quiz_attempts where id = p_attempt_id and user_id = auth.uid()) then
    raise exception 'لا تملك هذه المحاولة' using errcode = '42501';
  end if;

  update quiz_attempts a set
    completed_at = now(),
    status = 'completed',
    answered_questions = (select count(*) from quiz_answers where attempt_id = p_attempt_id),
    correct_answers = (
      select count(*) from quiz_answers qa
      join questions q on q.id = qa.question_id
      where qa.attempt_id = p_attempt_id and qa.is_correct and q.type <> 'open'
    ),
    wrong_answers = (
      select count(*) from quiz_answers qa
      join questions q on q.id = qa.question_id
      where qa.attempt_id = p_attempt_id and not qa.is_correct and q.type <> 'open'
    )
  where a.id = p_attempt_id;

  update quiz_attempts set
    score_percent = case when gradable_questions > 0
      then round((correct_answers::numeric / gradable_questions) * 100, 2)
      else 0 end
  where id = p_attempt_id;

  select q.subject_id into v_subject_id from quiz_attempts a join quizzes q on q.id = a.quiz_id where a.id = p_attempt_id;

  perform public.recompute_student_progress(auth.uid(), v_subject_id);

  select jsonb_build_object(
    'total_questions', total_questions, 'gradable_questions', gradable_questions,
    'answered_questions', answered_questions, 'correct_answers', correct_answers,
    'wrong_answers', wrong_answers, 'score_percent', score_percent, 'completed_at', completed_at
  ) into v_result
  from quiz_attempts where id = p_attempt_id;

  return v_result;
end;
$$;

revoke all on function public.finish_quiz_attempt(uuid) from public;
grant execute on function public.finish_quiz_attempt(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- recompute_student_progress: يعيد حساب تقدّم مادة واحدة لمستخدم من نشاطه
-- الفعلي (لا رقم ثابت). يُستدعى تلقائياً بعد كل محاولة اختبار مكتملة.
-- ----------------------------------------------------------------------------
create or replace function public.recompute_student_progress(p_user_id uuid, p_subject_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into student_progress (
    user_id, subject_id, quizzes_completed, best_score_percent, last_activity_at, updated_at
  )
  select
    p_user_id, p_subject_id,
    count(*) filter (where a.status = 'completed'),
    max(a.score_percent),
    max(a.completed_at),
    now()
  from quiz_attempts a
  join quizzes q on q.id = a.quiz_id
  where a.user_id = p_user_id and q.subject_id = p_subject_id
  on conflict (user_id, subject_id) do update set
    quizzes_completed = excluded.quizzes_completed,
    best_score_percent = excluded.best_score_percent,
    last_activity_at = excluded.last_activity_at,
    updated_at = now();
end;
$$;

revoke all on function public.recompute_student_progress(uuid, text) from public;
grant execute on function public.recompute_student_progress(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- handle_new_user: ينشئ صف profiles تلقائياً عند تسجيل مستخدم جديد عبر
-- Supabase Auth، ويمنحه دور 'student' الافتراضي.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url', new.email)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role_id)
  values (new.id, 'student')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
