# تقرير تنفيذ — Migration نحو Supabase

**الحالة العامة: غير مكتمل — المرحلتان 0 (القاعدة/الأمان) و1 (طبقة الاتصال الكاملة: `supabase.js`/
`api.js`/`auth.js` + ربط `store.js`/`app.js` عبر `hydrate()`) منجزتان ومُختبرتان بالكامل، لكن
**القراءة الحية معطَّلة عمداً** (`enabled: false` في `data/config/supabase.js`) بسبب فجوة أمنية
غير محلولة (`question_pairs`) تكسر أسئلة المطابقة بصمت لو فُعِّلت الآن. الموقع اليوم يعمل حصراً من
الملفات الثابتة تماماً كما كان قبل أي من هذا العمل — انظر §"قرار enabled: false" أدناه. المراحل
2-4 المتبقية (ربط `quiz-view.js`، لوحة الطالب، سقالة الإدارة) لم تبدأ.**

## ما تم تنفيذه فعلياً واختباره

| العنصر | الحالة | كيف تحقّقتُ منه |
|---|---|---|
| `supabase/migrations/001_initial_schema.sql` | ✅ مطبَّق على مشروع Supabase حي (`kotbarynxzyhxhzribpf`) | `mcp__Supabase__apply_migration` أعاد `{"success":true}` |
| `supabase/migrations/002_rls.sql` | ✅ مطبَّق | نفس الشيء + `get_advisors(type: security)` لمراجعة التحذيرات |
| `supabase/migrations/003_functions.sql` | ✅ مطبَّق | نفس الشيء |
| `scripts/generate-seed.js` | ✅ يولّد SQL من `data/subjects/*.js` الحيّة عبر `tests/harness.js` (قراءة فقط، لا يعدّل أي مصدر) | تشغيل فعلي + مطابقة عدّاد الصفوف بمخرجات `stderr` |
| `supabase/seed/course2.sql` وتطبيقه | ✅ طُبِّق بالكامل على القاعدة الحية، على 14 دفعة بترتيب الاعتماديات | استعلام `count(*)` نهائي على كل الجداول الـ14 — **تطابق تام** مع الأعداد المتوقعة: `subjects=5 lectures=14 summaries=22 assignments=52 quizzes=5 questions=164 options=248 pairs=38 items=49 references=10 resources=27 updates=27 files=45` |
| `ARCHITECTURE_AUDIT.md`, `DATABASE_SCHEMA.md`, `DATABASE_SETUP.md`, `MIGRATION_PLAN.md`, `.env.example` | ✅ مكتوبة | — |
| `assets/vendor/supabase-js.min.js` | ✅ عميل Supabase JS v2.116.0 (UMD) محمَّل محلياً من سجل npm الرسمي، لا من CDN — متوافق مع `script-src 'self'` | `node -e "new vm.Script(...)"` يتحقق من صحة الصياغة؛ فحص الحجم (<1MB) ضمن `npm run validate` |
| `data/config/supabase.js` | ✅ رابط المشروع ومفتاح anon/publishable العلنيَّين فقط — لا سرّ | اختبار مخصّص يتحقق من غياب أي إشارة لمفتاح الصلاحية الكاملة |
| `assets/js/core/supabase.js` | ✅ يهيّئ العميل إن توفرت المكتبة والمفاتيح والتفعيل، ويسقط بهدوء (`null`) خلاف ذلك — لا يرمي أبداً | 5 اختبارات وحدة جديدة (بلا مكتبة / `enabled:false` / مفاتيح ناقصة / تهيئة ناجحة / تمرير المفاتيح الصحيحة للعميل) |
| `assets/js/core/api.js` | ✅ الطبقة الوحيدة المصرَّح لها بمخاطبة Supabase؛ كل دالة تُعيد Promise وتُرفض بهدوء بلا اتصال (لا استثناء متزامن) | اختبارات `isReady()`/`fetchAllContent()` بلا عميل |
| `assets/js/core/auth.js` | ✅ Google OAuth عبر Supabase Auth؛ `getUser()`/`signOut()` لا يرميان أبداً؛ التصفح العام يبقى ممكناً بلا حساب | اختبارات `getUser()`/`signInWithGoogle()`/`signOut()` بلا اتصال |
| ربط الملفات الثلاثة + CSP في `index.html` | ✅ سكربتات مضافة بعد `i18n.js` وقبل `store.js`؛ `connect-src` يسمح الآن بنطاق مشروع Supabase | `npm test` (59) + `npm run validate` + `npm run test:e2e` (60) — **صفر تراجع**، بما فيها اختبار "لا توجد أخطاء Console" الذي يثبت أن تحميل المكتبة الجديدة لا يكسر أي صفحة |

## ما تم تنفيذه فعلياً واختباره — تكملة (ربط store.js/app.js)

| العنصر | الحالة | كيف تحقّقتُ منه |
|---|---|---|
| `assets/js/core/store.js`: `dataSource()` + `hydrate()` | ✅ استبدال ذرّي لـ `DLP.data`/`DLP.subjectOrder` عند نجاح `api.fetchAllContent()`، وسقوط بهدوء (بلا رمي) عند غياب `DLP.api`، أو رفض الشبكة، أو شكل استجابة ناقص | 5 اختبارات وحدة جديدة بعميل DLP.api وهمي (mock) معزول تماماً عن باقي بيانات الاختبار المشتركة |
| `assets/js/app.js`: `init()` أصبحت `async` وتستدعي `await DLP.store.hydrate()` كأول سطر | ✅ **قبل** بناء الـ Header/Sidebar (يعتمدان على `DLP.store.subjects()` مباشرة في `layout.js`) لا فقط قبل `router.start()` | `npm run test:e2e` كامل (60/60) بلا أي تغيير سلوكي ظاهر، بما فيها اختبار خلوّ Console من الأخطاء |
| 5 اختبارات وحدة إضافية + تعديل اختبارين سابقين | ✅ (64/64 إجمالاً) | `npm test` |

## قرار enabled: false — لماذا لم تُفعَّل القراءة الحية بعد

`data/config/supabase.js` يُبقي `enabled: false` **عمداً** رغم اكتمال `hydrate()` واختباره بالكامل.
السبب: `mapQuestion()` في `api.js` تُعيد `pairs: []` لكل سؤال مطابقة (`type: 'match'`) لأن جدول
`question_pairs` محجوب بالكامل عن anon في RLS الحالي (الفجوة الموثّقة في `DATABASE_SCHEMA.md`).
`quiz-view.js` يقرأ `question.pairs` مباشرة بلا أي حارس للمصفوفة الفارغة — فتفعيل `enabled: true`
الآن يعني كسر نوع سؤال المطابقة بالكامل بصمت لكل زائر فور نجاح أول `hydrate()`. **هذا لم يُختبر
بعد بعميل Supabase حقيقي متصل بالمشروع الحي** (كل الاختبارات الجديدة في هذه المرحلة تستخدم عميلاً
وهمياً/مُزيَّفاً محلياً في Node عبر `vm`، لا اتصالاً فعلياً).

قبل تفعيل `enabled: true` يجب أولاً أحد الحلول الثلاثة الموثّقة في `MIGRATION_PLAN.md` (عرض آمن
لـ`question_pairs`، أو حارس فارغ في `quiz-view.js`، أو إسقاط أسئلة `match` من `fetchAllContent()`)
**+ تحقّق فعلي بمتصفح حقيقي متصل بالمشروع** — وليس افتراض أن الاختبارات الوهمية تكفي.

## ما لم يُنفَّذ بعد (صراحةً، بلا تجميل)

- `quiz-view.js`/`core/quiz.js` لم يُعدَّلا — النتائج ما زالت تُحسب في المتصفح وتُخزَّن في
  `localStorage` فقط (المخالفة الموثّقة لقاعدة "لا تُستخدم localStorage كمخزن دائم" **لم تُصلَح بعد**
  على مستوى الواجهة، رغم أن `api.js` يحوي `startQuizAttempt`/`saveQuizAnswer`/`finishQuizAttempt`
  جاهزة للاستخدام في المرحلة التالية).
- لا `dashboard.js`، ولا سقالة `components/admin/`.
- لا اختبار واحد نُفِّذ بعد ضد مشروع Supabase حقيقي متصل عبر متصفح فعلي — كل ما تحقّق حتى الآن
  استخدم عملاء/بيانات وهمية محلياً في Node. هذا فرق جوهري يجب سدّه قبل أي تفعيل حي.

## فجوة أمنية موثّقة (مؤجَّلة عمداً)

`question_pairs` (أسئلة المطابقة) مقصورة حالياً على قراءة admin/instructor فقط، لغياب عرض آمن
غير مترابط (uncorrelated view) يمنع استنتاج الإجابة الصحيحة من استعلام واحد. موثّق في
`002_rls.sql` (تعليق `TODO`) وفي `DATABASE_SCHEMA.md`. **لا يمكن لطالب اليوم رؤية سؤال مطابقة من
القاعدة إطلاقاً** — وهذا مقبول مؤقتاً لأن الواجهة لا تقرأ من القاعدة أصلاً بعد؛ يجب حله قبل
تفعيل قراءة أسئلة المطابقة من القاعدة في المرحلة 1.

## تحذيرات أداء/أمان مؤجَّلة (`get_advisors`)

- دالتا `has_role`/`is_admin_or_instructor` قابلتان للاستدعاء كـ RPC مباشر (تحذير أمان منخفض
  المخاطر — تُعيدان boolean فقط، لا تسرّبان بيانات).
- 11 سياسة RLS يُفضَّل تحسينها بلفّ `auth.uid()` بـ `(select ...)`.
- عدة فهارس غير مستخدمة بعد (الجداول لا تزال صغيرة) وسياسات `FOR ALL` تُحتسب أيضاً كسياسة SELECT.

هذه كلها لا تمنع أماناً صحيحاً للاستخدام الحالي (بلا واجهة متصلة بعد) وأُجِّلت بوعي.

## الخطوة التالية المقترحة

تنفيذ المرحلة 1 من `MIGRATION_PLAN.md` كاملة كوحدة واحدة قابلة للاختبار: `supabase.js` + `api.js`
+ `auth.js` + تعديل `store.js`/`app.js`/CSP، مع كتابة الاختبارات المقابلة **قبل** الإعلان عن
اكتمال تلك المرحلة، والتحقق الفعلي بتشغيل `npm test` و`npm run test:e2e` وعدم وجود أي تراجع.
