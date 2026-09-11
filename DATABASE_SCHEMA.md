# مخطط قاعدة بيانات Finquiz على Supabase/PostgreSQL

يوثّق هذا الملف المخطط المطبَّق فعلياً على مشروع Supabase الحي (`kotbarynxzyhxhzribpf`) عبر
`supabase/migrations/001_initial_schema.sql`، `002_rls.sql`، `003_functions.sql`،
`004_fix_mcq_grading_operator.sql` (إصلاح صغير: استبدال `->>0` غير الموثّق بـ `#>>'{}'` الموثّق
في تصحيح mcq داخل `save_quiz_answer`)، `005_admin_read_functions.sql` (دالة قراءة كاملة الأعمدة
للأسئلة، admin/instructor فقط)، `006_harden_rpc_grants.sql` (تشديد صلاحيات تنفيذ RPC)،
`007_safe_match_pairs_and_public_check.sql` (حل فجوة `question_pairs` + دالة `check_answer`
العامة)، `008_harden_grade_response_grant.sql` (تشديد مماثل لـ006 على دالة داخلية جديدة)،
و`009_extend_reveal_for_match_and_order.sql` (توسيع `reveal_question_answer` ليغطي match/order
أيضاً لا mcq فقط) — انظر تفاصيل كل هذه في `IMPLEMENTATION_REPORT.md`.

## مبدأ التصميم: مفاتيح مزدوجة النوع

- **جداول المحتوى** (`courses`, `subjects`, `lectures`, `summaries`, `assignments`, `quizzes`,
  `questions`, `references`, `resources`, `updates`) تستخدم `id text primary key` **مطابقاً حرفياً**
  للمعرّفات الحالية في `data/subjects/*.js` (مثل `'ai-l1'`, `'lg-q1-57'`) — بلا أي تحويل، حفاظاً
  على قاعدة عدم تغيير المعرّفات الحالية.
- **الجداول المرتبطة بالمستخدمين** (`profiles`, `user_roles`, `quiz_attempts`, `quiz_answers`,
  `student_progress`) تستخدم `uuid` لأنها تتصل مباشرة بـ `auth.users` من Supabase Auth.

## الجداول

| الجدول | الغرض | ملاحظات أمنية |
|---|---|---|
| `roles` | تعريف الأدوار الثلاثة: `admin`, `instructor`, `student` | قراءة عامة |
| `profiles` | ملف تعريف 1:1 مع `auth.users` | كل مستخدم يرى/يعدّل ملفه فقط |
| `user_roles` | ربط مستخدم↔دور (many-to-many عبر PK مركّب) | القراءة للمستخدم نفسه أو admin؛ الكتابة لـ admin فقط |
| `courses` | الكورس (كورس واحد حالياً: `course-2`) | قراءة عامة للمنشور |
| `subjects` | المواد الخمس | قراءة عامة للمنشور، كتابة admin/instructor |
| `lectures` | المحاضرات لكل مادة | نفس النمط |
| `summaries` | الملخصات | نفس النمط |
| `assignments` | الواجبات/التمارين | نفس النمط |
| `quizzes` | الاختبارات لكل مادة | نفس النمط |
| `questions` | الأسئلة الست الأنواع | **أعمدة `answer`, `rubric`, `explanation` مخفية عمودياً عن anon/authenticated** — تُقرأ فقط عبر `reveal_question_answer()` |
| `question_options` | خيارات mcq | **عمود `is_correct` مخفي** عن anon/authenticated |
| `question_pairs` | أزواج match | **الجدول كله مقصور على admin/instructor حالياً** — TODO: عرض آمن غير مترابط (انظر §6) |
| `question_items` | عناصر order | **عمود `position` (الترتيب الصحيح) مخفي**، يصل العميل `item_text` فقط |
| `references` | المراجع | قراءة عامة للمنشور |
| `resources` | الملفات/الموارد (رابط نصّي فقط) | قراءة عامة للمنشور |
| `updates` | سجل التحديثات | قراءة عامة للمنشور |
| `files` | Metadata فقط لملفات ثنائية — **لا تُخزَّن أي بيانات ثنائية في القاعدة**؛ `public_url`/`storage_path` رابط فقط | قراءة عامة للمنشور |
| `quiz_attempts` | محاولة اختبار طالب | كل مستخدم يرى وينشئ محاولاته فقط |
| `quiz_answers` | إجابة سؤال ضمن محاولة، مع `is_correct` **محسوب من الخادم فقط** | `revoke update(is_correct) from authenticated` |
| `student_progress` | تقدّم محسوب من `quiz_attempts` الفعلية — لا رقم ثابت | كل مستخدم يرى تقدّمه فقط؛ التحديث عبر `recompute_student_progress()` فقط |

## دوال SECURITY DEFINER (`003_functions.sql`)

| الدالة | الاستدعاء | الغرض |
|---|---|---|
| `reveal_question_answer(question_id)` | `authenticated` فقط | تعيد الإجابة/الشرح لسؤال واحد **بعد** أن يحاول الطالب الإجابة — لا يُكشف بنك الإجابات دفعة واحدة |
| `start_quiz_attempt(quiz_id)` | `authenticated` | تُنشئ صف `quiz_attempts` وتعيد `attempt_id` |
| `save_quiz_answer(attempt_id, question_id, response)` | `authenticated` | تصحّح الإجابة **داخل قاعدة البيانات** بمقارنتها بالعمود الحقيقي، وتخزّن `is_correct` — العميل لا يرسل ولا يستطيع التلاعب بهذا العمود |
| `finish_quiz_attempt(attempt_id)` | `authenticated` | تحسب `score_percent` من `quiz_answers` الفعلية، وتستدعي `recompute_student_progress` |
| `recompute_student_progress(user_id, subject_id)` | داخلية (SECURITY DEFINER) | تُعيد حساب `student_progress` من `quiz_attempts` الحقيقية |
| `handle_new_user()` + trigger `on_auth_user_created` | تلقائي عند التسجيل | ينشئ `profiles` ويمنح دور `student` الافتراضي |

## نمط منع تسريب الإجابات: RLS + Column-level GRANT معاً

RLS وحدها تتحكم بالصفوف (Rows) لا بالأعمدة (Columns). لمنع تسريب عمود إجابة صحيحة داخل صف يُسمح
بقراءته أصلاً (لأن السؤال منشور)، استُخدم:

```sql
revoke select on questions from anon, authenticated;
grant select (id, quiz_id, lecture_id, type, difficulty, prompt, kind, status, created_at)
  on questions to anon, authenticated;
```

بهذا فإن `select * from questions` من طرف العميل (anon/authenticated) يفشل، ولا يمكن اختراق هذا القيد
حتى بصياغة استعلام مختلف — لأن الصلاحية غير موجودة أصلاً على مستوى العمود.

## حل فجوة `question_pairs` (منذ 007)

أسئلة المطابقة (`match`) تتطلب عرض الطرف الأيمن والأيسر للطالب دون كشف الترابط الصحيح بينهما.
الجدول `question_pairs` نفسه يبقى مقصوراً على `admin`/`instructor` فقط (كل صف يحمل الطرفين
مترابطين، فلا يمكن منح قراءته جزئياً بأمان). الحل: دالة `get_match_pairs(question_id)`
(`SECURITY DEFINER`، ممنوحة لـ `anon`/`authenticated`) تعيد الطرفين كمصفوفتين منفصلتين تماماً
بلا أي ترابط بينهما — `left` مرتّبة حسب `position` (الترتيب نفسه ليس سرّاً)، و`right` بترتيب
عشوائي مستقل يتغيّر مع كل استدعاء. `api.js` يستدعيها لكل سؤال مطابقة ضمن `fetchAllContent()`
وتُبنى `pairsLeft`/`pairsRight` (لا `pairs` المترابطة) — راجع `assets/js/components/quiz-view.js`
لكيفية تمييز الواجهة بين الشكلين. `reveal_question_answer` (منذ 009) تعيد الأزواج الصحيحة كاملة
بعد إجابة الطالب لمستخدم مسجَّل فقط.

## فجوة إضافية مكتشَفة ومحلولة: `select('*')` على أعمدة محجوبة جزئياً (منذ 007)

`api.js` كان يستخدم `select('*')` على `questions`/`question_options`/`question_items` — وهذه
الجداول محجوبة أعمدة منها جزئياً (`answer`/`rubric`/`explanation`/`is_correct`/`position` في
`question_items`). تحقّق مباشر عبر `set role anon; select * from questions ...` على المشروع
الحي أثبت أن هذا كان سيفشل بـ `42501 permission denied` فعلياً عند أي اتصال حقيقي — لم يُكتشف
plus تواً لأن كل الاختبارات السابقة كانت تُحاكي عميل Supabase وهمياً يتجاهل الأعمدة المطلوبة. أُصلح
باستخدام قوائم أعمدة صريحة تطابق الممنوح بالضبط، وحذف `.order('position')` عن `question_items`
تحديداً (العمود نفسه غير ممنوح، والترتيب به كان سيفشل أيضاً) مع خلط العناصر عشوائياً في العميل بدلاً
من الاعتماد على ترتيب إرجاع الصفوف (قد يطابق الترتيب الصحيح صدفة). مُختبر ببناء محاكي استعلامات في
`tests/run.js` يحاكي قيود الأعمدة الفعلية ويفشل عمداً لو طُلب عمود غير ممنوح.

## دالة قراءة الإدارة: `admin_get_quiz_questions` (منذ 005)

أعمدة الإجابات على مستوى العمود (§"نمط منع تسريب الإجابات" أعلاه) محجوبة عن anon/authenticated
**بلا شرط** — أي أن admin/instructor بحساب `authenticated` عادي لا يستطيعون قراءتها عبر REST
مباشرة أيضاً؛ فقط `service_role` (المُستخدَم فقط لتطبيق الـ migrations) يملك تلك الأعمدة. لحل
هذا لسقالة الإدارة (Stage 4)، تتحقّق `admin_get_quiz_questions(p_quiz_id)` من
`is_admin_or_instructor()` أولاً (وترفض بوضوح 42501 إن لم يكن كذلك)، ثم تُعيد كل أسئلة الاختبار
كـ `jsonb` بكامل أعمدتها (`answer`, `rubric`, `explanation`, و`is_correct` لكل خيار) — دفعة واحدة
لكل اختبار، على غرار `reveal_question_answer` لكن لسؤال واحد بعد إجابة الطالب عليه.

## تشديد صلاحيات RPC (منذ 006) — اكتشاف واقعي أثناء بناء سقالة الإدارة

`revoke all on function ... from public;` (المستخدَم في 003 و005) **لا يُلغي فعلياً** صلاحية
`anon`/`authenticated`، لأن Supabase يمنح `EXECUTE` افتراضياً لهذين الدورين تحديداً (عبر
`ALTER DEFAULT PRIVILEGES`، لا عبر الدور الوهمي `PUBLIC`) عند إنشاء أي دالة. وبما أن
`REVOKE ... FROM PUBLIC` لا يسحب امتيازاً مُنحاً صراحةً لدور مسمّى، بقيت `anon` قادرة تقنياً على
استدعاء `reveal_question_answer`/`start_quiz_attempt`/`save_quiz_answer`/`finish_quiz_attempt`/
`admin_get_quiz_questions` عبر `/rest/v1/rpc/<fn>` — تحقّقنا من هذا تجريبياً عبر
`information_schema.role_routine_grants`. لا تسريب فعلي وقع (كل هذه الدوال ترفض المستخدم غير
المصرَّح له داخلياً برسالة خطأ واضحة)، لكن `006_harden_rpc_grants.sql` ضيّق ذلك بـ
`revoke execute ... from anon` صراحةً، وسحب صلاحية التنفيذ بالكامل من anon/authenticated على
`handle_new_user` (تُشغَّل عبر trigger فقط — لم تكن مقيَّدة إطلاقاً في 003، وكان لها منح `PUBLIC`
الافتراضي القياسي في PostgreSQL نفسه لا منح Supabase الخاص، فاستُخدم `revoke ... from public` لها
تحديداً لا `from anon, authenticated`) و`recompute_student_progress` (داخلية بحتة).

## تحذيرات أمان/أداء مؤجَّلة (من `get_advisors`)

- دالتا `has_role`/`is_admin_or_instructor` قابلتان للاستدعاء كـ RPC مباشر من anon/authenticated
  **عمداً وبعد مراجعة**: لا يمكن سحب هذه الصلاحية لأنهما تُستخدَمان داخل تعبيرات `USING` في كل
  سياسات RLS تقريباً؛ سحب `EXECUTE` منهما سيكسر تقييم RLS نفسه لأي قارئ عادي anon/authenticated.
  (تحذير أمان بمستوى منخفض المخاطر — لا تُسرّبان بيانات، فقط تُعيدان boolean).
- ~11 سياسة RLS يُفضَّل لف `auth.uid()` فيها بـ `(select auth.uid())` لتحسين الأداء (`auth_rls_initplan`).
- بعض الفهارس على مفاتيح أجنبية غير مستخدمة بعد لأن الجداول ما زالت صغيرة.
- عدة سياسات `FOR ALL` تُحتسَب أيضاً كسياسة SELECT مسموحة إضافية (`multiple_permissive_policies`) — أثر أدائي طفيف فقط، لا أمني.

هذه كلها مؤجَّلة عمداً لمرحلة تحسين لاحقة ولا تمنع الاستخدام الآمن الحالي.
