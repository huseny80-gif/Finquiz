# مخطط قاعدة بيانات Finquiz على Supabase/PostgreSQL

يوثّق هذا الملف المخطط المطبَّق فعلياً على مشروع Supabase الحي (`kotbarynxzyhxhzribpf`) عبر
`supabase/migrations/001_initial_schema.sql`، `002_rls.sql`، و`003_functions.sql`.

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

## فجوة موثّقة وغير مكتملة: `question_pairs`

أسئلة المطابقة (`match`) تتطلب عرض الطرف الأيمن والأيسر للطالب دون كشف الترابط الصحيح بينهما. الحل
الآمن الكامل (view بعرضين منفصلين: يسار مرتّب بـ `position`، ويمين مبعثر عشوائياً بمعزل عن أي علاقة
مع اليسار) لم يُنفَّذ بعد في هذه المرحلة، والجدول مقصور حالياً على `admin`/`instructor` فقط — أي أن
أسئلة المطابقة **غير قابلة للعرض للطلاب حتى إشعار آخر**. موثّق كذلك في `002_rls.sql` كتعليق `TODO`
وفي `IMPLEMENTATION_REPORT.md`.

## تحذيرات أمان/أداء مؤجَّلة (من `get_advisors`)

- دالتا `has_role`/`is_admin_or_instructor` قابلتان للاستدعاء كـ RPC مباشر من anon/authenticated
  (تحذير أمان بمستوى منخفض المخاطر — لا تُسرّبان بيانات، فقط تُعيدان boolean).
- ~11 سياسة RLS يُفضَّل لف `auth.uid()` فيها بـ `(select auth.uid())` لتحسين الأداء (`auth_rls_initplan`).
- بعض الفهارس على مفاتيح أجنبية غير مستخدمة بعد لأن الجداول ما زالت صغيرة.
- عدة سياسات `FOR ALL` تُحتسَب أيضاً كسياسة SELECT مسموحة إضافية (`multiple_permissive_policies`) — أثر أدائي طفيف فقط، لا أمني.

هذه كلها مؤجَّلة عمداً لمرحلة تحسين لاحقة ولا تمنع الاستخدام الآمن الحالي.
