/* مشغّل اختبارات بسيط بلا اعتماديات: node tests/run.js */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadPlatform, ROOT } = require('./harness');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed += 1; console.log('  ✓ ' + name); }
  catch (error) { failed += 1; failures.push({ name, error }); console.log('  ✗ ' + name + '\n      ' + error.message); }
}
function group(name) { console.log('\n▶ ' + name); }
function assert(condition, message) { if (!condition) { throw new Error(message || 'التوقع لم يتحقق'); } }
function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'قيمة غير متوقعة') + ` — المتوقع: ${expected} / الفعلي: ${actual}`);
  }
}

const DLP = loadPlatform();
const REQUIRED_SUBJECTS = [
  'ai-data', 'legal-regulatory', 'cybersecurity-governance',
  'innovation-project-management', 'risk-management'
];
const SECTION_KEYS = ['lectures', 'summaries', 'assignments', 'quizzes', 'references', 'resources', 'updates'];

/* ------------------------------ البيانات ------------------------------ */
group('طبقة البيانات (Data Layer)');

test('المواد الخمس كلها محمّلة ومنشورة', () => {
  const ids = DLP.store.subjects().map((s) => s.id);
  equal(ids.length, 5, 'عدد المواد');
  REQUIRED_SUBJECTS.forEach((id) => assert(ids.includes(id), 'المادة مفقودة: ' + id));
});

test('ترتيب المواد يتبع data/subjects/index.js', () => {
  const ids = DLP.store.subjects().map((s) => s.id);
  equal(ids.join(','), REQUIRED_SUBJECTS.join(','), 'الترتيب');
});

test('كل مادة تحتوي الأقسام السبعة كمصفوفات', () => {
  DLP.store.subjects().forEach((subject) => {
    SECTION_KEYS.forEach((key) => {
      assert(Array.isArray(subject[key]), `${subject.id} → ${key} ليست مصفوفة`);
    });
  });
});

test('كل مادة تحتوي الحد الأدنى من المحتوى التجريبي', () => {
  DLP.store.subjects().forEach((subject) => {
    const counts = DLP.store.subjectCounts(subject);
    assert(counts.lectures >= 2, subject.id + ': محاضرتان على الأقل');
    assert(counts.summaries >= 2, subject.id + ': ملخصان على الأقل');
    assert(counts.assignments >= 1, subject.id + ': تمرين واحد على الأقل');
    assert(counts.questions >= 5, subject.id + ': خمسة أسئلة على الأقل');
    assert(counts.references >= 1, subject.id + ': مرجع واحد على الأقل');
  });
});

test('كل عنصر محتوى يحمل معرّفاً فريداً', () => {
  const seen = new Set();
  DLP.store.subjects().forEach((subject) => {
    SECTION_KEYS.forEach((key) => {
      subject[key].forEach((item) => {
        assert(item.id, `${subject.id}/${key}: عنصر بلا معرّف`);
        assert(!seen.has(item.id), 'معرّف مكرر: ' + item.id);
        seen.add(item.id);
      });
    });
    (subject.quizzes || []).forEach((quiz) => quiz.questions.forEach((q) => {
      assert(q.id, 'سؤال بلا معرّف في ' + quiz.id);
      assert(!seen.has(q.id), 'معرّف سؤال مكرر: ' + q.id);
      seen.add(q.id);
    }));
  });
});

test('كل عنصر يحمل حالة صالحة (published/draft/archived)', () => {
  const allowed = ['published', 'draft', 'archived'];
  DLP.store.subjects().forEach((subject) => {
    SECTION_KEYS.forEach((key) => {
      subject[key].forEach((item) => {
        const status = item.status || 'published';
        assert(allowed.includes(status), `${item.id}: حالة غير صالحة (${status})`);
      });
    });
  });
});

test('نظام الحالة يخفي المحتوى غير المنشور', () => {
  const subject = DLP.store.getSubject('ai-data');
  const before = DLP.store.list(subject, 'lectures').length;
  subject.lectures[0].status = 'draft';
  const after = DLP.store.list(subject, 'lectures').length;
  subject.lectures[0].status = 'published';
  equal(after, before - 1, 'المسودة يجب أن تُخفى');
});

/* ------------------------------ الإحصائيات ------------------------------ */
group('الإحصائيات (Dashboard)');

test('الإحصائيات محسوبة من البيانات لا مكتوبة يدوياً', () => {
  const stats = DLP.store.stats();
  const subjects = DLP.store.subjects();
  equal(stats.subjects, subjects.length, 'عدد المواد');
  equal(stats.lectures, subjects.reduce((n, s) => n + s.lectures.length, 0), 'عدد المحاضرات');
  equal(stats.summaries, subjects.reduce((n, s) => n + s.summaries.length, 0), 'عدد الملخصات');
  equal(stats.assignments, subjects.reduce((n, s) => n + s.assignments.length, 0), 'عدد الواجبات');
  equal(stats.quizzes, subjects.reduce((n, s) => n + s.quizzes.length, 0), 'عدد الاختبارات');
  equal(stats.questions, subjects.reduce((n, s) =>
    n + s.quizzes.reduce((m, q) => m + q.questions.length, 0), 0), 'عدد الأسئلة');
  assert(stats.questions > 0, 'يجب أن توجد أسئلة');
});

test('آخر التحديثات مرتبة تنازلياً حسب التاريخ', () => {
  const updates = DLP.store.latestUpdates(10);
  assert(updates.length > 0, 'لا توجد تحديثات');
  for (let i = 1; i < updates.length; i++) {
    assert(updates[i - 1].update.date >= updates[i].update.date, 'الترتيب غير صحيح');
  }
});

/* ------------------------------ الأسئلة التفاعلية ------------------------------ */
group('محرّك الأسئلة التفاعلية');

const allQuestions = DLP.store.subjects().flatMap((s) => s.quizzes.flatMap((q) => q.questions));

test('كل الأنواع الخمسة ممثّلة في البيانات', () => {
  const types = new Set(allQuestions.map((q) => q.type));
  ['mcq', 'tf', 'fill', 'match', 'order'].forEach((type) => assert(types.has(type), 'النوع مفقود: ' + type));
});

test('كل سؤال يحمل مستوى صعوبة صالحاً وتفسيراً', () => {
  allQuestions.forEach((q) => {
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.id + ': مستوى صعوبة غير صالح');
    assert(q.explanation && q.explanation.length > 10, q.id + ': تفسير ناقص');
    assert(q.prompt && q.prompt.length > 5, q.id + ': نص السؤال ناقص');
  });
});

test('بنية كل نوع سؤال صحيحة', () => {
  allQuestions.forEach((q) => {
    if (q.type === 'mcq') {
      assert(Array.isArray(q.options) && q.options.length >= 2, q.id + ': خيارات ناقصة');
      assert(Number.isInteger(q.answer) && q.options[q.answer] !== undefined, q.id + ': فهرس إجابة غير صالح');
    } else if (q.type === 'tf') {
      assert(typeof q.answer === 'boolean', q.id + ': الإجابة يجب أن تكون منطقية');
    } else if (q.type === 'fill') {
      assert(Array.isArray(q.answer) ? q.answer.length > 0 : !!q.answer, q.id + ': إجابة ناقصة');
    } else if (q.type === 'match') {
      assert(Array.isArray(q.pairs) && q.pairs.length >= 2, q.id + ': أزواج ناقصة');
      q.pairs.forEach((p) => assert(p.left && p.right, q.id + ': زوج ناقص'));
    } else if (q.type === 'order') {
      assert(Array.isArray(q.items) && q.items.length >= 3, q.id + ': عناصر ترتيب ناقصة');
    }
  });
});

test('التصحيح صحيح لكل نوع عند الإجابة الصحيحة', () => {
  allQuestions.forEach((q) => {
    let response;
    if (q.type === 'mcq') { response = q.answer; }
    else if (q.type === 'tf') { response = q.answer; }
    else if (q.type === 'fill') { response = Array.isArray(q.answer) ? q.answer[0] : q.answer; }
    else if (q.type === 'match') { response = q.pairs.map((p) => p.right); }
    else if (q.type === 'order') { response = q.items.slice(); }
    const result = DLP.quiz.grade(q, response);
    assert(result.answered, q.id + ': لم تُحتسب كإجابة');
    assert(result.correct, q.id + ': الإجابة الصحيحة صُحّحت كخطأ');
  });
});

test('التصحيح يرفض الإجابات الخاطئة', () => {
  allQuestions.forEach((q) => {
    let response;
    if (q.type === 'mcq') { response = (q.answer + 1) % q.options.length; }
    else if (q.type === 'tf') { response = String(!q.answer); }
    else if (q.type === 'fill') { response = 'إجابة غير صحيحة إطلاقاً'; }
    else if (q.type === 'match') { response = q.pairs.map((p) => p.right).slice().reverse(); }
    else if (q.type === 'order') { response = q.items.slice().reverse(); }
    const result = DLP.quiz.grade(q, response);
    assert(!result.correct, q.id + ': إجابة خاطئة صُحّحت كصحيحة');
  });
});

test('التصحيح يتجاهل التشكيل واختلاف الهمزات في أسئلة إكمال الفراغ', () => {
  const question = { type: 'fill', answer: ['الأثر'], explanation: '' };
  assert(DLP.quiz.grade(question, ' الاثر ').correct, 'يجب قبول صيغة بدون همزة');
  assert(DLP.quiz.grade(question, 'الأَثَر').correct, 'يجب قبول صيغة مشكّلة');
  assert(!DLP.quiz.grade(question, 'الاحتمال').correct, 'يجب رفض إجابة مختلفة');
});

test('السؤال غير المُجاب لا يُحتسب صحيحاً', () => {
  const question = allQuestions.find((q) => q.type === 'mcq');
  const result = DLP.quiz.grade(question, null);
  assert(!result.answered && !result.correct, 'سؤال بلا إجابة يجب ألا يُحتسب');
});

test('حساب النتيجة والنسبة المئوية صحيح', () => {
  const quiz = DLP.store.getSubject('ai-data').quizzes[0];
  const responses = {};
  quiz.questions.forEach((q, i) => {
    if (i % 2 === 0) {
      if (q.type === 'mcq') { responses[q.id] = q.answer; }
      else if (q.type === 'tf') { responses[q.id] = q.answer; }
      else if (q.type === 'fill') { responses[q.id] = Array.isArray(q.answer) ? q.answer[0] : q.answer; }
      else if (q.type === 'match') { responses[q.id] = q.pairs.map((p) => p.right); }
      else if (q.type === 'order') { responses[q.id] = q.items.slice(); }
    }
  });
  const expectedCorrect = quiz.questions.filter((q, i) => i % 2 === 0).length;
  const score = DLP.quiz.score(quiz.questions, responses);
  equal(score.total, quiz.questions.length, 'الإجمالي');
  equal(score.correct, expectedCorrect, 'عدد الصحيح');
  equal(score.percent, Math.round((expectedCorrect / quiz.questions.length) * 100), 'النسبة');
});

test('تصفية الأسئلة حسب الصعوبة تعمل', () => {
  const questions = DLP.store.getSubject('risk-management').quizzes[0].questions;
  equal(DLP.quiz.filterByDifficulty(questions, 'all').length, questions.length, 'الكل');
  const easy = DLP.quiz.filterByDifficulty(questions, 'easy');
  assert(easy.length > 0 && easy.every((q) => q.difficulty === 'easy'), 'تصفية السهل');
});

/* ------------------------------ البحث ------------------------------ */
group('محرّك البحث');

test('الفهرس يغطي كل أنواع المحتوى', () => {
  const types = new Set(DLP.search.getIndex().map((e) => e.type));
  ['lecture', 'summary', 'assignment', 'question', 'reference', 'resource', 'update']
    .forEach((type) => assert(types.has(type), 'نوع مفقود من الفهرس: ' + type));
});

test('البحث يعيد نتائج مطابقة مع مادة ونوع ورابط', () => {
  const results = DLP.search.query('المخاطر');
  assert(results.length > 0, 'لا نتائج لكلمة "المخاطر"');
  results.forEach((r) => {
    assert(r.subjectTitle && r.typeLabel && r.title, 'نتيجة ناقصة الحقول');
    assert(r.route.startsWith('#/subject/'), 'رابط غير صالح: ' + r.route);
  });
});

test('البحث يتجاهل التشكيل واختلاف الهمزة', () => {
  assert(DLP.search.query('الذكاء الاصطناعي').length > 0, 'بحث عادي');
  assert(DLP.search.query('الذكاء الإصطناعي').length > 0, 'بحث بهمزة مختلفة');
});

test('البحث بكلمات متعددة يطبّق AND', () => {
  const results = DLP.search.query('دورة حياة المشروع');
  assert(results.length > 0, 'لا نتائج');
  results.forEach((r) => {
    ['دوره', 'حياه', 'المشروع'].forEach((word) =>
      assert(r.haystack.includes(word), 'نتيجة لا تحوي كل الكلمات'));
  });
});

test('البحث عن كلمة غير موجودة يعيد صفر نتائج', () => {
  equal(DLP.search.query('كلمةلاتوجدإطلاقاxyz').length, 0, 'يجب ألا توجد نتائج');
});

test('البحث الفارغ لا يعيد نتائج', () => {
  equal(DLP.search.query('   ').length, 0, 'بحث فارغ');
});

test('تصفية البحث حسب المادة تعمل', () => {
  const results = DLP.search.query('ال', { subjectId: 'risk-management' });
  assert(results.length > 0, 'لا نتائج');
  results.forEach((r) => equal(r.subjectId, 'risk-management', 'تسرّبت نتيجة من مادة أخرى'));
});

/* ------------------------------ الموجّه ------------------------------ */
group('الموجّه (Router)');

test('تحليل المسارات والمعاملات صحيح', () => {
  equal(DLP.router.parse('#/subject/ai-data/lectures').path, '/subject/ai-data/lectures', 'المسار');
  equal(DLP.router.parse('#/search?q=%D8%A7%D9%84%D8%AE%D8%B7%D8%B1').query.q, 'الخطر', 'معامل البحث');
  equal(DLP.router.parse('').path, '/', 'المسار الفارغ');
  equal(DLP.router.parse('#/about/').path, '/about', 'إزالة الشرطة الأخيرة');
});

test('كل مادة وكل قسم لها مسار قابل للحل', () => {
  DLP.router.add('/', () => {});
  DLP.router.add('/search', () => {});
  DLP.router.add('/about', () => {});
  DLP.router.add('/subject/:id', () => {});
  DLP.router.add('/subject/:id/:section', () => {});
  ['#/', '#/about', '#/search'].forEach((hash) =>
    assert(DLP.router.resolve(hash).route, 'مسار غير قابل للحل: ' + hash));
  DLP.store.subjects().forEach((subject) => {
    SECTION_KEYS.forEach((section) => {
      const resolved = DLP.router.resolve('#/subject/' + subject.id + '/' + section);
      assert(resolved.route, 'مسار مادة غير قابل للحل');
      equal(resolved.params.id, subject.id, 'معرّف المادة');
      equal(resolved.params.section, section, 'القسم');
    });
  });
});

test('المسار غير الموجود لا يطابق أي مسار مسجّل', () => {
  assert(!DLP.router.resolve('#/does/not/exist/here').route, 'يجب ألا يطابق');
});

/* ------------------------------ الأمان والأدوات ------------------------------ */
group('الأمان والأدوات المساعدة');

test('تهريب HTML يمنع حقن السكربتات (XSS)', () => {
  const output = DLP.utils.escapeHtml('<img src=x onerror="alert(1)">');
  assert(!output.includes('<'), 'وسوم غير مهرّبة');
  assert(output.includes('&lt;img'), 'ناتج غير متوقع');
});

test('فلتر الروابط يرفض البروتوكولات غير الآمنة', () => {
  equal(DLP.utils.safeUrl('javascript:alert(1)'), null, 'javascript:');
  equal(DLP.utils.safeUrl('data:text/html,<script>'), null, 'data:');
  equal(DLP.utils.safeUrl('//evil.example'), null, 'رابط بروتوكول مفتوح');
  equal(DLP.utils.safeUrl('https://example.org/a.pdf'), 'https://example.org/a.pdf', 'https');
  equal(DLP.utils.safeUrl('files/a.pdf'), 'files/a.pdf', 'مسار نسبي');
  equal(DLP.utils.safeUrl(null), null, 'قيمة فارغة');
});

test('تنسيق التاريخ عربي وصحيح', () => {
  equal(DLP.utils.formatDate('2026-08-10'), '10 أغسطس 2026', 'تنسيق التاريخ');
  equal(DLP.utils.formatDate(null), '', 'تاريخ فارغ');
});

test('كل روابط الملفات في البيانات إما فارغة أو آمنة', () => {
  DLP.store.subjects().forEach((subject) => {
    const urls = [];
    subject.lectures.forEach((l) => (l.files || []).forEach((f) => urls.push(f.url)));
    subject.summaries.forEach((s) => (s.files || []).forEach((f) => urls.push(f.url)));
    subject.assignments.forEach((a) => (a.files || []).forEach((f) => urls.push(f.url)));
    subject.resources.forEach((r) => urls.push(r.url));
    subject.references.forEach((r) => urls.push(r.url));
    urls.forEach((url) => {
      if (url !== null && url !== undefined) {
        assert(DLP.utils.safeUrl(url) !== null, 'رابط غير آمن في البيانات: ' + url);
      }
    });
  });
});

/* ------------------------------ الترجمة ------------------------------ */
group('طبقة الترجمة (i18n)');

test('كل مفاتيح النصوص المستخدمة معرّفة', () => {
  const table = DLP.config.strings.ar;
  ['nav.home', 'nav.about', 'section.lectures', 'section.quizzes', 'quiz.check',
   'common.backToTop', 'common.home', 'search.results', 'stats.questions',
   'difficulty.easy', 'difficulty.medium', 'difficulty.hard']
    .forEach((key) => assert(Object.prototype.hasOwnProperty.call(table, key), 'مفتاح مفقود: ' + key));
});

test('الجدول الإنجليزي مكتمل ومطابق للعربية مفتاحاً بمفتاح', () => {
  const ar = DLP.config.strings.ar;
  const en = DLP.config.strings.en;
  assert(en, 'الجدول الإنجليزي غير موجود');
  const missing = Object.keys(ar).filter((k) => !Object.prototype.hasOwnProperty.call(en, k));
  const extra = Object.keys(en).filter((k) => !Object.prototype.hasOwnProperty.call(ar, k));
  assert(!missing.length, 'مفاتيح ناقصة في en: ' + missing.join(', '));
  assert(!extra.length, 'مفاتيح زائدة في en: ' + extra.join(', '));
  equal(en.dir, 'ltr', 'اتجاه الإنجليزية');
  const empty = Object.keys(en).filter((k) => !String(en[k]).trim());
  assert(!empty.length, 'قيم فارغة في en: ' + empty.join(', '));
});

test('لا توجد نصوص عربية مكتوبة داخل مكوّنات الواجهة', () => {
  const arabic = /[\u0600-\u06FF]/;
  const files = fs.readdirSync(path.join(ROOT, 'assets/js/components'))
    .map((name) => path.join(ROOT, 'assets/js/components', name))
    .concat([path.join(ROOT, 'assets/js/app.js')]);
  const leaks = [];
  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    const literals = content.match(/'(?:[^'\\]|\\.)*'/g) || [];
    literals.forEach((literal) => {
      if (arabic.test(literal) && literal.indexOf('DLP') === -1) {
        leaks.push(path.basename(file) + ': ' + literal.slice(0, 40));
      }
    });
  });
  assert(!leaks.length, 'نصوص خارج طبقة الترجمة: ' + leaks.join(' | '));
});

test('الاتجاه واللغة معرّفان للعربية', () => {
  equal(DLP.config.strings.ar.dir, 'rtl', 'الاتجاه');
  equal(DLP.config.strings.ar.lang, 'ar', 'اللغة');
});

test('t تعيد بديلاً عند غياب المفتاح', () => {
  equal(DLP.i18n.t('key.does.not.exist', 'بديل'), 'بديل', 'قيمة بديلة');
});

/* ------------------------------ الملفات والبنية ------------------------------ */
group('بنية المشروع والنشر');

test('كل ملفات السكربت المشار إليها في index.html موجودة', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sources = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert(sources.length >= 18, 'عدد السكربتات أقل من المتوقع');
  sources.forEach((src) => assert(fs.existsSync(path.join(ROOT, src)), 'ملف مفقود: ' + src));
  const styles = [...html.matchAll(/<link rel="stylesheet" href="(?!https)([^"]+)"/g)].map((m) => m[1]);
  styles.forEach((href) => assert(fs.existsSync(path.join(ROOT, href)), 'ملف تنسيق مفقود: ' + href));
});

test('كل إعلان تجريبي موسوم بوضوح', () => {
  const realIds = ['ai-u4', 'lg-u3', 'ip-u3'];
  DLP.store.subjects().forEach((subject) => {
    DLP.store.list(subject, 'updates').forEach((update) => {
      const isReal = realIds.indexOf(update.id) !== -1;
      if (!isReal) { assert(update.demo === true, 'إعلان تجريبي بلا وسم: ' + update.id); }
      else { assert(!update.demo, 'إعلان حقيقي موسوم خطأً: ' + update.id); }
    });
  });
});

test('ملفات النشر والفهرسة موجودة', () => {
  ['robots.txt', 'sitemap.xml', '.github/workflows/ci.yml'].forEach((file) => {
    assert(fs.existsSync(path.join(ROOT, file)), 'مفقود: ' + file);
  });
});

test('سياسة أمان المحتوى ووسوم المشاركة موجودة', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('Content-Security-Policy'), 'CSP مفقودة');
  assert(html.includes("script-src 'self'"), 'CSP تسمح بسكربتات خارجية');
  assert(html.includes('og:title'), 'وسوم og مفقودة');
  assert(html.includes('routeAnnouncer'), 'منطقة إعلان المسار مفقودة');
});

test('رابط أرشيف الكورس الأول يشير إلى ملف موجود', () => {
  const archive = DLP.config.about.archive;
  assert(Array.isArray(archive) && archive.length, 'الأرشيف فارغ');
  archive.forEach((item) => {
    const target = path.join(ROOT, decodeURIComponent(item.url));
    assert(fs.existsSync(target), 'ملف الأرشيف مفقود: ' + item.url);
  });
});

test('الصفحة عربية واتجاهها RTL', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('lang="ar"'), 'lang مفقود');
  assert(html.includes('dir="rtl"'), 'dir مفقود');
  assert(html.includes('name="viewport"'), 'viewport مفقود');
});

test('لا توجد أسرار أو مفاتيح في ملفات المشروع', () => {
  const patterns = [/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{8,}/i, /secret\s*[:=]\s*['"][^'"]{8,}/i,
                    /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{20,}/];
  const dirs = ['assets', 'data', 'tests', 'scripts'];
  const files = [path.join(ROOT, 'index.html')];
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); }
      else if (/\.(js|css|html|json|md)$/.test(entry.name)) { files.push(full); }
    });
  }
  dirs.forEach((dir) => { const full = path.join(ROOT, dir); if (fs.existsSync(full)) { walk(full); } });
  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    patterns.forEach((pattern) => assert(!pattern.test(content), 'سرّ محتمل في: ' + path.relative(ROOT, file)));
  });
});

/* ------------------------------ النتيجة ------------------------------ */
console.log('\n' + '─'.repeat(52));
console.log(`النتيجة: ${passed} نجحت / ${failed} فشلت — الإجمالي ${passed + failed}`);
if (failed) {
  console.log('\nالاختبارات الفاشلة:');
  failures.forEach((f) => console.log(' - ' + f.name + ': ' + f.error.message));
  process.exit(1);
}
console.log('كل الاختبارات نجحت ✓');
