-- ============================================================================
-- 002_rls.sql — Row Level Security
-- الأمان على مستوى قاعدة البيانات، وليس بإخفاء أزرار في الواجهة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- دالة مساعدة: هل المستخدم الحالي يملك دوراً معيناً؟
-- ----------------------------------------------------------------------------
create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.role_id = p_role
  );
$$;

create or replace function public.is_admin_or_instructor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin') or public.has_role('instructor');
$$;

-- ----------------------------------------------------------------------------
-- جداول المحتوى: قراءة عامة للمنشور فقط، وكتابة لـ admin/instructor فقط.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'courses','subjects','lectures','summaries','assignments',
    'quizzes','references','resources','updates','files',
    'question_options','question_pairs','question_items'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- courses / subjects / lectures / summaries / assignments / quizzes /
-- references / resources / updates: نفس النمط لكل جدول محتوى رئيسي.
create policy content_read_published on courses
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on courses
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on subjects
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on subjects
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on lectures
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on lectures
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on summaries
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on summaries
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on assignments
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on assignments
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on quizzes
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on quizzes
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on "references"
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on "references"
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on resources
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on resources
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on updates
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on updates
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

create policy content_read_published on files
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy content_write_admin on files
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

-- ----------------------------------------------------------------------------
-- questions: تُقرأ الصفوف عبر RLS متى كان status='published'، لكن الأعمدة
-- الحسّاسة (answer/rubric/explanation) تُمنع صلاحية القراءة عليها بالكامل عن
-- anon/authenticated عبر column-level GRANT، فلا يمكن لأي استعلام SELECT *
-- كشفها — لا حتى بتجاوز RLS بصياغة استعلام مختلفة. تُقرأ فقط داخل دالة
-- reveal_question_answer() الآمنة (SECURITY DEFINER) بعد تسجيل الدخول.
-- ----------------------------------------------------------------------------
alter table questions enable row level security;

create policy questions_read_published on questions
  for select using (status = 'published' or public.is_admin_or_instructor());
create policy questions_write_admin on questions
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

revoke select on questions from anon, authenticated;
grant select (id, quiz_id, lecture_id, type, difficulty, prompt, kind, status, created_at)
  on questions to anon, authenticated;
-- admin/instructor يحتاجون كل الأعمدة لإدارة الأسئلة من لوحة الإدارة لاحقاً.
grant select on questions to service_role;

-- question_options: نفس المبدأ — is_correct مخفي عن anon/authenticated.
create policy options_read_published on question_options
  for select using (
    exists (select 1 from questions q where q.id = question_id and q.status = 'published')
    or public.is_admin_or_instructor()
  );
create policy options_write_admin on question_options
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

revoke select on question_options from anon, authenticated;
grant select (id, question_id, position, label) on question_options to anon, authenticated;
grant select on question_options to service_role;

-- question_items (order): position يحمل الترتيب الصحيح ويُخفى؛ العميل يستلم
-- item_text فقط ويرتّبها بنفسه، والتصحيح الفعلي يتم عبر reveal/grade RPC.
create policy items_read_published on question_items
  for select using (
    exists (select 1 from questions q where q.id = question_id and q.status = 'published')
    or public.is_admin_or_instructor()
  );
create policy items_write_admin on question_items
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

revoke select on question_items from anon, authenticated;
grant select (id, question_id, item_text) on question_items to anon, authenticated;
grant select on question_items to service_role;

-- question_pairs (match): يُتاح فقط لـ admin/instructor مباشرة في هذه المرحلة.
-- طلاب/زوّار غير مسجّلين يحصلون على شكل العرض الآمن (left/right منفصلين بلا
-- ترابط) عبر دالة get_match_question_view() لاحقاً — TODO موثّق في
-- ARCHITECTURE_AUDIT.md وIMPLEMENTATION_REPORT.md كخطوة تالية غير منجزة بعد.
create policy pairs_admin_only on question_pairs
  for select using (public.is_admin_or_instructor());
create policy pairs_write_admin on question_pairs
  for all using (public.is_admin_or_instructor()) with check (public.is_admin_or_instructor());

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select using (id = auth.uid() or public.is_admin_or_instructor());
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- roles / user_roles: قراءة الأدوار عامة (أسماء فقط)، وتعيينها لـ admin فقط.
-- ----------------------------------------------------------------------------
alter table roles enable row level security;
create policy roles_read_all on roles for select using (true);

alter table user_roles enable row level security;
create policy user_roles_select_own on user_roles
  for select using (user_id = auth.uid() or public.has_role('admin'));
create policy user_roles_admin_write on user_roles
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- ----------------------------------------------------------------------------
-- quiz_attempts / quiz_answers: كل مستخدم يرى وينشئ محاولاته الخاصة فقط.
-- ----------------------------------------------------------------------------
alter table quiz_attempts enable row level security;

create policy attempts_select_own on quiz_attempts
  for select using (user_id = auth.uid() or public.is_admin_or_instructor());
create policy attempts_insert_own on quiz_attempts
  for insert with check (user_id = auth.uid());
create policy attempts_update_own on quiz_attempts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table quiz_answers enable row level security;

create policy answers_select_own on quiz_answers
  for select using (
    exists (select 1 from quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid())
    or public.is_admin_or_instructor()
  );
create policy answers_insert_own on quiz_answers
  for insert with check (
    exists (select 1 from quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );
create policy answers_update_own on quiz_answers
  for update using (
    exists (select 1 from quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );

-- answer الصحيح في quiz_answers يُحسب ويُخزَّن من طرف الخادم (دالة SECURITY
-- DEFINER) فقط — العميل لا يملك صلاحية تعديل عمود is_correct مباشرة.
revoke update (is_correct) on quiz_answers from authenticated;

-- ----------------------------------------------------------------------------
-- student_progress: كل مستخدم يرى تقدّمه فقط؛ التحديث عبر دالة الخادم فقط.
-- ----------------------------------------------------------------------------
alter table student_progress enable row level security;

create policy progress_select_own on student_progress
  for select using (user_id = auth.uid() or public.is_admin_or_instructor());

-- لا توجد سياسة insert/update للعميل مباشرة: يُحدَّث الجدول فقط عبر دالة
-- recompute_student_progress() (SECURITY DEFINER) المستدعاة بعد كل محاولة.
