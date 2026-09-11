-- ============================================================================
-- 001_initial_schema.sql
-- Finquiz — منصة القيادة الرقمية والحوكمة الذكية
-- المخطط الأولي لقاعدة بيانات Supabase/PostgreSQL.
--
-- قرار تصميمي: جداول المحتوى (courses/subjects/lectures/...) تستخدم مفاتيح
-- TEXT مطابقة تماماً للمعرّفات الحالية في data/subjects/*.js (مثل 'ai-l1'،
-- 'lg-q1-57') للحفاظ على كل IDs الحالية دون أي تحويل. الجداول المرتبطة
-- بالمستخدمين (profiles/quiz_attempts/quiz_answers/student_progress) تستخدم
-- UUID لأنها تحتاج هوية عالمية وتتصل مباشرة بـ auth.users.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- الأدوار
-- ============================================================================
create table if not exists roles (
  id text primary key,
  description text
);

insert into roles (id, description) values
  ('admin', 'صلاحية كاملة على كل المحتوى والمستخدمين والنتائج'),
  ('instructor', 'إدارة المحتوى المخصص له'),
  ('student', 'الدور الافتراضي للمستخدم المسجّل')
on conflict (id) do nothing;

-- ============================================================================
-- الملفات الشخصية (1:1 مع auth.users)
-- ============================================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- ============================================================================
-- الكورس والمواد
-- ============================================================================
create table if not exists courses (
  id text primary key,
  title text not null,
  number int,
  status text not null default 'published',
  created_at timestamptz not null default now()
);

create table if not exists subjects (
  id text primary key,
  course_id text references courses(id) on delete set null,
  "order" int not null default 0,
  title text not null,
  short_title text,
  icon text,
  accent text,
  status text not null default 'published',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- المحاضرات
-- ============================================================================
create table if not exists lectures (
  id text primary key,
  subject_id text not null references subjects(id) on delete cascade,
  number int,
  title text not null,
  date date,
  status text not null default 'published',
  demo boolean not null default false,
  description text,
  objectives jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_lectures_subject on lectures(subject_id);

-- ============================================================================
-- الملخصات
-- ============================================================================
create table if not exists summaries (
  id text primary key,
  subject_id text not null references subjects(id) on delete cascade,
  lecture_id text references lectures(id) on delete set null,
  title text not null,
  date date,
  status text not null default 'published',
  demo boolean not null default false,
  key_points jsonb not null default '[]'::jsonb,
  concepts jsonb not null default '[]'::jsonb,
  terms jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_summaries_subject on summaries(subject_id);
create index if not exists idx_summaries_lecture on summaries(lecture_id);

-- ============================================================================
-- الواجبات والتمارين
-- ============================================================================
create table if not exists assignments (
  id text primary key,
  subject_id text not null references subjects(id) on delete cascade,
  title text not null,
  difficulty text,
  date date,
  due date,
  status text not null default 'published',
  demo boolean not null default false,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_assignments_subject on assignments(subject_id);

-- ============================================================================
-- الاختبارات والأسئلة
-- ============================================================================
create table if not exists quizzes (
  id text primary key,
  subject_id text not null references subjects(id) on delete cascade,
  title text not null,
  status text not null default 'published',
  demo boolean not null default false,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_quizzes_subject on quizzes(subject_id);

-- ملاحظة أمنية مهمة: الأعمدة answer/rubric/explanation تحمل الإجابة الصحيحة
-- أو معايير التقييم. لا تُمنح صلاحية القراءة عليها لـ anon/authenticated في
-- migration 002_rls.sql — تُقرأ فقط عبر دالة reveal_question_answer() الآمنة.
create table if not exists questions (
  id text primary key,
  quiz_id text not null references quizzes(id) on delete cascade,
  lecture_id text references lectures(id) on delete set null,
  type text not null check (type in ('mcq','tf','fill','match','order','open')),
  difficulty text,
  prompt text not null,
  kind text,
  explanation text,
  answer jsonb,
  rubric jsonb,
  status text not null default 'published',
  created_at timestamptz not null default now()
);
create index if not exists idx_questions_quiz on questions(quiz_id);
create index if not exists idx_questions_lecture on questions(lecture_id);

-- خيارات الاختيار من متعدد (mcq). is_correct مخفي عن anon/authenticated.
create table if not exists question_options (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references questions(id) on delete cascade,
  position int not null,
  label text not null,
  is_correct boolean not null default false
);
create index if not exists idx_question_options_question on question_options(question_id);

-- أزواج المطابقة (match).
create table if not exists question_pairs (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references questions(id) on delete cascade,
  position int not null,
  left_text text not null,
  right_text text not null
);
create index if not exists idx_question_pairs_question on question_pairs(question_id);

-- عناصر الترتيب (order). position يحمل الترتيب الصحيح ويُخفى عن anon/authenticated.
create table if not exists question_items (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references questions(id) on delete cascade,
  position int not null,
  item_text text not null
);
create index if not exists idx_question_items_question on question_items(question_id);

-- ============================================================================
-- المراجع والموارد والتحديثات
-- ============================================================================
create table if not exists "references" (
  id text primary key,
  subject_id text not null references subjects(id) on delete cascade,
  type text,
  status text not null default 'published',
  demo boolean not null default false,
  title text,
  author text,
  year int,
  publisher text,
  url text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_references_subject on "references"(subject_id);

create table if not exists resources (
  id text primary key,
  subject_id text not null references subjects(id) on delete cascade,
  type text,
  title text,
  date date,
  url text,
  status text not null default 'published',
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_resources_subject on resources(subject_id);

create table if not exists updates (
  id text primary key,
  subject_id text not null references subjects(id) on delete cascade,
  date date,
  type text,
  title text,
  body text,
  status text not null default 'published',
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_updates_subject on updates(subject_id);

-- ============================================================================
-- الملفات (metadata فقط — الملفات الثنائية تبقى في Supabase Storage أو في
-- files/<subject>/ على الموقع الثابت؛ لا تُخزَّن أي بيانات ثنائية هنا).
-- ============================================================================
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  subject_id text references subjects(id) on delete cascade,
  lecture_id text references lectures(id) on delete cascade,
  summary_id text references summaries(id) on delete cascade,
  assignment_id text references assignments(id) on delete cascade,
  name text,
  type text,
  label text,
  storage_path text,
  public_url text,
  size bigint,
  mime_type text,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_files_subject on files(subject_id);
create index if not exists idx_files_lecture on files(lecture_id);

-- ============================================================================
-- محاولات الاختبار وإجاباتها
-- ============================================================================
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id text not null references quizzes(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_questions int,
  gradable_questions int,
  answered_questions int,
  correct_answers int,
  wrong_answers int,
  score_percent numeric(5,2),
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned'))
);
create index if not exists idx_quiz_attempts_user on quiz_attempts(user_id);
create index if not exists idx_quiz_attempts_quiz on quiz_attempts(quiz_id);

create table if not exists quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references quiz_attempts(id) on delete cascade,
  question_id text not null references questions(id) on delete cascade,
  response jsonb,
  is_correct boolean,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index if not exists idx_quiz_answers_attempt on quiz_answers(attempt_id);

-- ============================================================================
-- تقدّم الطالب — ملخص محسوب من النشاط الفعلي (attempts/answers)، وليس رقماً
-- ثابتاً. تُحدَّثه دالة recompute_student_progress() (انظر 003_functions.sql).
-- ============================================================================
create table if not exists student_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references subjects(id) on delete cascade,
  lectures_viewed int not null default 0,
  summaries_read int not null default 0,
  assignments_done int not null default 0,
  quizzes_completed int not null default 0,
  best_score_percent numeric(5,2),
  last_activity_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject_id)
);
