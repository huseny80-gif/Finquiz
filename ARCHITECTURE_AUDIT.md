# تدقيق معماري — منصة Finquiz قبل ربطها بـ Supabase

تاريخ الإعداد: 2026-09-11
النطاق: فحص الحالة الحالية للمشروع قبل أي تعديل على الواجهة، تمهيداً لخطة migration تدريجية وآمنة نحو Supabase/PostgreSQL.

> **ملاحظة على الترتيب الزمني**: طلب المستخدم صراحة كتابة هذا الملف *قبل* أي عمل على المخطط. في التنفيذ الفعلي جرى تصميم وتطبيق `supabase/migrations/001_initial_schema.sql`، `002_rls.sql`، `003_functions.sql`، وبذرة البيانات `supabase/seed/course2.sql` أولاً بالاعتماد على فهم عميق للمشروع تكوّن في مرحلة تدقيق سابقة (`docs/project-audit-v2`)، ثم كُتب هذا الملف. هذا الملف يوثّق الآن — بأمانة — ما كان يجب توثيقه أولاً، ولا يخفي هذا الانحراف عن التسلسل المطلوب.

## 1. البنية الحالية للمشروع

- **بلا إطار عمل**: HTML5 + CSS3 + JavaScript خام (Vanilla JS، namespace واحد `window.DLP`)، بلا أي حزمة إنتاج في `package.json` (السكربتات فقط: `serve.js`, `run.js` للاختبارات، `e2e.js`, `validate.js`).
- **موجّه Hash-based**: `assets/js/core/router.js` — يسجَّل عبر `DLP.router.add(path, handler)` ويُشغَّل بـ `DLP.router.start()`.
- **طبقة بيانات متزامنة بالكامل**: `assets/js/core/store.js` تقرأ من `DLP.data` (كائن يُبنى من `<script>` tags ثابتة) ولا تحتوي أي `await`/Promise.
- **محرّك الاختبارات**: `assets/js/core/quiz.js` — يحسب الدرجة والتصحيح **في المتصفح مباشرة** بمقارنة إجابة المستخدم بـ `question.answer` الموجود أصلاً في كائن JS الذي وصل للمتصفح.
- **مكوّنات العرض**: `assets/js/components/*.js` (home, subject, quiz-view, search-view, about, library, assistant, certificates, contact, layout) — تستدعي `DLP.store.*` مباشرة، لا طبقة API وسيطة.
- **بيانات المحتوى**: `data/config/*.js` (site, strings, contact, about) و`data/subjects/*.js` (5 مواد: `ai-data`, `legal-regulatory`, `cybersecurity-governance`, `innovation-project-management`, `risk-management`) — كل مادة كائن ضخم واحد يحوي `lectures`, `summaries`, `assignments`, `quizzes` (مع `questions` وإجاباتها الصحيحة كاملة)، `references`, `resources`, `updates`.
- **الملفات الثنائية**: PDF/PPTX/DOCX الفعلية مخزّنة ثابتة في `files/<subject>/...` على الموقع نفسه، ويُشار إليها من كائنات JS بحقل `url`/`storage_path` نصّي فقط.
- **الاختبارات**: `tests/harness.js` يحمّل كل ملفات المشروع داخل `vm` Node sandbox (بلا DOM حقيقي) وينفّذ عليها اختبارات وحدة (`tests/run.js`, 49 اختباراً) واختبارات e2e عبر متصفح حقيقي (`tests/e2e.js`, 60 اختباراً) — كلاهما يعمل حالياً بدون أي اتصال شبكي خارجي.
- **CSP صارم**: `index.html` يحدّد `Content-Security-Policy` بما فيها `script-src 'self'` و`connect-src 'self'` — أي استدعاء شبكي لأي نطاق خارجي (بما فيه Supabase) سيُحظر ما لم تُعدَّل السياسة صراحة، وأي مكتبة JS خارجية (مثل `@supabase/supabase-js`) يجب أن تُحمَّل من ملف محلي (`'self'`) لا من CDN.

## 2. نموذج البيانات الحالي

كل مادة (`subject`) كائن JS واحد بالشكل:

```
{ id, order, title, shortTitle, icon, accent, status, description,
  lectures:   [{ id, number, title, date, status, demo, description, objectives:[], files:[] }],
  summaries:  [{ id, lectureId, title, date, status, demo, keyPoints:[], concepts:[], terms:[], files:[] }],
  assignments:[{ id, title, difficulty, date, due, status, demo, description, files:[] }],
  quizzes:    [{ id, title, status, demo, description,
                 questions:[{ id, lectureId, type, difficulty, prompt, kind, explanation,
                              // بحسب type:
                              answer, options:[], pairs:[{left,right}], items:[], rubric:[{text,keywords}] }] }],
  references: [{ id, type, status, demo, title, author, year, publisher, url, note }],
  resources:  [{ id, type, title, date, url, status, demo }],
  updates:    [{ id, date, type, title, body, status, demo }] }
```

### أنواع الأسئلة الستة المكتشفة في `quiz.js`/البيانات
1. `mcq` — اختيار من متعدد: `options: string[]`, `answer: number` (فهرس الخيار الصحيح).
2. `tf` — صح/خطأ: `answer: boolean`.
3. `fill` — إكمال الفراغ: `answer: string[]` (قائمة إجابات مقبولة، مطابقة بعد lower/trim).
4. `match` — مطابقة: `pairs: [{left, right}]` — الترتيب نفسه هو الإجابة الصحيحة.
5. `order` — ترتيب: `items: string[]` — الترتيب المعطى هو الترتيب الصحيح.
6. `open` — سؤال مفتوح (سيناريو/مقالي): لا تصحيح آلي حقيقي، بل `rubric: [{text, keywords}]` تُستخدم لعرض نقاط توجيهية للمستخدم بعد إجابته — **تشخيص أمني مهم**: في التمثيل الحالي `rubric` و`explanation` و`answer` كلها موجودة في نفس كائن JS الذي يصل للمتصفح فور تحميل الصفحة، أي أن الإجابة الصحيحة لأي سؤال — بما فيها اختيار من متعدد — يمكن قراءتها من DevTools قبل محاولة الإجابة. هذا هو بالضبط ما تحله `supabase/migrations/002_rls.sql` عبر إخفاء هذه الأعمدة على مستوى قاعدة البيانات.

## 3. كيف تُحسب النتائج وأين تُخزَّن حالياً

- `core/quiz.js` يحتوي `grade(question, response)` و`score(quiz, responses)` — كلها حسابات محلية متزامنة، لا شبكة.
- `components/quiz-view.js` يحفظ تقدّم/نتائج المحاولة في **`localStorage`** حصراً (لا يوجد أي استدعاء شبكي في المشروع بالكامل قبل هذه المرحلة). هذا يخالف مباشرة قاعدة المستخدم رقم 10 ("لا تُستخدم localStorage كمخزن دائم لنتائج الطلاب")، وهو بالتحديد ما يعالجه تصميم `quiz_attempts`/`quiz_answers` في `001_initial_schema.sql` ودوال `003_functions.sql` (`start_quiz_attempt`, `save_quiz_answer`, `finish_quiz_attempt`).
- لا يوجد أي مفهوم "مستخدم مسجّل" في الكود الحالي إطلاقاً — كل تجربة الموقع بلا حساب، بما في ذلك عرض النتائج.

## 4. الترابط الحالي: store ↔ quiz ↔ quiz-view

- `store.list(subject, 'quizzes')` و`store.findQuiz(subject, quizId)` هما نقطتا الدخول الوحيدتان لقراءة أسئلة اختبار معيّن.
- `quiz-view.js` يستدعي `store.findQuiz(...)`, يمرّر الأسئلة لـ `quiz.js` للتصحيح، ويعرض النتيجة فوراً — **تزامنياً بالكامل، بلا أي `await`**.
- **الأثر على التصميم**: أي طبقة hydration غير متزامنة (`fetch`/Supabase) يجب أن **تكتمل قبل** استدعاء `store.subjects()`/`findQuiz()` لأول مرة من أي مكوّن، وإلا فستُقرأ بيانات فارغة. هذا هو سبب تصميم `hydrate()` في الخطة التالية بحيث يُستدعى مرة واحدة في `app.js` قبل `router.start()`، بينما تبقى دوال `store.*` نفسها متزامنة كما هي (Adapter pattern) لتفادي تعديل كل مكوّن.

## 5. اعتماديات localStorage المكتشفة

- نتائج/تقدّم الاختبارات (المخالفة الرئيسية المذكورة أعلاه).
- تفضيل الثيم (`theme-init.js`) — استخدام مشروع ومقبول (لا علاقة له ببيانات الطالب).
- لا اعتماديات أخرى ظاهرة في الفحص.

## 6. نقاط تمنع أو تعقّد الربط بخادم حقيقي (Backend-blocking assumptions)

1. **التزامن الكامل**: كل سلسلة `store → components → app` مبنية على افتراض أن البيانات متوفرة فوراً في الذاكرة؛ أي تحويل مباشر لاستدعاءات async سيكسر كل مكوّن ما لم يُستخدم نمط hydration مسبق (Adapter).
2. **تسريب الإجابات الصحيحة في الـ payload الأمامي**: مصدر المخاطرة الأمنية الأهم، ويُحل حصراً عبر تصميم قاعدة البيانات (RLS + column-level grants + دوال SECURITY DEFINER)، لا عبر إخفاء في الواجهة فقط.
3. **CSP الحالي**: `connect-src 'self'` يمنع أي طلب إلى `*.supabase.co` حتى تُعدَّل الميتا-تاغ صراحة لإضافة نطاق مشروع Supabase (`https://kotbarynxzyhxhzribpf.supabase.co`)، و`script-src 'self'` يفرض تحميل SDK عميل Supabase من ملف محلي داخل `assets/vendor/` بدل CDN.
4. **معرّفات المحتوى نصّية وليست UUID** (مثل `'ai-l1'`, `'lg-q1-57'`) — أي مخطط قاعدة بيانات يجب أن يحترم هذه المعرّفات حرفياً (وهذا ما فعله `001_initial_schema.sql` باستخدام `TEXT PRIMARY KEY` لجداول المحتوى تحديداً، مقابل `UUID` لجداول المستخدمين).
5. **لا مفهوم مستخدم/دور حالياً** — إدخال Supabase Auth يتطلب مكوّن جديد بالكامل (`auth.js`) وتعديلاً بسيطاً في `layout.js` لعرض حالة الدخول، دون كسر التصفح العام بلا حساب (يجب أن يبقى ممكناً وفق قاعدة المستخدم).
6. **بنية الاختبارات (harness.js)** تُحمِّل الملفات داخل `vm` بلا شبكة حقيقية — أي دالة `hydrate()` جديدة يجب أن يكون لها مسار تنفيذ متزامن/معطّل بالكامل (fallback فوري) حين لا تتوفر شبكة أو مفاتيح Supabase، حتى لا تُكسَر البيئة الاختبارية الحالية (49+60 اختباراً).

## 7. الخلاصة والانتقال للمرحلة التالية

المشروع صالح تماماً لتطبيق نمط "Adapter + Hydration" بأقل قدر من التغيير الجراحي: إبقاء `store.js` بواجهته العامة كما هي، وإضافة `DATA_SOURCE` + `hydrate()` تملأ `DLP.data` من Supabase عند توفره وإلا تسقط تلقائياً (fallback) على `<script>` tags الثابتة الحالية دون حذفها — تحقيقاً لقاعدة "لا تحذف نظام البيانات الحالي أثناء الانتقال". العمل على مخطط قاعدة البيانات والأمان (الطبقة الخلفية) اكتمل في هذه المرحلة وطُبِّق فعلياً على مشروع Supabase حي؛ العمل التالي هو طبقة التكامل الأمامية (`supabase.js`, `api.js`, `auth.js`, تعديل `store.js`/`app.js`/`quiz-view.js`، ولوحة الطالب/الإدارة) الموثّقة في `MIGRATION_PLAN.md`.
