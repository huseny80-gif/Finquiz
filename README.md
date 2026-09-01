# منصة المواد الدراسية — الكورس الثاني

**الدبلوم العالي المهني في القيادة الرقمية**

منصة تعليمية رقمية ثابتة (Static) تعرض مواد الكورس الثاني الخمس مع محاضراتها وملخصاتها
وواجباتها وأسئلتها التفاعلية ومراجعها وملفاتها وتحديثاتها، مع بحث داخلي شامل ولوحة إحصائيات
تُحسب تلقائياً من البيانات.

---

## 1. التقنية المستخدمة

| البند | القرار |
|---|---|
| اللغة | HTML5 + CSS3 + JavaScript (ES5/ES6 متوافق مع المتصفحات الحديثة) |
| الإطار | بدون أطر عمل وبدون أدوات بناء — لا Webpack ولا Vite ولا npm dependencies |
| الاعتماديات | **صفر** اعتماديات إنتاجية (الخطوط فقط من Google Fonts، والصفحة تعمل بدونها) |
| التوجيه | موجّه داخلي قائم على `hash` (`#/subject/:id/:section`) |
| اللغة والاتجاه | عربية `lang="ar"` واتجاه `dir="rtl"` مع طبقة ترجمة جاهزة للإنجليزية |
| الاختبارات | Node بلا اعتماديات (وحدات) + Playwright (متصفح) |

**لماذا بلا أدوات بناء؟** المشروع الأصلي في هذا المستودع صفحة HTML مستقلة بلا نظام بناء،
والمنصة الجديدة تلتزم النهج نفسه: تُنشر كما هي على GitHub Pages أو Netlify أو Vercel
بلا خطوة build، وتفتح مباشرة بالنقر المزدوج على `index.html`.

---

## 2. البنية المعمارية (Architecture)

```
Content (data/)  →  Data Layer (core/store.js)  →  Components  →  Pages  →  Router  →  Tests
```

```
Finquiz/
├── index.html                       # هيكل الصفحة + ترتيب تحميل الطبقات
├── package.json                     # أوامر التشغيل والاختبار (بلا اعتماديات)
│
├── data/                            # ★ طبقة المحتوى — كل ما يُحدَّث موجود هنا
│   ├── config/
│   │   ├── site.js                  # اسم المنصة، البرنامج، الكورس، حالات العرض
│   │   ├── strings.js               # كل نصوص الواجهة (طبقة الترجمة)
│   │   ├── contact.js               # وسائل التواصل
│   │   └── about.js                 # محتوى صفحة "من نحن"
│   └── subjects/
│       ├── index.js                 # ترتيب المواد
│       ├── ai-data.js               # الذكاء الاصطناعي وتحليل البيانات
│       ├── legal-regulatory.js      # الثقافة القانونية والتنظيمية
│       ├── cybersecurity-governance.js
│       ├── innovation-project-management.js
│       └── risk-management.js
│
├── assets/
│   ├── css/styles.css               # نظام التصميم كاملاً (متغيّرات CSS)
│   └── js/
│       ├── core/                    # النواة — منطق بلا واجهة (قابل للاختبار)
│       │   ├── utils.js             # تهريب HTML، فلترة الروابط، تطبيع عربي، تواريخ
│       │   ├── i18n.js              # t() وتبديل اللغة
│       │   ├── store.js             # الوصول للبيانات + تصفية الحالة + الإحصائيات
│       │   ├── search.js            # فهرس البحث والاستعلام
│       │   ├── quiz.js              # تصحيح الأسئلة وحساب النتيجة
│       │   └── router.js            # موجّه hash
│       ├── components/              # المكوّنات — واجهة فقط
│       │   ├── layout.js            # ترويسة/تنقل/بحث/تذييل/أزرار الرجوع
│       │   ├── home.js              # الصفحة الرئيسية والإحصائيات
│       │   ├── subject.js           # صفحة المادة وأقسامها السبعة
│       │   ├── quiz-view.js         # واجهة الأسئلة التفاعلية
│       │   ├── search-view.js       # نتائج البحث
│       │   ├── about.js             # من نحن
│       │   └── contact.js           # وسائل التواصل
│       └── app.js                   # تسجيل المسارات وبدء التشغيل
│
├── scripts/
│   ├── serve.js                     # خادم تطوير محلي
│   └── validate.js                  # تحقق قبل النشر
│
└── tests/
    ├── harness.js                   # تحميل المنصة داخل Node بلا متصفح
    ├── run.js                       # 38 اختبار وحدة
    └── e2e.js                       # 49 اختبار متصفح (Playwright)
```

**القاعدة الحاكمة:** لا يعرف مجلد `data/` شيئاً عن الواجهة، ولا يحتوي مجلد `components/`
أي محتوى دراسي. إضافة المحتوى تتم في `data/` فقط.

### نموذج البيانات

```js
Subject {
  id, order, title, shortTitle, description, icon, accent, status,
  lectures[]    { id, number, title, date, description, objectives[], files[], status, demo }
  summaries[]   { id, lectureId, title, date, keyPoints[], concepts[{term,definition}], terms[], files[] }
  assignments[] { id, title, description, difficulty, date, due, files[], status }
  quizzes[]     { id, title, description, questions[] }
  references[]  { id, type, title, author, year, publisher, url, note }
  resources[]   { id, type, title, date, url }
  updates[]     { id, date, type, title, body }
}

Question { id, type, difficulty, prompt, explanation, ...حقول حسب النوع }
```

أنواع الأسئلة المدعومة: `mcq` (اختيار من متعدد) · `tf` (صح/خطأ) · `fill` (إكمال فراغ) ·
`match` (مطابقة) · `order` (ترتيب).

---

## 3. طريقة التشغيل

### محلياً

```bash
npm start                 # ثم افتح http://localhost:8080
```

أو بأي خادم ثابت آخر:

```bash
python3 -m http.server 8080
npx http-server -p 8080
```

> يمكن أيضاً فتح `index.html` مباشرة بالنقر المزدوج — المنصة لا تستخدم `fetch` ولا ES Modules،
> لذلك تعمل من نظام الملفات كما تعمل من الخادم.

### الاختبارات

```bash
npm test                  # 38 اختبار وحدة (بيانات، بحث، تصحيح، توجيه، أمان)
npm run test:e2e          # 49 اختبار متصفح (وظيفي + استجابة + وصول + console)
npm run validate          # تحقق من البنية والبيانات قبل النشر
npm run build             # validate + test
```

---

## 4. كيف تضيف محتوى؟ (بلا لمس الواجهة)

### إضافة مادة دراسية جديدة

1. انسخ `data/subjects/risk-management.js` إلى `data/subjects/my-subject.js`.
2. غيّر `id` و`order` و`title` و`shortTitle` و`icon` و`accent` و`description`.
3. أضف المعرّف إلى المصفوفة في `data/subjects/index.js`.
4. أضف السطر في `index.html` ضمن قسم «طبقة المحتوى»:
   ```html
   <script src="data/subjects/my-subject.js"></script>
   ```

كل شيء آخر (التبويب، الروابط، الإحصائيات، البحث، التذييل) يتحدّث تلقائياً.

### إضافة محاضرة

في مصفوفة `lectures` داخل ملف المادة:

```js
{
  id: 'ai-l3', number: 3,
  title: 'عنوان المحاضرة',
  date: '2026-09-01',
  status: 'published',
  description: 'وصف مختصر…',
  objectives: ['هدف أول', 'هدف ثانٍ'],
  files: [
    { type: 'pdf',   label: 'ملف المحاضرة (PDF)', url: 'files/ai/l3.pdf' },
    { type: 'video', label: 'تسجيل المحاضرة',     url: 'https://…' }
  ]
}
```

`type` المدعوم للملفات: `pdf` · `docx` · `pptx` · `xlsx` · `image` · `video` · `link`.
اترك `url: null` ليظهر الملف كـ «قريباً» بدل رابط مكسور.

### إضافة ملخص

```js
{
  id: 'ai-s3', lectureId: 'ai-l3',      // lectureId اختياري ويجب أن يطابق محاضرة موجودة
  title: 'ملخص المحاضرة الثالثة', date: '2026-09-02', status: 'published',
  keyPoints: ['نقطة', 'نقطة'],
  concepts: [{ term: 'مصطلح', definition: 'تعريفه' }],
  terms: ['مصطلح 1', 'مصطلح 2'],
  files: [{ type: 'pdf', label: 'الملخص (PDF)', url: null }]
}
```

### إضافة واجب أو تمرين

```js
{
  id: 'ai-a3', title: 'عنوان التمرين', description: 'وصف المهمة…',
  difficulty: 'easy' | 'medium' | 'hard',
  date: '2026-09-02', due: '2026-09-12',   // due = null إذا لا يوجد موعد تسليم
  status: 'published', files: []
}
```

### إضافة سؤال تفاعلي

أضف داخل `quizzes[0].questions` حسب النوع:

```js
// اختيار من متعدد
{ id:'ai-q1-7', type:'mcq', difficulty:'easy', prompt:'نص السؤال؟',
  options:['أ','ب','ج','د'], answer:1, explanation:'التفسير' }

// صح / خطأ
{ id:'…', type:'tf', difficulty:'easy', prompt:'العبارة', answer:true, explanation:'…' }

// إكمال فراغ (answer مصفوفة من الصيغ المقبولة)
{ id:'…', type:'fill', difficulty:'medium', prompt:'… ............',
  answer:['التنبؤي','تنبؤي'], explanation:'…' }

// مطابقة
{ id:'…', type:'match', difficulty:'medium', prompt:'طابق…',
  pairs:[{left:'عنصر',right:'ما يقابله'}, …], explanation:'…' }

// ترتيب (items بالترتيب الصحيح — المنصة تعرضها للترتيب)
{ id:'…', type:'order', difficulty:'hard', prompt:'رتّب…',
  items:['أولاً','ثانياً','ثالثاً'], explanation:'…' }
```

التصحيح يتجاهل التشكيل واختلاف الهمزات (`الأثر` = `الاثر` = `الأَثَر`).

### إضافة ملف أو مرجع

```js
// resources[]
{ id:'ai-f4', type:'pdf', title:'اسم الملف', date:'2026-09-01', url:'files/ai/x.pdf', status:'published' }

// references[]
{ id:'ai-r3', type:'book'|'paper'|'article'|'website'|'pdf',
  title:'العنوان', author:'المؤلف', year:2026, publisher:'الناشر', url:'https://…', note:'ملاحظة' }
```

ضع الملفات الفعلية في مجلد داخل المستودع (مثل `files/ai/`) وأشر إليها بمسار نسبي.

### إضافة إعلان أو تحديث

```js
{ id:'ai-u4', date:'2026-09-01', type:'lecture', title:'عنوان الإعلان', body:'النص', status:'published' }
```

يظهر تلقائياً في قسم «الإعلانات» داخل المادة، وفي «آخر التحديثات» في الصفحة الرئيسية.

### إخفاء محتوى بلا حذفه

غيّر `status` إلى `draft` أو `archived`. ما يظهر للزوّار تحدّده
`visibleStatuses` في `data/config/site.js`.

---

## 5. تحديث "من نحن" ووسائل التواصل

* **من نحن:** `data/config/about.js` — العناوين والفقرات والفريق والتنبيه كلها قابلة للتعديل،
  ويمكن إضافة أو حذف أقسام كاملة من مصفوفة `sections`.
* **وسائل التواصل:** `data/config/contact.js` — ضع القيمة الحقيقية مكان `null`:

```js
{ id:'email',    label:'البريد الإلكتروني', icon:'✉️', value:'name@example.org', hrefPrefix:'mailto:' }
{ id:'whatsapp', label:'واتساب',            icon:'💬', value:'9677xxxxxxx',      hrefPrefix:'https://wa.me/' }
{ id:'linkedin', label:'لينكدإن',           icon:'💼', value:'https://www.linkedin.com/in/…', hrefPrefix:'' }
```

الوسيلة التي قيمتها `null` تظهر كـ «ستُفعّل قريباً» — بلا روابط وهمية إطلاقاً.
كل رابط يمرّ عبر فلتر `safeUrl` الذي يرفض `javascript:` و`data:` وأي بروتوكول غير آمن.

---

## 6. النشر

المشروع ثابت بالكامل ولا يحتاج خطوة build.

| المنصة | الإعداد |
|---|---|
| **GitHub Pages** | Settings → Pages → Source: الفرع + مجلد `/ (root)` |
| **Netlify** | Build command: *(فارغ)* — Publish directory: `.` |
| **Vercel** | Framework Preset: *Other* — Output directory: `.` |
| **أي استضافة** | ارفع محتوى المجلد كما هو |

قبل النشر: `npm run build`.

---

## 7. التطوير المستقبلي

* **الإنجليزية:** أضف كائن `en` بالمفاتيح نفسها في `data/config/strings.js`، ثم
  `DLP.i18n.setLocale('en')` (يبدّل `lang` و`dir` تلقائياً).
* **لوحة تحكم (Admin):** البنية جاهزة — طبقة البيانات معزولة خلف `DLP.store`، فيكفي
  استبدال مصدرها بـ API يعيد الشكل نفسه، بلا تعديل أي مكوّن واجهة.
* **Backend:** أضف طبقة جلب بيانات تُسند إلى `DLP.data` قبل بدء التشغيل؛ باقي المنصة لا يتغيّر.
* **حفظ تقدّم الدارس:** يمكن ربط حالة الاختبار في `quiz-view.js` بـ `localStorage` أو حساب مستخدم.
* **مصادقة:** غير مطلوبة حالياً، والمعمارية لا تمنع إضافتها لاحقاً أمام طبقة البيانات.

---

## 8. الأمان

* لا توجد مفاتيح API ولا أسرار في المستودع (يتحقق منه اختبار آلي).
* كل نص يمرّ عبر `escapeHtml` قبل إدراجه في الصفحة (حماية من XSS).
* كل رابط يمرّ عبر `safeUrl` (يُسمح بـ `http(s)`/`mailto`/`tel`/المسارات النسبية فقط).
* الروابط الخارجية تحمل `rel="noopener noreferrer"`.
* لا يُنفَّذ أي HTML قادم من البيانات مباشرة.

---

## 9. ملفات سابقة في المستودع

`بنك الاسئلة 360 سؤال الادارة المالية الرقمية.html` — بنك أسئلة الكورس الأول
(مادة الإدارة المالية الرقمية) كصفحة مستقلة. تُرك كما هو دون تعديل، ويمكن فتحه مباشرة.

---

## 10. المحتوى الحالي

المحتوى المعروض **تجريبي (Demo)** لأغراض العرض، ومؤشّر بوضوح داخل الواجهة.
لا يحتوي على مراجع أكاديمية منسوبة إلى مصادر حقيقية؛ خانات المراجع مُهيّأة لتُملأ
بالمصادر المعتمدة من مدرّس المقرر.

**إعداد:** المهندس / حسين ياسين حسن
