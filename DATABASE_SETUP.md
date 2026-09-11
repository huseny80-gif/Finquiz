# إعداد قاعدة بيانات Supabase محلياً/في بيئة جديدة

## المتطلبات

- مشروع Supabase (مجاني يكفي لهذه المرحلة).
- صلاحية تطبيق migrations (SQL Editor في لوحة Supabase، أو Supabase CLI، أو أدوات MCP الخاصة بـ Supabase).

## الخطوات

1. أنشئ مشروع Supabase جديداً (أو استخدم مشروعاً قائماً) واحصل على:
   - **Project URL** (مثل `https://xxxxx.supabase.co`)
   - **anon / publishable key** — هذا فقط ما يُستخدم في الواجهة الأمامية.
   - **service_role key** — **لا يُستخدم إطلاقاً في كود المتصفح**؛ فقط لتطبيق الـ migrations من طرف مسؤول.

2. طبّق ملفات الـ migrations **بالترتيب** (كل ملف يعتمد على سابقه):
   ```
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_rls.sql
   supabase/migrations/003_functions.sql
   supabase/migrations/004_fix_mcq_grading_operator.sql
   supabase/migrations/005_admin_read_functions.sql
   supabase/migrations/006_harden_rpc_grants.sql
   ```
   عبر SQL Editor في لوحة Supabase (نسخ/لصق كل ملف بالكامل وتنفيذه)، أو عبر:
   ```
   supabase db push
   ```
   إذا كنت تستخدم Supabase CLI مع ربط المشروع.

3. زوّد قاعدة البيانات بالبذرة (البيانات الحالية للمواد الخمس):
   ```
   node scripts/generate-seed.js > supabase/seed/course2.sql
   ```
   ثم نفّذ محتوى `supabase/seed/course2.sql` في SQL Editor (الملف كبير نسبياً؛ إن واجهت حدود
   حجم في أداة التنفيذ، يمكن تقسيمه بحسب الفاصل `-- ===SPLIT:<table>===` الذي يضيفه المولّد
   قبل كل جدول، وتنفيذ كل قسم بالترتيب الوارد في الملف لأن الجداول اللاحقة تعتمد على السابقة
   عبر مفاتيح أجنبية: `courses → subjects → lectures → summaries → assignments → quizzes →
   questions → question_options/question_pairs/question_items → references/resources/updates → files`).

4. تحقّق من نجاح البذرة بمطابقة الأعداد مع ما تطبعه رسائل `stderr` لسكربت التوليد
   (`subjects=5 lectures=14 summaries=22 assignments=52 quizzes=5 questions=164 options=248
   pairs=38 items=49 references=10 resources=27 updates=27 files=45`)، عبر استعلام بسيط:
   ```sql
   select
     (select count(*) from subjects) as subjects,
     (select count(*) from lectures) as lectures,
     (select count(*) from questions) as questions,
     (select count(*) from question_options) as options;
   -- ... إلخ لبقية الجداول
   ```

5. انسخ `.env.example` إلى `.env` (لا يُرفع لـ git — موجود في `.gitignore`) وعبّئ:
   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_PUBLISHABLE_KEY=eyJ...
   ```
   هذان المتغيّران فقط ما تحتاجه الواجهة الأمامية؛ لا يوجد `SERVICE_ROLE_KEY` في `.env.example`
   عمداً لأنه لا يجب أن يصل لأي كود يعمل في المتصفح.

## إعادة التطبيق على مشروع جديد بالكامل

الخطوات نفسها بالضبط تُعيد بناء قاعدة بيانات مطابقة على أي مشروع Supabase فارغ آخر — لا توجد أي
حالة يدوية غير موثّقة في الملفات الثلاثة. جميع عبارات `insert` في البذرة تستخدم
`ON CONFLICT ... DO NOTHING`، فتشغيلها أكثر من مرة على نفس المشروع آمن لجداول المحتوى ذات
المعرّفات النصية الثابتة (لن تتكرر الصفوف). **تنبيه**: جداول `question_options`/`question_pairs`/
`question_items` تستخدم `id uuid default gen_random_uuid()` بلا تمرير `id` صريح من البذرة، لذا
`ON CONFLICT` عليها لا يمنع التكرار عملياً — لا تُشغِّل قسم هذه الجداول من البذرة أكثر من مرة على
نفس قاعدة البيانات دون تفريغها أولاً.

## بيئة الاختبار الحالية (بلا Supabase)

مجموعة الاختبارات الحالية (`npm test`, `npm run test:e2e`) تعمل بالكامل بدون أي اتصال بـ Supabase
اعتماداً على `<script>` tags الثابتة — وهذا سيستمر كخط أساس (fallback) بعد إضافة طبقة التكامل
الأمامية، تحقيقاً لقاعدة "أبقِ نظام البيانات الحالي كنسخة احتياطية أثناء الانتقال".
