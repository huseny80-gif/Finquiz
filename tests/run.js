/* مشغّل اختبارات بسيط بلا اعتماديات: node tests/run.js */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadPlatform, ROOT } = require('./harness');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed += 1; console.log('  ✓ ' + name); }
  catch (error) { failed += 1; failures.push({ name, error }); console.log('  ✗ ' + name + '\n      ' + error.message); }
}
const pendingAsync = [];
function testAsync(name, fn) {
  pendingAsync.push(
    Promise.resolve().then(fn).then(
      () => { passed += 1; console.log('  ✓ ' + name); },
      (error) => { failed += 1; failures.push({ name, error }); console.log('  ✗ ' + name + '\n      ' + error.message); }
    )
  );
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

test('كل الأنواع الستة ممثّلة في البيانات', () => {
  const types = new Set(allQuestions.map((q) => q.type));
  ['mcq', 'tf', 'fill', 'match', 'order', 'open'].forEach((type) => assert(types.has(type), 'النوع مفقود: ' + type));
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
    } else if (q.type === 'open') {
      assert(Array.isArray(q.rubric) && q.rubric.length > 0, q.id + ': معايير تقييم ناقصة');
      q.rubric.forEach((point) => assert(point.text && point.text.length > 3, q.id + ': نقطة معيار ناقصة'));
    }
  });
});

test('التصحيح صحيح لكل نوع مُصحَّح آلياً عند الإجابة الصحيحة', () => {
  allQuestions.filter((q) => q.type !== 'open').forEach((q) => {
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
  allQuestions.filter((q) => q.type !== 'open').forEach((q) => {
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

test('السؤال المفتوح: يُحتسب answered بكتابة نص، ولا "correct" آلياً أبداً', () => {
  const openQuestions = allQuestions.filter((q) => q.type === 'open');
  assert(openQuestions.length > 0, 'لا توجد أسئلة مفتوحة لاختبارها');
  openQuestions.forEach((q) => {
    const withText = DLP.quiz.grade(q, 'إجابة تأملية مكتوبة من الدارس بأسلوبه الخاص');
    assert(withText.answered, q.id + ': نص غير فارغ يجب أن يُحتسب answered');
    assert(!withText.correct, q.id + ': السؤال المفتوح لا يجب أن يُصحَّح "صحيحاً" آلياً');

    const empty = DLP.quiz.grade(q, '   ');
    assert(!empty.answered, q.id + ': نص فارغ (مسافات فقط) يجب ألا يُحتسب answered');

    const none = DLP.quiz.grade(q, null);
    assert(!none.answered, q.id + ': بلا إجابة يجب ألا يُحتسب answered');
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

test('حساب النتيجة والنسبة المئوية صحيح (على الأسئلة القابلة للتصحيح الآلي)', () => {
  const quiz = DLP.store.getSubject('risk-management').quizzes[0];
  const gradable = quiz.questions.filter((q) => q.type !== 'open');
  const responses = {};
  gradable.forEach((q, i) => {
    if (i % 2 === 0) {
      if (q.type === 'mcq') { responses[q.id] = q.answer; }
      else if (q.type === 'tf') { responses[q.id] = q.answer; }
      else if (q.type === 'fill') { responses[q.id] = Array.isArray(q.answer) ? q.answer[0] : q.answer; }
      else if (q.type === 'match') { responses[q.id] = q.pairs.map((p) => p.right); }
      else if (q.type === 'order') { responses[q.id] = q.items.slice(); }
    }
  });
  const expectedCorrect = gradable.filter((q, i) => i % 2 === 0).length;
  const score = DLP.quiz.score(quiz.questions, responses);
  equal(score.total, gradable.length, 'الإجمالي القابل للتصحيح (بلا أسئلة مفتوحة في هذه المادة)');
  equal(score.correct, expectedCorrect, 'عدد الصحيح');
  equal(score.percent, Math.round((expectedCorrect / gradable.length) * 100), 'النسبة');
});

test('score() يستثني الأسئلة المفتوحة من النسبة لكنه يُحصيها ضمن answered', () => {
  const quiz = DLP.store.subjects().flatMap((s) => s.quizzes).find((q) => q.questions.some((x) => x.type === 'open'));
  assert(quiz, 'لا يوجد اختبار يحوي سؤالاً مفتوحاً');
  const openQuestion = quiz.questions.find((q) => q.type === 'open');
  const gradableCount = quiz.questions.filter((q) => q.type !== 'open').length;

  const withOpenAnswered = DLP.quiz.score(quiz.questions, { [openQuestion.id]: 'إجابة تأملية' });
  equal(withOpenAnswered.total, gradableCount, 'الإجمالي القابل للتصحيح يستثني المفتوح');
  equal(withOpenAnswered.correct, 0, 'لا شيء صحيحاً بعد لأن باقي الأسئلة بلا إجابة');
  equal(withOpenAnswered.answered, 1, 'answered يشمل السؤال المفتوح رغم استثنائه من النسبة');
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
  function walkJsFiles(dir, out) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walkJsFiles(full, out); }
      else if (entry.name.endsWith('.js')) { out.push(full); }
    });
    return out;
  }
  const files = walkJsFiles(path.join(ROOT, 'assets/js/components'), [])
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
  const realIds = ['ai-u4', 'ai-u5', 'ai-u6', 'lg-u3', 'lg-u4', 'lg-u5', 'lg-u6', 'ip-u3', 'ip-u4', 'ip-u5', 'ip-u6', 'cs-u3', 'cs-u4', 'cs-u5', 'cs-u6', 'rm-u3'];
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

test('لا يحتوي أي اسم ملف محارف تحكّم غير مرئية', () => {
  // محارف الاتجاه (U+200E/U+200F/U+2068/U+2069) تكسر الروابط والنشر على بيئات مختلفة
  const invisible = /[\u200B-\u200F\u2066-\u2069\uFEFF]/;
  const offenders = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.name === '.git' || entry.name === 'node_modules') { return; }
      if (invisible.test(entry.name)) { offenders.push(path.relative(ROOT, path.join(dir, entry.name))); }
      if (entry.isDirectory()) { walk(path.join(dir, entry.name)); }
    });
  })(ROOT);
  assert(!offenders.length, 'أسماء ملفات بمحارف غير مرئية: ' + offenders.join(' | '));
});

test('رابط أرشيف الكورس الأول يشير إلى ملف موجود', () => {
  const archive = DLP.config.about.archive;
  assert(Array.isArray(archive) && archive.length, 'الأرشيف فارغ');
  archive.forEach((item) => {
    const target = path.join(ROOT, decodeURIComponent(item.url));
    assert(fs.existsSync(target), 'ملف الأرشيف مفقود: ' + item.url);
  });
});

test('صورة الفريق موجودة فعلاً على القرص', () => {
  const photo = DLP.config.about.team.photo;
  assert(photo, 'لا توجد صورة معرّفة لعضو الفريق');
  assert(fs.existsSync(path.join(ROOT, photo)), 'ملف الصورة مفقود: ' + photo);
});

test('وسائل التواصل الحقيقية (هاتف/واتساب/بريد) تُنتج روابط آمنة صحيحة', () => {
  const channels = DLP.config.contact.channels;
  const byId = Object.fromEntries(channels.map((c) => [c.id, c]));
  equal(DLP.utils.safeUrl(byId.phone.hrefPrefix + byId.phone.value), 'tel:+9647706003138', 'رابط الهاتف');
  equal(DLP.utils.safeUrl(byId.whatsapp.hrefPrefix + byId.whatsapp.value), 'https://wa.me/9647706003138', 'رابط واتساب');
  equal(DLP.utils.safeUrl(byId.email.hrefPrefix + byId.email.value), 'mailto:huseny80@gmail.com', 'رابط البريد');
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

/* ------------------- طبقة Supabase (Stage 1: supabase.js/api.js/auth.js) ------------------- */
group('طبقة Supabase — الاتصال والتصفح بلا حساب');

/** يحمّل data/config/supabase.js + core/supabase.js + core/api.js + core/auth.js في sandbox
 * معزول تماماً عن باقي المنصة (لا علاقة بـ loadPlatform)، مع إمكانية حقن مكتبة عميل وهمية
 * أو تعطيلها، لاختبار سلوك الـ fallback بدقّة. */
function loadSupabaseLayer(options) {
  options = options || {};
  const sandbox = {
    console, location: { origin: 'https://example.test', hash: '', pathname: '/' },
    addEventListener() {}, document: null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (options.fakeClientLib) { sandbox.supabase = options.fakeClientLib; }
  vm.createContext(sandbox);
  const files = ['data/config/supabase.js', 'assets/js/core/supabase.js',
    'assets/js/core/api.js', 'assets/js/core/auth.js'];
  files.forEach((file) => {
    let code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (file === 'data/config/supabase.js' && options.configOverride) {
      code += `\nObject.assign(DLP.config.supabase, ${JSON.stringify(options.configOverride)});`;
    }
    vm.runInContext(code, sandbox, { filename: file });
  });
  return sandbox.DLP;
}

test('إعداد Supabase لا يحتوي مفتاح service_role مطلقاً', () => {
  const content = fs.readFileSync(path.join(ROOT, 'data/config/supabase.js'), 'utf8');
  assert(!/service_role/i.test(content), 'وُجد ذكر لـ service_role في ملف إعداد أمامي');
});

test('بلا مكتبة عميل محمَّلة: العميل null والموقع لا ينهار (fallback فوري)', () => {
  const DLP = loadSupabaseLayer({});
  equal(DLP.supabaseClient, null, 'يجب ألا يوجد عميل بلا مكتبة');
  equal(DLP.supabaseReady, false, 'supabaseReady يجب أن تكون false');
});

test('enabled:false يمنع إنشاء العميل حتى مع وجود مكتبة ومفاتيح صحيحة', () => {
  const DLP = loadSupabaseLayer({
    configOverride: { enabled: false },
    fakeClientLib: { createClient: () => ({ fake: true }) }
  });
  equal(DLP.supabaseClient, null, 'يجب ألا يوجد عميل عند enabled:false');
});

test('مفاتيح ناقصة (بلا url) تمنع إنشاء العميل بهدوء', () => {
  const DLP = loadSupabaseLayer({
    configOverride: { url: '' },
    fakeClientLib: { createClient: () => ({ fake: true }) }
  });
  equal(DLP.supabaseClient, null, 'يجب ألا يوجد عميل بلا url');
});

test('مكتبة عميل + مفاتيح صحيحة → عميل جاهز فعلاً', () => {
  let calledWith = null;
  const DLP = loadSupabaseLayer({
    // enabled معطَّل افتراضياً في data/config/supabase.js حالياً (فجوة question_pairs
    // الموثّقة) — هذا الاختبار يتحقق من مسار "التفعيل" نفسه بمعزل عن ذلك القرار.
    configOverride: { enabled: true },
    fakeClientLib: {
      createClient(url, key) { calledWith = [url, key]; return { fake: true }; }
    }
  });
  equal(DLP.supabaseReady, true, 'supabaseReady يجب أن تكون true');
  assert(DLP.supabaseClient && DLP.supabaseClient.fake, 'العميل المُعاد غير صحيح');
  assert(calledWith[0].indexOf('supabase.co') !== -1, 'لم يُمرَّر رابط المشروع الصحيح');
  assert(!/service_role/i.test(calledWith[1] || ''), 'مفتاح service_role مُرِّر للعميل!');
});

test('api.isReady() تعكس حالة العميل بدقّة (true/false)', () => {
  const withoutClient = loadSupabaseLayer({});
  equal(withoutClient.api.isReady(), false, 'isReady يجب أن تكون false بلا عميل');

  const withClient = loadSupabaseLayer({
    configOverride: { enabled: true },
    fakeClientLib: { createClient: () => ({ fake: true }) }
  });
  equal(withClient.api.isReady(), true, 'isReady يجب أن تكون true مع عميل');
});

testAsync('api.fetchAllContent() ترفض بهدوء بلا عميل (بلا استثناء متزامن يكسر الصفحة)', async () => {
  const DLP = loadSupabaseLayer({});
  let rejected = false;
  await DLP.api.fetchAllContent().catch(() => { rejected = true; });
  assert(rejected, 'كان يجب أن ترفض fetchAllContent بلا عميل');
});

testAsync('التصفح العام يبقى ممكناً بلا حساب: auth.getUser() تُعيد null دون رمي', async () => {
  const DLP = loadSupabaseLayer({});
  const user = await DLP.auth.getUser();
  equal(user, null, 'يجب أن يكون المستخدم null بلا اتصال/تسجيل دخول');
});

testAsync('auth.signInWithGoogle() ترفض برسالة واضحة حين لا يوجد اتصال', async () => {
  const DLP = loadSupabaseLayer({});
  let message = null;
  await DLP.auth.signInWithGoogle().catch((error) => { message = error.message; });
  assert(message && message.length > 0, 'يجب أن ترفض signInWithGoogle برسالة واضحة');
});

testAsync('auth.signOut() لا ترمي حتى بلا عميل (لا حساب لتسجيل خروج منه أصلاً)', async () => {
  const DLP = loadSupabaseLayer({});
  await DLP.auth.signOut();
  assert(true, 'اكتملت بلا استثناء');
});

test('التفعيل الفعلي (enabled) مُفعَّل بعد حل فجوتي question_pairs وselect(*) المقيَّد', () => {
  const configDLP = loadSupabaseLayer({});
  assert(configDLP.config.supabase.enabled === true,
    'enabled يجب أن يكون true بعد 007_safe_match_pairs_and_public_check.sql وإصلاح أعمدة api.js');
});

/* -------------------- api.js: محاكي استعلامات يحاكي قيود الأعمدة الفعلية في     */
/* PostgREST/RLS (002_rls.sql) — لضبط الأعمدة المطلوبة فعلياً في كل select() مقابل */
/* ما هو ممنوح حقاً لـ anon/authenticated، لا افتراض "select('*') سينجح دائماً".   */
/* هذا الاختبار هو الذي كشف أصلاً أن select('*') على questions/question_options/  */
/* question_items كان سيفشل بـ 42501 فعلياً لو اتصل بمشروع حي — راجع تفاصيل هذا   */
/* الاكتشاف في IMPLEMENTATION_REPORT.md. */

/** الأعمدة الممنوحة فعلياً (نسخة طبق الأصل من GRANT SELECT في 002_rls.sql) —
 * أي عمود آخر مطلوب في select() أو order() على هذه الجداول يجب أن يفشل هنا
 * تماماً كما يفشل على المشروع الحي فعلاً (نمط "42501 permission denied"). */
const GRANTED_COLUMNS = {
  questions: ['id', 'quiz_id', 'lecture_id', 'type', 'difficulty', 'prompt', 'kind', 'status', 'created_at'],
  question_options: ['id', 'question_id', 'position', 'label'],
  question_items: ['id', 'question_id', 'item_text'] // لا position هنا — الترتيب الصحيح محجوب
};

function fakeColumnCheckingClient(seedRows, rpcs) {
  const calls = { selects: [], orders: [], rpc: [] };

  function violation(table, colsCsv) {
    const allowed = GRANTED_COLUMNS[table];
    if (!allowed) { return null; } // جدول بلا قيود أعمدة معروفة في هذا المحاكي (قراءة عامة كاملة)
    const requested = colsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    const bad = requested.find((c) => c !== '*' && allowed.indexOf(c) === -1);
    if (requested.indexOf('*') !== -1) { return 'permission denied for table ' + table + ' (select *)'; }
    return bad ? ('permission denied for table ' + table + ' (column ' + bad + ')') : null;
  }

  function builder(table) {
    const filters = [];
    let orderCol = null;
    let selectCols = '*';
    const b = {
      select(cols) { selectCols = cols; calls.selects.push([table, cols]); return b; },
      eq(col, val) { filters.push([col, val]); return b; },
      in(col, vals) { filters.push([col, vals]); return b; },
      order(col) { orderCol = col; calls.orders.push([table, col]); return b; },
      then(onFulfilled, onRejected) {
        const err = violation(table, selectCols) || (orderCol ? violation(table, orderCol) : null);
        let result;
        if (err) {
          result = { data: null, error: new Error(err) };
        } else {
          let rows = (seedRows[table] || []).filter((row) =>
            filters.every(([col, val]) => (Array.isArray(val) ? val.indexOf(row[col]) !== -1 : row[col] === val)));
          if (selectCols !== '*') {
            const cols = selectCols.split(',').map((s) => s.trim());
            rows = rows.map((row) => { const out = {}; cols.forEach((c) => { out[c] = row[c]; }); return out; });
          }
          if (orderCol) { rows = rows.slice().sort((a, c) => (a[orderCol] > c[orderCol] ? 1 : -1)); }
          result = { data: rows, error: null };
        }
        return Promise.resolve(result).then(onFulfilled, onRejected);
      }
    };
    return b;
  }

  return {
    from: builder,
    rpc(name, params) {
      calls.rpc.push([name, params]);
      const handler = rpcs[name];
      return Promise.resolve({ data: handler ? handler(params) : null, error: null });
    },
    __calls: calls
  };
}

testAsync('fetchAllContent(): لا يطلب أي عمود غير ممنوح فعلياً (كان سيفشل 42501 على مشروع حي)', async () => {
  const seedRows = {
    subjects: [{ id: 's1', order: 1, title: 'مادة', short_title: 'م', icon: '📘', accent: '#000', status: 'published', description: '' }],
    lectures: [], summaries: [], assignments: [],
    quizzes: [{ id: 'quiz1', subject_id: 's1', title: 'اختبار', status: 'published', demo: false, description: '' }],
    references: [], resources: [], updates: [],
    questions: [
      { id: 'mcq1', quiz_id: 'quiz1', lecture_id: null, type: 'mcq', difficulty: 'easy', prompt: 'سؤال', kind: 'auto', status: 'published' },
      { id: 'order1', quiz_id: 'quiz1', lecture_id: null, type: 'order', difficulty: 'easy', prompt: 'رتّب', kind: 'auto', status: 'published' },
      { id: 'match1', quiz_id: 'quiz1', lecture_id: null, type: 'match', difficulty: 'easy', prompt: 'طابق', kind: 'auto', status: 'published' }
    ],
    question_options: [
      { id: 'o1', question_id: 'mcq1', position: 0, label: 'أ' },
      { id: 'o2', question_id: 'mcq1', position: 1, label: 'ب' }
    ],
    question_items: [
      { id: 'i1', question_id: 'order1', item_text: 'الأول' },
      { id: 'i2', question_id: 'order1', item_text: 'الثاني' }
    ]
  };
  const rpcs = {
    get_match_pairs: () => ({ left: ['يسار1', 'يسار2'], right: ['يمين2', 'يمين1'] })
  };
  const client = fakeColumnCheckingClient(seedRows, rpcs);
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });

  const result = await sbDLP.api.fetchAllContent();
  assert(result && result.data && result.data.s1, 'يجب أن ينجح fetchAllContent بالكامل بلا أي خطأ صلاحيات');
  const quiz = result.data.s1.quizzes[0];
  const mcq = quiz.questions.find((q) => q.id === 'mcq1');
  const order = quiz.questions.find((q) => q.id === 'order1');
  const match = quiz.questions.find((q) => q.id === 'match1');
  equal(mcq.options.join(','), 'أ,ب', 'خيارات mcq يجب أن تُبنى من question_options بلا رمي');
  assert(Array.isArray(order.items) && order.items.length === 2 && order.items.indexOf('الأول') !== -1,
    'عناصر order يجب أن تصل كاملة (بلا اعتماد على عمود position المحجوب)');
  equal(match.pairsLeft.join(','), 'يسار1,يسار2', 'pairsLeft تأتي من get_match_pairs لا من question_pairs مباشرة');
  equal(match.pairsRight.join(','), 'يمين2,يمين1', 'pairsRight تأتي من get_match_pairs كما هي');
  assert(match.pairs === undefined, 'لا يجوز أن يحمل سؤال match قادم من القاعدة شكل pairs المترابط القديم');
  equal(client.__calls.rpc.length, 1, 'get_match_pairs يُستدعى مرة واحدة فقط لسؤال المطابقة الوحيد');
});

testAsync('fetchAllContent(): يصل ملفات جدول files الفعلية للمحاضرات/الملخصات/الواجبات (لم تعد [] دائماً)', async () => {
  // إصلاح Phase B: mapLecture/mapSummary/mapAssignment كانت تُثبّت files:[] دائماً
  // بصرف النظر عن محتوى جدول files الفعلي — انظر SUPABASE_MIGRATION_AUDIT.md §1.5/§4.3.
  const seedRows = {
    subjects: [{ id: 's1', order: 1, title: 'مادة', short_title: 'م', icon: '📘', accent: '#000', status: 'published', description: '' }],
    lectures: [{ id: 'l1', subject_id: 's1', number: 1, title: 'محاضرة', date: '', status: 'published', demo: false, description: '', objectives: [] }],
    summaries: [{ id: 's-sum1', subject_id: 's1', lecture_id: 'l1', title: 'ملخص', date: '', status: 'published', demo: false, key_points: [], concepts: [], terms: [] }],
    assignments: [{ id: 'a1', subject_id: 's1', title: 'واجب', difficulty: 'easy', date: '', due: '', status: 'published', demo: false, description: '' }],
    quizzes: [], references: [], resources: [], updates: [],
    files: [
      { id: 'f1', subject_id: 's1', lecture_id: 'l1', summary_id: null, assignment_id: null, type: 'pdf', label: 'ملف المحاضرة', storage_path: null, public_url: 'files/s1/lecture-01.pdf', status: 'published' },
      { id: 'f2', subject_id: 's1', lecture_id: null, summary_id: 's-sum1', assignment_id: null, type: 'link', label: 'ملخص تفاعلي', storage_path: null, public_url: 'files/s1/summary-01.html', status: 'published' },
      { id: 'f3', subject_id: 's1', lecture_id: null, summary_id: null, assignment_id: 'a1', type: 'pdf', label: 'ملف الواجب', storage_path: null, public_url: 'files/s1/assignment-01.pdf', status: 'published' }
    ],
    questions: [], question_options: [], question_items: []
  };
  const client = fakeColumnCheckingClient(seedRows, {});
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });

  const result = await sbDLP.api.fetchAllContent();
  const subject = result.data.s1;
  equal(subject.lectures[0].files.length, 1, 'ملف المحاضرة يجب أن يصل عبر jointure files.lecture_id');
  equal(subject.lectures[0].files[0].url, 'files/s1/lecture-01.pdf', 'رابط الملف يجب أن يُبنى من public_url');
  equal(subject.summaries[0].files.length, 1, 'ملف الملخص يجب أن يصل عبر files.summary_id');
  equal(subject.assignments[0].files.length, 1, 'ملف الواجب يجب أن يصل عبر files.assignment_id');
});

testAsync('fetchAllContent(): يرتّب الأسئلة برقم تسلسلها من المعرّف بصرف النظر عن ترتيب إرجاع القاعدة', async () => {
  // اكتُشف فعلياً عبر CI حقيقي (شبكة متصلة بمشروع Supabase فعلي): questions لا
  // تحمل عمود ترتيب صريح، واستعلام بلا order() لا يضمن أي تسلسل معيَّن — أعاد
  // القاعدة الحية صفوفاً لا تطابق تسلسل data/subjects/*.js الأصلي فعلياً، مما
  // كسر تنقّل "التالي" (سؤال مطابقة/ترتيب لم يظهرا في مكانهما المتوقَّع). هذا
  // الاختبار يحاكي متعمَّداً استعلاماً يُعيد الصفوف بترتيب معكوس/عشوائي (q-10 قبل
  // q-2) للتأكد من أن api.js يُصحِّح الترتيب بنفسه اعتماداً على رقم المعرّف.
  const seedRows = {
    subjects: [{ id: 's1', order: 1, title: 'مادة', short_title: 'م', icon: '📘', accent: '#000', status: 'published', description: '' }],
    lectures: [], summaries: [], assignments: [],
    quizzes: [{ id: 'quiz1', subject_id: 's1', title: 'اختبار', status: 'published', demo: false, description: '' }],
    references: [], resources: [], updates: [],
    questions: ['q-10', 'q-2', 'q-1', 'q-9'].map((id) => (
      { id: id, quiz_id: 'quiz1', lecture_id: null, type: 'mcq', difficulty: 'easy', prompt: id, kind: 'auto', status: 'published' }
    )),
    question_options: [], question_items: []
  };
  const client = fakeColumnCheckingClient(seedRows, {});
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });
  const result = await sbDLP.api.fetchAllContent();
  const ids = result.data.s1.quizzes[0].questions.map((q) => q.id);
  equal(ids.join(','), 'q-1,q-2,q-9,q-10', 'يجب ترتيب الأسئلة رقمياً حسب معرّفها لا بترتيب إرجاع القاعدة الخام');
});

testAsync('fetchAllContent(): يفشل بوضوح لو طلب select(*) خطأً بدل الأعمدة الممنوحة (يثبت أن المحاكي يعمل)', async () => {
  const seedRows = {
    subjects: [{ id: 's1', order: 1, title: 'مادة', short_title: 'م', icon: '📘', accent: '#000', status: 'published', description: '' }],
    lectures: [], summaries: [], assignments: [],
    quizzes: [{ id: 'quiz1', subject_id: 's1', title: 'اختبار', status: 'published', demo: false, description: '' }],
    references: [], resources: [], updates: [],
    questions: [{ id: 'mcq1', quiz_id: 'quiz1', lecture_id: null, type: 'mcq', difficulty: 'easy', prompt: 'سؤال', kind: 'auto', status: 'published' }],
    question_options: [{ id: 'o1', question_id: 'mcq1', position: 0, label: 'أ' }],
    question_items: []
  };
  // محاكي بديل يطلب select('*') عمداً على question_options ليثبت أن fakeColumnCheckingClient
  // يرفضه فعلاً (ضمان أن الاختبار السابق كان سيكشف الخطأ الحقيقي لو ظل الكود القديم قائماً).
  const client = fakeColumnCheckingClient(seedRows, {});
  const realFrom = client.from;
  client.from = (table) => {
    const b = realFrom(table);
    if (table === 'question_options') {
      const realSelect = b.select;
      b.select = () => realSelect.call(b, '*');
    }
    return b;
  };
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });
  let rejected = false;
  await sbDLP.api.fetchAllContent().catch(() => { rejected = true; });
  assert(rejected, 'select(*) على جدول محجوب الأعمدة يجب أن يفشل — إن لم يفشل فالمحاكي لا يختبر شيئاً حقيقياً');
});

/* -------------------- api.js: طبقة الكتابة الإدارية (Phase D) -------------------- */
/* محاكي بسيط لعمليات insert/update/delete/select(count) — لا علاقة له بمحاكي   */
/* قيود الأعمدة أعلاه (fakeColumnCheckingClient) لأن جداول الكتابة هنا لا تحمل  */
/* قيوداً على الأعمدة، فقط على الصفوف (RLS)، وهذا خارج نطاق ما تختبره هذه       */
/* الطبقة أصلاً (الحماية الفعلية تُختبَر على القاعدة الحية لا هنا). */

function fakeAdminWriteClient(seedRows) {
  const calls = { insert: [], update: [], delete: [] };
  function builder(table) {
    if (!seedRows[table]) { seedRows[table] = []; }
    let pendingOp = null;
    const filters = [];
    let wantCount = false;
    let orderCol = null;
    const b = {
      insert(data) {
        pendingOp = { type: 'insert', rows: Array.isArray(data) ? data : [data] };
        calls.insert.push([table, pendingOp.rows]);
        return b;
      },
      update(patch) {
        pendingOp = { type: 'update', patch };
        calls.update.push([table, patch]);
        return b;
      },
      delete() {
        pendingOp = { type: 'delete' };
        calls.delete.push([table]);
        return b;
      },
      eq(col, val) { filters.push([col, val]); return b; },
      select(cols, opts) { if (opts && opts.count) { wantCount = true; } return b; },
      order(col) { orderCol = col; return b; },
      then(onFulfilled, onRejected) {
        const rows = seedRows[table];
        const matches = (row) => filters.every(([c, v]) => row[c] === v);
        let result;
        if (pendingOp && pendingOp.type === 'insert') {
          const inserted = pendingOp.rows.map((data, i) => {
            const row = Object.assign({ id: data.id || (table + '-gen-' + (rows.length + i + 1)) }, data);
            rows.push(row);
            return row;
          });
          result = { data: inserted, error: null };
        } else if (pendingOp && pendingOp.type === 'update') {
          const matched = rows.filter(matches);
          matched.forEach((row) => Object.assign(row, pendingOp.patch));
          result = { data: matched, error: null };
        } else if (pendingOp && pendingOp.type === 'delete') {
          const matched = rows.filter(matches);
          seedRows[table] = rows.filter((row) => matched.indexOf(row) === -1);
          result = { data: matched, error: null };
        } else {
          let matched = rows.filter(matches);
          if (orderCol) { matched = matched.slice().sort((a, c) => (a[orderCol] > c[orderCol] ? 1 : -1)); }
          result = wantCount ? { data: null, error: null, count: matched.length } : { data: matched, error: null };
        }
        return Promise.resolve(result).then(onFulfilled, onRejected);
      }
    };
    return b;
  }
  return { from: builder, __calls: calls };
}

testAsync('adminInsert()/adminUpdate()/adminDelete(): تعمل على جدول مسموح وتعيد الصفّ الفعلي', async () => {
  const seedRows = { subjects: [] };
  const client = fakeAdminWriteClient(seedRows);
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });

  const created = await sbDLP.api.adminInsert('subjects', { id: 's1', title: 'مادة جديدة', status: 'draft' });
  equal(created.id, 's1', 'الصفّ المُدرَج يجب أن يُعاد كما خُزِّن');
  equal(seedRows.subjects.length, 1, 'يجب أن يُخزَّن الصفّ فعلياً');

  const updated = await sbDLP.api.adminUpdate('subjects', 's1', { status: 'published' });
  equal(updated.status, 'published', 'التحديث يجب أن يُطبَّق ويُعاد في النتيجة');

  await sbDLP.api.adminDelete('subjects', 's1');
  equal(seedRows.subjects.length, 0, 'الحذف يجب أن يزيل الصفّ فعلياً');
});

testAsync('adminInsert(): يرفض جدولاً غير مسموح بالكتابة بلا أي استدعاء شبكة', async () => {
  const client = fakeAdminWriteClient({});
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });
  let threw = false;
  try { await sbDLP.api.adminInsert('quiz_attempts', { id: 'x' }); } catch (e) { threw = true; }
  assert(threw, 'جدول خارج ADMIN_WRITABLE_TABLES يجب أن يُرفَض محلياً فوراً');
  equal(client.__calls.insert.length, 0, 'لا يجوز أن يصل أي نداء فعلي للعميل لجدول مرفوض');
});

testAsync('adminSetStatus(): غلاف رقيق فوق adminUpdate لحقل status فقط', async () => {
  const seedRows = { updates: [{ id: 'u1', status: 'draft' }] };
  const client = fakeAdminWriteClient(seedRows);
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });
  const result = await sbDLP.api.adminSetStatus('updates', 'u1', 'archived');
  equal(result.status, 'archived', 'adminSetStatus يجب أن يُحدِّث status فقط');
});

testAsync('adminCountReferences(): يعيد عدد الصفوف المرتبطة بمعرّف عبر عمود fk — لا يحذف شيئاً', async () => {
  const seedRows = { lectures: [{ id: 'l1', subject_id: 's1' }, { id: 'l2', subject_id: 's1' }, { id: 'l3', subject_id: 's2' }] };
  const client = fakeAdminWriteClient(seedRows);
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });
  const count = await sbDLP.api.adminCountReferences('lectures', 'subject_id', 's1');
  equal(count, 2, 'يجب أن يعدّ فقط المحاضرات المرتبطة بالمادة s1');
  equal(seedRows.lectures.length, 3, 'العدّ يجب ألا يحذف أو يغيّر أي صفّ');
});

testAsync('adminList(): يجلب صفوف جدول مباشرة بفلاتر وترتيب، بمعزل عن DLP.data/hydrate', async () => {
  const seedRows = {
    lectures: [
      { id: 'l2', subject_id: 's1', number: 2 }, { id: 'l1', subject_id: 's1', number: 1 },
      { id: 'l9', subject_id: 's2', number: 1 }
    ]
  };
  const client = fakeAdminWriteClient(seedRows);
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });
  const rows = await sbDLP.api.adminList('lectures', { subject_id: 's1' }, 'id');
  equal(rows.length, 2, 'يجب أن يُصفَّى بحسب subject_id فقط');
  equal(rows.map((r) => r.id).join(','), 'l1,l2', 'يجب أن يُرتَّب حسب العمود المطلوب');
});

testAsync('adminReorder(): يكتب حقل order بترتيب المصفوفة المُمرَّرة (1-based)', async () => {
  const seedRows = { subjects: [{ id: 'a', order: 3 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }] };
  const client = fakeAdminWriteClient(seedRows);
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });
  await sbDLP.api.adminReorder('subjects', 'order', ['b', 'c', 'a']);
  const byId = {}; seedRows.subjects.forEach((r) => { byId[r.id] = r.order; });
  equal(byId.b, 1, 'b يجب أن تصبح الأولى'); equal(byId.c, 2, 'c الثانية'); equal(byId.a, 3, 'a الثالثة');
});

testAsync('adminReplaceQuestionChildren(): يحذف كل الصفوف القديمة لسؤال ثم يُدرج الجديدة فقط', async () => {
  const seedRows = {
    question_options: [
      { id: 'o1', question_id: 'q1', label: 'قديم1' },
      { id: 'o2', question_id: 'q1', label: 'قديم2' },
      { id: 'o3', question_id: 'q2', label: 'سؤال آخر — يجب ألا يُمَس' }
    ]
  };
  const client = fakeAdminWriteClient(seedRows);
  const sbDLP = loadSupabaseLayer({ configOverride: { enabled: true }, fakeClientLib: { createClient: () => client } });
  await sbDLP.api.adminReplaceQuestionChildren('question_options', 'q1', [
    { position: 0, label: 'جديد1' }, { position: 1, label: 'جديد2' }, { position: 2, label: 'جديد3' }
  ]);
  const forQ1 = seedRows.question_options.filter((r) => r.question_id === 'q1');
  const forQ2 = seedRows.question_options.filter((r) => r.question_id === 'q2');
  equal(forQ1.length, 3, 'يجب أن تحل 3 صفوف جديدة محل الصفّين القديمين لهذا السؤال تحديداً');
  assert(forQ1.every((r) => r.label.indexOf('جديد') === 0), 'كل الصفوف الجديدة يجب أن تحمل بيانات الاستبدال');
  equal(forQ2.length, 1, 'سؤال آخر غير معنيّ يجب ألا يتأثر إطلاقاً');
});

/* -------------------- store.hydrate() — الاستبدال الذرّي وسقوط fallback -------------------- */

/** يحمّل نسخة معزولة من core/store.js مع بيانات ثابتة لمادة واحدة فقط، ليمكن
 * حقن DLP.api وهمي والتحقّق من hydrate() بمعزل عن بقية اختبارات DLP المشتركة. */
function loadStoreLayer() {
  const sandbox = { console, addEventListener() {}, document: null, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ['data/config/site.js', 'data/subjects/index.js', 'data/subjects/ai-data.js',
    'assets/js/core/store.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  });
  return sandbox.DLP;
}

testAsync('hydrate() بلا DLP.api: تُعيد false وتُبقي البيانات الثابتة كما هي', async () => {
  const sbDLP = loadStoreLayer();
  const before = sbDLP.store.subjects().map((s) => s.id);
  const changed = await sbDLP.store.hydrate();
  equal(changed, false, 'يجب أن تُعيد hydrate() false بلا DLP.api');
  equal(sbDLP.store.dataSource(), 'static', 'dataSource يجب أن تبقى static');
  equal(sbDLP.store.subjects().map((s) => s.id).join(','), before.join(','), 'البيانات تغيّرت رغم غياب api!');
});

testAsync('hydrate() تستبدل البيانات ذرّياً عند نجاح api.fetchAllContent()', async () => {
  const sbDLP = loadStoreLayer();
  const fakeSubject = { id: 'fake-subject', order: 1, title: 'مادة وهمية', status: 'published',
    lectures: [], summaries: [], assignments: [], quizzes: [], references: [], resources: [], updates: [] };
  sbDLP.api = {
    isReady: () => true,
    fetchAllContent: () => Promise.resolve({ data: { 'fake-subject': fakeSubject }, order: ['fake-subject'] })
  };
  const changed = await sbDLP.store.hydrate();
  equal(changed, true, 'يجب أن تُعيد hydrate() true عند النجاح');
  equal(sbDLP.store.dataSource(), 'database', 'dataSource يجب أن تصبح database');
  const ids = sbDLP.store.subjects().map((s) => s.id);
  equal(ids.length, 1, 'عدد المواد بعد الاستبدال');
  equal(ids[0], 'fake-subject', 'المادة المُستبدَلة غير متوقعة');
});

testAsync('hydrate() تسقط بهدوء على البيانات الثابتة عند رفض fetchAllContent()', async () => {
  const sbDLP = loadStoreLayer();
  const before = sbDLP.store.subjects().map((s) => s.id);
  sbDLP.api = { isReady: () => true, fetchAllContent: () => Promise.reject(new Error('انقطاع شبكة')) };
  const changed = await sbDLP.store.hydrate();
  equal(changed, false, 'يجب أن تُعيد hydrate() false عند الرفض');
  equal(sbDLP.store.dataSource(), 'static', 'dataSource يجب أن تبقى static عند الفشل');
  equal(sbDLP.store.subjects().map((s) => s.id).join(','), before.join(','), 'البيانات تغيّرت رغم فشل الجلب!');
});

testAsync('hydrate() لا تُعلّق الموقع أبداً: اتصال عالق بلا استجابة يسقط بهدوء بعد مهلة محدودة', async () => {
  const sbDLP = loadStoreLayer();
  const before = sbDLP.store.subjects().map((s) => s.id);
  // وعد لا يُحسم أبداً — يحاكي اتصالاً عالقاً (لا خطأ فوري، ولا نجاح) لا تعثّراً بسيطاً
  sbDLP.api = { isReady: () => true, fetchAllContent: () => new Promise(() => {}) };
  const started = Date.now();
  const changed = await sbDLP.store.hydrate();
  const elapsedMs = Date.now() - started;
  equal(changed, false, 'يجب أن تسقط بهدوء على البيانات الثابتة بدل الانتظار للأبد');
  assert(elapsedMs < 10000, 'يجب أن تُحسم خلال مهلة محدودة لا أن تُعلّق تحميل الصفحة (استغرقت ' + elapsedMs + 'ms)');
  equal(sbDLP.store.subjects().map((s) => s.id).join(','), before.join(','), 'البيانات تغيّرت رغم عدم اكتمال الاتصال!');
});

testAsync('hydrate() تسقط بهدوء إن أعادت fetchAllContent() شكلاً ناقصاً', async () => {
  const sbDLP = loadStoreLayer();
  const before = sbDLP.store.subjects().map((s) => s.id);
  sbDLP.api = { isReady: () => true, fetchAllContent: () => Promise.resolve({}) };
  const changed = await sbDLP.store.hydrate();
  equal(changed, false, 'يجب أن تُعيد hydrate() false لشكل ناقص');
  equal(sbDLP.store.subjects().map((s) => s.id).join(','), before.join(','), 'البيانات تغيّرت رغم شكل ناقص!');
});

/* -------------------- quiz-view.js — الحفظ الدائم عبر RPC (Stage 2) -------------------- */
group('quiz-view — الحفظ الدائم لمستخدم مسجَّل (بلا تغيير في التصحيح المحلي)');

/** يحمّل نسخة معزولة من quiz-view.js في sandbox، مع DLP.auth/DLP.api وهميّين
 * يُحقنان قبل تنفيذ الملف (كما يحدث فعلياً عند تحميل السكربتات بترتيبها في
 * index.html). لا DOM هنا؛ الاختبارات تقتصر على منطق الحفظ (__test) الذي لا
 * يلمس document إطلاقاً — رسم الواجهة وربط الأحداث مغطّيان بالفعل بـ tests/e2e.js. */
/** i18n وهمي بسيط: يعيد نص القيمة الافتراضية بمفاتيح ثابتة معروفة لتسهيل التوقّع
 * في الاختبارات، دون تحميل data/config/strings.js الحقيقي (غير ضروري هنا). */
const FAKE_I18N_STRINGS = {
  'quiz.true': 'صح', 'quiz.false': 'خطأ', 'quiz.signInToReveal': 'سجّل الدخول لرؤية الإجابة',
  'quiz.checking': 'جارٍ التحقق...'
};
function fakeI18n() { return { t: (key) => (key in FAKE_I18N_STRINGS ? FAKE_I18N_STRINGS[key] : key) }; }
function fakeUtils() {
  return {
    escapeHtml: (v) => String(v == null ? '' : v),
    normalizeArabic: (v) => String(v == null ? '' : v).trim().toLowerCase()
  };
}

function fakeLocalStorage(initial) {
  const store = Object.assign({}, initial || {});
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
}

function loadQuizViewLayer(options) {
  options = options || {};
  const sandbox = { console, addEventListener() {}, document: null };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.localStorage = options.fakeLocalStorage || fakeLocalStorage();
  sandbox.DLP = {
    auth: options.fakeAuth, api: options.fakeApi,
    store: options.fakeStore, quiz: options.fakeQuiz,
    i18n: options.fakeI18n || fakeI18n(), utils: options.fakeUtils || fakeUtils()
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/components/quiz-view.js'), 'utf8'),
    sandbox, { filename: 'assets/js/components/quiz-view.js' });
  return sandbox.DLP;
}

function fakeAuthWithUser(user) {
  return { onChange: (cb) => { cb(user); return () => {}; } };
}
function fakeAuthNoUser() {
  return { onChange: (cb) => { cb(null); return () => {}; } };
}

test('canPersist(): false بلا مستخدم مسجَّل حتى مع عميل جاهز', () => {
  const sbDLP = loadQuizViewLayer({ fakeAuth: fakeAuthNoUser(), fakeApi: { isReady: () => true } });
  equal(sbDLP.quizView.__test.canPersist(), false, 'لا يجوز الحفظ بلا مستخدم');
});

test('canPersist(): false مع مستخدم مسجَّل لكن بلا اتصال جاهز (isReady=false)', () => {
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthWithUser({ id: 'u1' }), fakeApi: { isReady: () => false }
  });
  equal(sbDLP.quizView.__test.canPersist(), false, 'لا يجوز الحفظ بلا اتصال جاهز');
});

test('canPersist(): true مع مستخدم مسجَّل واتصال جاهز معاً', () => {
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthWithUser({ id: 'u1' }), fakeApi: { isReady: () => true }
  });
  equal(sbDLP.quizView.__test.canPersist(), true, 'يجب السماح بالحفظ');
});

test('canPersist(): false بلا DLP.auth أصلاً (لا يرمي عند التحميل)', () => {
  const sbDLP = loadQuizViewLayer({ fakeApi: { isReady: () => true } });
  equal(sbDLP.quizView.__test.canPersist(), false, 'DLP.auth غائب يجب أن يعني عدم السماح لا رمي استثناء');
});

test('toServerResponse(): يحوّل كل نوع سؤال للشكل الذي يتوقعه save_quiz_answer', () => {
  const sbDLP = loadQuizViewLayer({});
  const toServer = sbDLP.quizView.__test.toServerResponse;
  equal(toServer({ type: 'mcq' }, '2'), 2, 'mcq يجب أن يصبح رقماً');
  equal(toServer({ type: 'tf' }, 'true'), true, 'tf نص "true" يجب أن يصبح boolean');
  equal(toServer({ type: 'tf' }, 'false'), false, 'tf نص "false" يجب أن يصبح boolean');
  equal(toServer({ type: 'fill' }, '  إجابة  '), '  إجابة  ', 'fill يبقى نصاً كما هو (التنظيف من مسؤولية الخادم)');
  equal(toServer({ type: 'open' }, 'نص حر'), 'نص حر', 'open يبقى نصاً');
  const orderResult = toServer({ type: 'order' }, ['ب', 'أ']);
  assert(Array.isArray(orderResult) && orderResult.join(',') === 'ب,أ', 'order يجب أن يبقى مصفوفة بنفس الترتيب');
  const matchResult = toServer({ type: 'match' }, ['س1', 'س2']);
  assert(Array.isArray(matchResult) && matchResult.join(',') === 'س1,س2', 'match يجب أن يبقى مصفوفة بنفس القيم');
  const badArray = toServer({ type: 'order' }, null);
  assert(Array.isArray(badArray) && badArray.length === 0, 'order بلا استجابة يجب أن يعيد مصفوفة فارغة لا يرمي');
});

testAsync('persistAnswer(): بلا مستخدم مسجَّل لا تستدعي أي RPC إطلاقاً', async () => {
  let called = false;
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthNoUser(),
    fakeApi: { isReady: () => true, startQuizAttempt: () => { called = true; return Promise.resolve('a1'); } }
  });
  const ok = await sbDLP.quizView.__test.persistAnswer({ id: 'q1' }, { id: 'ai-q1-1', type: 'mcq' }, 1);
  equal(ok, false, 'يجب أن تُعيد false بلا مستخدم');
  equal(called, false, 'لا يجوز استدعاء startQuizAttempt بلا مستخدم مسجَّل');
});

testAsync('persistAnswer(): مستخدم مسجَّل → تبدأ محاولة ثم تحفظ الإجابة بالترتيب الصحيح', async () => {
  const calls = [];
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthWithUser({ id: 'u1' }),
    fakeApi: {
      isReady: () => true,
      startQuizAttempt: (quizId) => { calls.push(['start', quizId]); return Promise.resolve('attempt-1'); },
      saveQuizAnswer: (attemptId, questionId, response) => {
        calls.push(['save', attemptId, questionId, response]); return Promise.resolve(true);
      }
    }
  });
  const ok = await sbDLP.quizView.__test.persistAnswer({ id: 'ai-q1' }, { id: 'ai-q1-1', type: 'mcq' }, 1);
  equal(ok, true, 'يجب أن تنجح persistAnswer');
  equal(calls.length, 2, 'يجب استدعاء start ثم save فقط');
  equal(calls[0].join(','), 'start,ai-q1', 'أول نداء يجب أن يكون بدء المحاولة');
  equal(calls[1].join(','), 'save,attempt-1,ai-q1-1,1', 'ثاني نداء يجب أن يحفظ الإجابة على المحاولة الصحيحة');
});

testAsync('persistAnswer(): محاولتان لسؤالين من نفس الاختبار تستخدمان نفس attemptId (بدء واحد فقط)', async () => {
  let startCount = 0;
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthWithUser({ id: 'u1' }),
    fakeApi: {
      isReady: () => true,
      startQuizAttempt: () => { startCount += 1; return Promise.resolve('attempt-1'); },
      saveQuizAnswer: () => Promise.resolve(true)
    }
  });
  const quiz = { id: 'ai-q1' };
  await sbDLP.quizView.__test.persistAnswer(quiz, { id: 'ai-q1-1', type: 'mcq' }, 1);
  await sbDLP.quizView.__test.persistAnswer(quiz, { id: 'ai-q1-2', type: 'tf' }, 'true');
  equal(startCount, 1, 'يجب بدء محاولة واحدة فقط للاختبار الواحد بغضّ النظر عن عدد الأسئلة المُجابة');
});

testAsync('persistAnswer(): فشل الشبكة يُتجاهل بهدوء ولا يرمي استثناء', async () => {
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthWithUser({ id: 'u1' }),
    fakeApi: {
      isReady: () => true,
      startQuizAttempt: () => Promise.resolve('attempt-1'),
      saveQuizAnswer: () => Promise.reject(new Error('انقطاع شبكة'))
    }
  });
  const ok = await sbDLP.quizView.__test.persistAnswer({ id: 'ai-q1' }, { id: 'ai-q1-1', type: 'mcq' }, 1);
  equal(ok, false, 'يجب أن تُعيد false بهدوء عند فشل الشبكة، لا أن ترمي');
});

testAsync('persistFinish(): تستدعي finish_quiz_attempt على نفس محاولة الأسئلة المحفوظة', async () => {
  const calls = [];
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthWithUser({ id: 'u1' }),
    fakeApi: {
      isReady: () => true,
      startQuizAttempt: () => Promise.resolve('attempt-1'),
      saveQuizAnswer: () => Promise.resolve(true),
      finishQuizAttempt: (attemptId) => { calls.push(attemptId); return Promise.resolve({ score_percent: 100 }); }
    }
  });
  const quiz = { id: 'ai-q1' };
  await sbDLP.quizView.__test.persistAnswer(quiz, { id: 'ai-q1-1', type: 'mcq' }, 1);
  const ok = await sbDLP.quizView.__test.persistFinish(quiz);
  equal(ok, true, 'يجب أن تنجح persistFinish');
  equal(calls.join(','), 'attempt-1', 'يجب استدعاء finish على المحاولة نفسها التي حُفظت عليها الإجابات');
});

testAsync('persistFinish(): بلا أي محاولة بدأت أصلاً (لم يُجب المستخدم على شيء) لا تستدعي أي RPC', async () => {
  let called = false;
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthWithUser({ id: 'u1' }),
    fakeApi: {
      isReady: () => true,
      finishQuizAttempt: () => { called = true; return Promise.resolve({}); }
    }
  });
  const ok = await sbDLP.quizView.__test.persistFinish({ id: 'ai-q1' });
  equal(ok, false, 'يجب أن تُعيد false بلا محاولة قائمة');
  equal(called, false, 'لا يجوز استدعاء finish_quiz_attempt بلا محاولة بدأت أصلاً');
});

testAsync('discardAttempt(): يسمح ببدء محاولة خادمية جديدة بعد إعادة المحاولة (retry/clear)', async () => {
  let startCount = 0;
  const sbDLP = loadQuizViewLayer({
    fakeAuth: fakeAuthWithUser({ id: 'u1' }),
    fakeApi: {
      isReady: () => true,
      startQuizAttempt: () => { startCount += 1; return Promise.resolve('attempt-' + startCount); },
      saveQuizAnswer: () => Promise.resolve(true)
    }
  });
  const quiz = { id: 'ai-q1' };
  await sbDLP.quizView.__test.persistAnswer(quiz, { id: 'ai-q1-1', type: 'mcq' }, 1);
  sbDLP.quizView.__test.discardAttempt(quiz.id);
  await sbDLP.quizView.__test.persistAnswer(quiz, { id: 'ai-q1-1', type: 'mcq' }, 0);
  equal(startCount, 2, 'يجب بدء محاولة خادمية جديدة تماماً بعد discardAttempt (retry/clear)');
});

/* -------------------- quiz-view.js — تصحيح عن بُعد للمحتوى القادم من القاعدة -------------------- */
group('quiz-view — تصحيح عن بُعد (remoteMode) عبر check_answer/save_quiz_answer/reveal_question_answer');

function fakeStoreDatabase() { return { dataSource: () => 'database' }; }
function fakeStoreStatic() { return { dataSource: () => 'static' }; }

/** جذر DOM وهمي كافٍ لتنفيذ refresh() (تحديث progress/body/foot/result) بلا رمي —
 * لا نحتاج تحقّق محتوى HTML هنا، فقط ألا ينهار الاستدعاء الداخلي لـ checkRemote(). */
function fakeQuizRoot() {
  const node = () => ({ innerHTML: '', textContent: '' });
  return { querySelector: () => node(), querySelectorAll: () => [] };
}

test('remoteMode(): false حين dataSource ثابتة (static) — السلوك الافتراضي اليوم', () => {
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreStatic() });
  equal(sbDLP.quizView.__test.remoteMode(), false, 'يجب أن تبقى false في الوضع الثابت');
});

test('remoteMode(): true حين dataSource=database (بعد hydrate ناجحة)', () => {
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  equal(sbDLP.quizView.__test.remoteMode(), true, 'يجب أن تصبح true بعد نجاح hydrate()');
});

test('remoteMode(): false بلا DLP.store أصلاً (لا يرمي)', () => {
  const sbDLP = loadQuizViewLayer({});
  equal(sbDLP.quizView.__test.remoteMode(), false, 'غياب DLP.store يجب أن يعني static لا رمي استثناء');
});

testAsync('checkRemote(): مستخدم مسجَّل → save_quiz_answer ثم reveal_question_answer، ويُخزَّن كلاهما', async () => {
  const calls = [];
  const sbDLP = loadQuizViewLayer({
    fakeStore: fakeStoreDatabase(),
    fakeAuth: fakeAuthWithUser({ id: 'u1' }),
    fakeApi: {
      isReady: () => true,
      startQuizAttempt: () => { calls.push('start'); return Promise.resolve('attempt-1'); },
      saveQuizAnswer: (attemptId, questionId, response) => {
        calls.push(['save', attemptId, questionId, response]); return Promise.resolve(true);
      },
      revealQuestionAnswer: (questionId) => {
        calls.push(['reveal', questionId]); return Promise.resolve({ answer: 1, explanation: 'شرح' });
      }
    }
  });
  const question = { id: 'ai-q1-1', type: 'mcq', options: ['أ', 'ب'] };
  const quiz = { id: 'ai-q1', questions: [question] };
  const state = sbDLP.quizView.__test.createState(quiz);
  state.responses[question.id] = 1;
  await sbDLP.quizView.__test.checkRemote(quiz, question, state, fakeQuizRoot());
  equal(state.checked[question.id], true, 'يجب أن يصبح السؤال محسوماً بعد نجاح RPC');
  equal(state.remote[question.id].pending, false, 'يجب ألا يبقى معلَّقاً');
  equal(state.remote[question.id].correct, true, 'يجب أن يعكس القيمة المُعادة من save_quiz_answer');
  assert(state.remote[question.id].revealed && state.remote[question.id].revealed.explanation === 'شرح',
    'يجب تخزين نتيجة reveal_question_answer لمستخدم مسجَّل');
  equal(calls.map((c) => (Array.isArray(c) ? c[0] : c)).join(','), 'start,save,reveal',
    'يجب استدعاء start ثم save ثم reveal بالترتيب لمستخدم مسجَّل');
});

testAsync('checkRemote(): زائر غير مسجَّل → check_answer فقط (بلا حفظ، بلا reveal)', async () => {
  const calls = [];
  const sbDLP = loadQuizViewLayer({
    fakeStore: fakeStoreDatabase(),
    fakeAuth: fakeAuthNoUser(),
    fakeApi: {
      isReady: () => true,
      checkAnswer: (questionId, response) => { calls.push(['check', questionId, response]); return Promise.resolve(false); },
      saveQuizAnswer: () => { calls.push('save'); return Promise.resolve(true); },
      revealQuestionAnswer: () => { calls.push('reveal'); return Promise.resolve({}); }
    }
  });
  const question = { id: 'ai-q1-1', type: 'mcq', options: ['أ', 'ب'] };
  const quiz = { id: 'ai-q1', questions: [question] };
  const state = sbDLP.quizView.__test.createState(quiz);
  state.responses[question.id] = 0;
  await sbDLP.quizView.__test.checkRemote(quiz, question, state, fakeQuizRoot());
  equal(state.checked[question.id], true, 'يجب أن يُحسم السؤال حتى بلا تسجيل دخول');
  equal(state.remote[question.id].correct, false, 'يجب أن يعكس نتيجة check_answer');
  equal(state.remote[question.id].revealed, undefined, 'لا يجوز كشف الإجابة الكاملة لزائر غير مسجَّل');
  equal(calls.join(','), 'check,ai-q1-1,0', 'يجب استدعاء check_answer فقط لا save_quiz_answer ولا reveal');
});

testAsync('checkRemote(): سؤال مفتوح (open) لا يستدعي check_answer/save_quiz_answer إطلاقاً', async () => {
  let checkCalled = false;
  const sbDLP = loadQuizViewLayer({
    fakeStore: fakeStoreDatabase(),
    fakeAuth: fakeAuthNoUser(),
    fakeApi: { isReady: () => true, checkAnswer: () => { checkCalled = true; return Promise.resolve(true); } }
  });
  const question = { id: 'ai-q1-9', type: 'open' };
  const quiz = { id: 'ai-q1', questions: [question] };
  const state = sbDLP.quizView.__test.createState(quiz);
  await sbDLP.quizView.__test.checkRemote(quiz, question, state, fakeQuizRoot());
  equal(checkCalled, false, 'لا تصحيح آلي لسؤال مفتوح — لا يجوز استدعاء check_answer');
  equal(state.checked[question.id], true, 'يجب أن يُحسم (يُكشف) رغم عدم وجود تصحيح آلي');
});

testAsync('checkRemote(): فشل شبكة يُبقي السؤال قابلاً لإعادة المحاولة (لا يعلق للأبد)', async () => {
  const sbDLP = loadQuizViewLayer({
    fakeStore: fakeStoreDatabase(),
    fakeAuth: fakeAuthNoUser(),
    fakeApi: { isReady: () => true, checkAnswer: () => Promise.reject(new Error('انقطاع شبكة')) }
  });
  const question = { id: 'ai-q1-1', type: 'mcq', options: ['أ', 'ب'] };
  const quiz = { id: 'ai-q1', questions: [question] };
  const state = sbDLP.quizView.__test.createState(quiz);
  await sbDLP.quizView.__test.checkRemote(quiz, question, state, fakeQuizRoot());
  equal(state.checked[question.id], undefined, 'لا يجوز اعتباره محسوماً عند فشل الشبكة');
  equal(state.remote[question.id], undefined, 'يجب حذف حالة "معلّق" بعد الفشل حتى يمكن إعادة المحاولة');
});

test('gradedFor(): تُعيد null أثناء الانتظار (pending) في الوضع القادم من القاعدة', () => {
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  const state = sbDLP.quizView.__test.createState({ id: 'q1', questions: [] });
  const question = { id: 'q1-1', type: 'mcq' };
  state.remote[question.id] = { pending: true };
  equal(sbDLP.quizView.__test.gradedFor(state, question), null, 'يجب أن تكون null أثناء الانتظار');
});

test('gradedFor(): تعتمد على DLP.quiz.grade في الوضع الثابت بلا أي تغيير', () => {
  let gradeCalledWith = null;
  const sbDLP = loadQuizViewLayer({
    fakeStore: fakeStoreStatic(),
    fakeQuiz: { grade: (q, r) => { gradeCalledWith = [q.id, r]; return { correct: true, correctAnswer: 'س' }; } }
  });
  const state = sbDLP.quizView.__test.createState({ id: 'q1', questions: [] });
  const question = { id: 'q1-1', type: 'mcq' };
  state.checked[question.id] = true;
  state.responses[question.id] = 1;
  const graded = sbDLP.quizView.__test.gradedFor(state, question);
  equal(graded.correct, true, 'يجب أن تُعيد نتيجة DLP.quiz.grade كما هي في الوضع الثابت');
  equal(gradeCalledWith.join(','), 'q1-1,1', 'يجب استدعاء grade بالسؤال والإجابة الصحيحين');
});

test('correctAnswerFromRevealed(): نص "سجّل الدخول" حين لا توجد بيانات مكشوفة (زائر غير مسجَّل)', () => {
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  const text = sbDLP.quizView.__test.correctAnswerFromRevealed({ type: 'mcq' }, null);
  equal(text, 'سجّل الدخول لرؤية الإجابة', 'يجب استخدام نص i18n المخصَّص، لا كشف فارغ مضلِّل');
});

test('correctAnswerFromRevealed(): mcq تبني النص من الخيار is_correct:true فقط', () => {
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  const revealed = { options: [{ position: 0, label: 'أ', is_correct: false }, { position: 1, label: 'ب', is_correct: true }] };
  equal(sbDLP.quizView.__test.correctAnswerFromRevealed({ type: 'mcq' }, revealed), 'ب');
});

test('correctAnswerFromRevealed(): match تبني كل الأزواج الصحيحة من pairs المكشوفة', () => {
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  const revealed = { pairs: [{ left: 'أ', right: '1' }, { left: 'ب', right: '2' }] };
  equal(sbDLP.quizView.__test.correctAnswerFromRevealed({ type: 'match' }, revealed), 'أ ← 1 | ب ← 2');
});

test('correctAnswerFromRevealed(): order تبني الترتيب الصحيح من items المكشوفة', () => {
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  const revealed = { items: ['الأول', 'الثاني'] };
  equal(sbDLP.quizView.__test.correctAnswerFromRevealed({ type: 'order' }, revealed), 'الأول ← الثاني');
});

test('remoteScore(): answered/gradableAnswered تعكسان مجرد اختيار إجابة، correct فقط من الخادم', () => {
  // اكتُشف عبر CI حقيقي: شريط التقدّم لم يكن يتحرك عند اختيار إجابة قبل الضغط
  // على "تحقق" لأن answered كانت تعتمد على state.remote (لا يُملأ إلا بعد RPC).
  // يجب أن تتحرك answered فور الاختيار تماماً كما في الوضع الثابت — correct فقط
  // ينتظر تصحيحاً خادمياً فعلياً.
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  const quiz = {
    id: 'q1',
    questions: [
      { id: 'q1-1', type: 'mcq' }, { id: 'q1-2', type: 'mcq' },
      { id: 'q1-3', type: 'mcq' }, { id: 'q1-4', type: 'open' }
    ]
  };
  const state = sbDLP.quizView.__test.createState(quiz);
  state.responses['q1-1'] = 1; // اختيار بلا "تحقق" بعد — يجب أن يُحتسب answered فوراً
  state.responses['q1-2'] = 0;
  state.responses['q1-3'] = 1;
  state.responses['q1-4'] = 'نص حر';
  state.remote['q1-1'] = { pending: false, correct: true };  // تحقّق خادمي بالفعل: صحيحة
  state.remote['q1-2'] = { pending: false, correct: false }; // تحقّق خادمي بالفعل: خاطئة
  // q1-3: اختيرت لكن لم يُضغط "تحقق" بعد — لا يوجد state.remote لها إطلاقاً
  const score = sbDLP.quizView.__test.remoteScore(state);
  equal(score.total, 3, 'gradable يجب أن يستثني السؤال المفتوح');
  equal(score.gradableAnswered, 3, 'الأسئلة الثلاثة القابلة للتصحيح جميعها أُجيبت (بصرف النظر عن التحقّق)');
  equal(score.correct, 1, 'إجابة صحيحة واحدة فقط مؤكَّدة خادمياً (q1-3 لم تُصحَّح بعد فلا تُحتسب)');
  equal(score.answered, 4, 'answered تشمل كل الأسئلة الأربعة (فتح حر بجواب نصي غير فارغ أيضاً)');
});

test('hasResponse(): تطابق منطق "answered" في core/quiz.js لكل نوع، بمعزل عن معرفة الإجابة الصحيحة', () => {
  const sbDLP = loadQuizViewLayer({});
  const hasResponse = sbDLP.quizView.__test.hasResponse;
  equal(hasResponse({ type: 'mcq' }, 0), true, 'mcq بقيمة 0 (أول خيار) يجب أن تُحتسب مُجابة');
  equal(hasResponse({ type: 'mcq' }, undefined), false, 'بلا اختيار يجب ألا تُحتسب');
  equal(hasResponse({ type: 'fill' }, '   '), false, 'نص فراغ فقط لا يُحتسب إجابة');
  equal(hasResponse({ type: 'fill' }, 'جواب'), true);
  equal(hasResponse({ type: 'order', items: ['أ', 'ب', 'ج'] }, ['أ', 'ب']), false, 'ترتيب ناقص لا يُحتسب مكتملاً');
  equal(hasResponse({ type: 'order', items: ['أ', 'ب', 'ج'] }, ['أ', 'ب', 'ج']), true);
  equal(hasResponse({ type: 'match', pairsLeft: ['أ', 'ب'] }, ['1', '']), false, 'صف فارغ في المطابقة يعني عدم الاكتمال');
  equal(hasResponse({ type: 'match', pairsLeft: ['أ', 'ب'] }, ['1', '2']), true);
});

test('load()/getState(): لا تُستعاد "checked" في الوضع القادم من القاعدة — كانت تُسبِّب انهيار الرسم فعلياً', () => {
  // اكتُشف عبر CI حقيقي: بعد إعادة تحميل الصفحة (أو عند التنقّل لصفحة اختبار
  // سبق فتحها)، "checked" تُستعاد من localStorage بينما state.remote (نتيجة
  // التصحيح الخادمية المرتبطة بها) غير مُخزَّنة إطلاقاً — فتحاول gradedFor()
  // قراءة correct من نتيجة غير موجودة وتنهار كل عملية الرسم (لا تظهر أي عناصر
  // إطلاقاً بعدها، ما فسَّر فشل اختبارات لا صلة مباشرة لها بهذا السؤال تحديداً).
  const quiz = { id: 'rq1', questions: [{ id: 'rq1-1', type: 'mcq', options: ['أ', 'ب'] }] };
  const saved = JSON.stringify({
    v: 1, difficulty: 'all', lecture: 'all', index: 0,
    responses: { 'rq1-1': 1 }, checked: { 'rq1-1': true }, finished: false
  });
  const sbDLP = loadQuizViewLayer({
    fakeStore: fakeStoreDatabase(),
    fakeQuiz: { filterByDifficulty: (qs) => qs, filterByLecture: (qs) => qs },
    fakeLocalStorage: fakeLocalStorage({ 'dlp.quiz.rq1': saved })
  });
  const state = sbDLP.quizView.__test.getState(quiz);
  equal(state.responses['rq1-1'], 1, 'يجب استعادة الإجابة المُختارة كما هي');
  equal(state.checked['rq1-1'], undefined, 'checked يجب ألا تُستعاد في الوضع القادم من القاعدة');
});

test('load()/getState(): تستعيد checked كالمعتاد في الوضع الثابت (بلا أي تغيير سلوك)', () => {
  const quiz = { id: 'sq1', questions: [{ id: 'sq1-1', type: 'mcq', options: ['أ', 'ب'] }] };
  const saved = JSON.stringify({
    v: 1, difficulty: 'all', lecture: 'all', index: 0,
    responses: { 'sq1-1': 0 }, checked: { 'sq1-1': true }, finished: false
  });
  const sbDLP = loadQuizViewLayer({
    fakeStore: fakeStoreStatic(),
    fakeQuiz: { filterByDifficulty: (qs) => qs, filterByLecture: (qs) => qs },
    fakeLocalStorage: fakeLocalStorage({ 'dlp.quiz.sq1': saved })
  });
  const state = sbDLP.quizView.__test.getState(quiz);
  equal(state.checked['sq1-1'], true, 'checked يجب أن تُستعاد في الوضع الثابت كما كان دائماً');
});

test('refreshQuestionObjects(): يحدّث كائنات الأسئلة بلا فقدان أي تقدّم أو تحقّق جارٍ', () => {
  // اكتُشف عبر CI حقيقي: استبدال الحالة بالكامل عند نجاح hydrate() كان يقطع
  // الرابط بين وعد checkRemote() الجاري وحالته — سؤال بقي "جارٍ التحقق" للأبد.
  // الإصلاح: تحديث كائنات الأسئلة بالمعرّف فقط، مع إبقاء نفس كائن الحالة حياً.
  const sbDLP = loadQuizViewLayer({
    fakeStore: fakeStoreDatabase(),
    fakeQuiz: { filterByDifficulty: (qs) => qs, filterByLecture: (qs) => qs }
  });
  const oldQuestion = { id: 'q1-1', type: 'match', pairs: [{ left: 'أ', right: '1' }] }; // شكل ثابت قديم
  const quiz = { id: 'q1', questions: [oldQuestion] };
  const state = sbDLP.quizView.__test.getState(quiz);
  state.index = 0;
  state.responses['q1-1'] = ['1'];
  state.remote['q1-1'] = { pending: true }; // تحقّق جارٍ فعلياً وقت نجاح hydrate()

  const newQuestion = { id: 'q1-1', type: 'match', pairsLeft: ['أ'], pairsRight: ['1'] }; // شكل القاعدة الجديد
  const freshQuiz = { id: 'q1', questions: [newQuestion] };
  sbDLP.quizView.__test.refreshQuestionObjects(freshQuiz);

  equal(state.questions[0], newQuestion, 'يجب استبدال كائن السؤال بالنسخة الجديدة القادمة من القاعدة');
  equal(state.index, 0, 'index يجب ألا يتأثر');
  equal(JSON.stringify(state.responses['q1-1']), '["1"]', 'الإجابة المُختارة يجب ألا تُفقد');
  equal(state.remote['q1-1'].pending, true, 'حالة "جارٍ التحقق" يجب أن تبقى حيّة على نفس كائن الحالة — لا تُستبدل');
});

test('refreshQuestionObjects(): لا تفعل شيئاً لاختبار لم يُفتح بعد (لا يوجد كائن حالة له)', () => {
  const sbDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  // لا استدعاء لـ getState() هنا إطلاقاً — لا يوجد كائن حالة مخزَّن بعد
  sbDLP.quizView.__test.refreshQuestionObjects({ id: 'never-opened', questions: [] });
  assert(true, 'يجب ألا ترمي استثناءً حتى بلا حالة مخزَّنة');
});

test('scoreFor(): تُوجِّه للدالة الصحيحة بحسب dataSource (remoteScore مقابل DLP.quiz.score)', () => {
  const remoteDLP = loadQuizViewLayer({ fakeStore: fakeStoreDatabase() });
  const staticDLP = loadQuizViewLayer({
    fakeStore: fakeStoreStatic(),
    fakeQuiz: { score: () => ({ total: 42, allTotal: 42, answered: 0, gradableAnswered: 0, correct: 0, wrong: 0, percent: 0 }) }
  });
  const remoteState = remoteDLP.quizView.__test.createState({ id: 'q1', questions: [] });
  equal(remoteDLP.quizView.__test.scoreFor(remoteState).total, 0, 'remoteScore على اختبار بلا أسئلة');
  const staticState = staticDLP.quizView.__test.createState({ id: 'q1', questions: [] });
  equal(staticDLP.quizView.__test.scoreFor(staticState).total, 42, 'يجب استخدام DLP.quiz.score في الوضع الثابت');
});

/* -------------------- dashboard.js — لوحة الطالب (Stage 3) -------------------- */
group('dashboard — لوحة الطالب (بلا كشف تقدّم قبل تسجيل الدخول)');

/** يحمّل المنصة كاملة (بيانات + store + i18n + utils + layout) في sandbox واحد،
 * ثم يحقن DLP.auth وهمياً قبل تحميل dashboard.js تحديداً (لأن الوحدة تقرأ
 * DLP.auth عند التحميل مباشرة تماماً كما يحدث فعلياً في index.html). */
function loadDashboardLayer(options) {
  options = options || {};
  const sandbox = {
    console, location: { hash: '' }, addEventListener() {}, document: null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const platformFiles = require('./harness').FILES;
  platformFiles.concat(['assets/js/components/layout.js']).forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  });
  if (options.fakeAuth) { sandbox.DLP.auth = options.fakeAuth; }
  if (options.fakeApi) { sandbox.DLP.api = options.fakeApi; }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/components/dashboard.js'), 'utf8'),
    sandbox, { filename: 'assets/js/components/dashboard.js' });
  return sandbox.DLP;
}

test('render(): حالة "قريباً" حين DLP.auth غير متاح إطلاقاً (enabled:false اليوم)', () => {
  const sbDLP = loadDashboardLayer({});
  const html = sbDLP.dashboardView.render();
  assert(html.indexOf('soon-card') !== -1, 'يجب عرض بطاقة قريباً بلا DLP.auth');
  assert(html.indexOf('data-dashboard-action="sign-in"') === -1, 'لا يجوز عرض زر تسجيل دخول بلا اتصال');
});

test('render(): حالة "قريباً" حين DLP.auth متاح لكنه غير جاهز (isAvailable=false)', () => {
  const sbDLP = loadDashboardLayer({ fakeAuth: { isAvailable: () => false, onChange: () => () => {} } });
  const html = sbDLP.dashboardView.render();
  assert(html.indexOf('soon-card') !== -1, 'يجب عرض بطاقة قريباً حين isAvailable=false');
});

test('render(): طلب تسجيل الدخول حين الاتصال جاهز لكن لا مستخدم مسجَّل', () => {
  const sbDLP = loadDashboardLayer({
    fakeAuth: { isAvailable: () => true, onChange: (cb) => { cb(null); return () => {}; } }
  });
  const html = sbDLP.dashboardView.render();
  const strings = sbDLP.config.strings.ar;
  assert(html.indexOf('data-dashboard-action="sign-in"') !== -1, 'زر تسجيل الدخول يجب أن يظهر');
  assert(html.indexOf(strings['dashboard.signInPrompt']) !== -1, 'نص دعوة تسجيل الدخول يجب أن يظهر');
  assert(html.indexOf(strings['dashboard.notAvailableHint']) === -1, 'رسالة عدم التوفر لا يجوز ظهورها والاتصال جاهز');
});

test('render(): لا يكشف أي تقدّم أو محاولات قبل تسجيل الدخول', () => {
  const sbDLP = loadDashboardLayer({
    fakeAuth: { isAvailable: () => true, onChange: (cb) => { cb(null); return () => {}; } }
  });
  const html = sbDLP.dashboardView.render();
  assert(html.indexOf('data-dashboard-body') !== -1, 'يجب وجود حاوية المحتوى');
  assert(html.indexOf('data-table') === -1, 'لا يجوز ظهور جدول محاولات قبل تسجيل الدخول');
  assert(html.indexOf('progress-card') === -1, 'لا يجوز ظهور بطاقات تقدّم قبل تسجيل الدخول');
});

test('renderProgressCard(): يربط الصف بعنوان المادة الحقيقي ورابط أقسام الاختبارات', () => {
  const sbDLP = loadDashboardLayer({});
  const html = sbDLP.dashboardView.__test.renderProgressCard({
    subject_id: 'ai-data', quizzes_completed: 3, best_score_percent: 87.5, last_activity_at: '2026-09-01T10:00:00+00:00'
  });
  assert(html.indexOf('#/subject/ai-data/quizzes') !== -1, 'الرابط يجب أن يشير لأقسام اختبارات المادة الصحيحة');
  assert(html.indexOf('88') !== -1 || html.indexOf('87') !== -1, 'أفضل نتيجة يجب أن تظهر مقرَّبة');
  assert(html.indexOf('3') !== -1, 'عدد الاختبارات المكتملة يجب أن يظهر');
});

test('renderProgressCard(): مادة غير معروفة (محذوفة/تغيّر معرّفها) لا تكسر العرض', () => {
  const sbDLP = loadDashboardLayer({});
  const html = sbDLP.dashboardView.__test.renderProgressCard({
    subject_id: 'subject-not-found', quizzes_completed: 0, best_score_percent: null, last_activity_at: null
  });
  assert(html.indexOf('subject-not-found') !== -1, 'يجب عرض المعرّف نفسه كحلّ بديل بدل الانهيار');
  assert(html.indexOf('—') !== -1, 'أفضل نتيجة غائبة يجب أن تُعرض كشرطة بديلة لا فراغ مضلّل');
});

test('renderAttemptRow(): يجد عنوان الاختبار الحقيقي من بيانات المادة', () => {
  const sbDLP = loadDashboardLayer({});
  const html = sbDLP.dashboardView.__test.renderAttemptRow({
    quiz_id: 'ai-q1', started_at: '2026-09-01T08:00:00+00:00', status: 'completed', score_percent: 75
  });
  assert(html.indexOf('اختبار المادة') !== -1, 'يجب ظهور عنوان الاختبار الحقيقي لا معرّفه الخام');
  assert(html.indexOf('75') !== -1, 'النتيجة يجب أن تظهر لمحاولة مكتملة');
});

test('renderAttemptRow(): محاولة قيد التنفيذ لا تعرض نتيجة مضلّلة', () => {
  const sbDLP = loadDashboardLayer({});
  const html = sbDLP.dashboardView.__test.renderAttemptRow({
    quiz_id: 'ai-q1', started_at: '2026-09-01T08:00:00+00:00', status: 'in_progress', score_percent: null
  });
  assert(html.indexOf('—') !== -1, 'المحاولة غير المكتملة يجب أن تُعرض بشرطة بديلة للنتيجة لا رقماً');
});

test('findQuizContext(): يعيد null لمعرّف اختبار غير موجود بدل رمي استثناء', () => {
  const sbDLP = loadDashboardLayer({});
  equal(sbDLP.dashboardView.__test.findQuizContext('quiz-not-found'), null, 'يجب أن تُعيد null بهدوء');
});

test('formatTimestamp(): يحوّل طابعاً زمنياً كاملاً (timestamptz) إلى تاريخ مقروء', () => {
  const sbDLP = loadDashboardLayer({});
  const formatted = sbDLP.dashboardView.__test.formatTimestamp('2026-09-01T08:00:00+00:00');
  assert(formatted.indexOf('2026') !== -1, 'يجب أن يحتوي التاريخ المنسَّق على السنة');
});

test('formatTimestamp(): قيمة فارغة/null لا تكسر التنسيق', () => {
  const sbDLP = loadDashboardLayer({});
  equal(sbDLP.dashboardView.__test.formatTimestamp(null), '', 'يجب أن تُعيد نصاً فارغاً بهدوء');
});

/* -------------------- admin scaffold — Stage 4 (قراءة فقط) -------------------- */
group('admin scaffold — سقالة الإدارة (قراءة فقط، بلا كشف قبل التحقق من الدور)');

/** يحمّل المنصة كاملة + layout.js ثم أحد ملفّي admin/*.js، مع حقن DLP.auth/DLP.api
 * وهميّين قبل التحميل (نفس أسلوب loadDashboardLayer). */
function loadAdminLayer(componentFile, options) {
  options = options || {};
  const sandbox = { console, location: { hash: '' }, addEventListener() {}, document: null };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const platformFiles = require('./harness').FILES;
  platformFiles.concat(['assets/js/components/layout.js']).forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  });
  ['assets/js/components/admin/shared.js', 'assets/js/components/admin/crud-page.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  });
  if (options.fakeAuth) { sandbox.DLP.auth = options.fakeAuth; }
  if (options.fakeApi) { sandbox.DLP.api = options.fakeApi; }
  vm.runInContext(fs.readFileSync(path.join(ROOT, componentFile), 'utf8'), sandbox, { filename: componentFile });
  return sandbox.DLP;
}

test('adminView.render(): حالة "قريباً" بلا DLP.auth (enabled:false اليوم)', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/index.js', {});
  const html = sbDLP.adminView.render();
  assert(html.indexOf('soon-card') !== -1, 'يجب عرض بطاقة قريباً');
  assert(html.indexOf('data-admin-action="sign-in"') === -1, 'لا يجوز عرض زر تسجيل دخول بلا اتصال');
});

test('adminView.render(): دعوة تسجيل الدخول حين الاتصال جاهز بلا مستخدم، بلا كشف أي جدول', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/index.js', {
    fakeAuth: { isAvailable: () => true, onChange: (cb) => { cb(null); return () => {}; } }
  });
  const html = sbDLP.adminView.render();
  assert(html.indexOf('data-admin-action="sign-in"') !== -1, 'زر تسجيل الدخول يجب أن يظهر');
  assert(html.indexOf('data-table') === -1, 'لا يجوز ظهور أي جدول قبل تسجيل الدخول');
});

test('adminView.__test.collectSubjectPayload(): يبني payload صحيحاً عند الإنشاء والتعديل', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/index.js', {});
  const newForm = { elements: [
    { name: 'id', value: 'new-subject' }, { name: 'title', value: 'مادة' },
    { name: 'short_title', value: 'م' }, { name: 'icon', value: '📘' },
    { name: 'accent', value: '#000' }, { name: 'description', value: 'وصف' }, { name: 'status', value: 'draft' }
  ] };
  const created = sbDLP.adminView.__test.collectSubjectPayload(newForm);
  equal(created.id, 'new-subject', 'id يجب أن يُضاف عند الإنشاء');
  equal(created.title, 'مادة', 'title يجب أن يُقرأ من النموذج');
  equal(created.status, 'draft', 'status يجب أن يُقرأ من النموذج');

  const editForm = { elements: [
    { name: 'title', value: 'مادة معدَّلة' }, { name: 'short_title', value: '' }, { name: 'icon', value: '' },
    { name: 'accent', value: '' }, { name: 'description', value: '' }, { name: 'status', value: 'published' }
  ] };
  const updated = sbDLP.adminView.__test.collectSubjectPayload(editForm);
  equal(updated.id, undefined, 'id يجب ألا يظهر عند التعديل (لا حقل id في النموذج)');
  equal(updated.title, 'مادة معدَّلة', 'title المعدَّل يجب أن يظهر');
});

test('adminView.__test.moveSubject(): يبدّل ترتيب معرّفين متجاورين فقط، ويتجاهل تحريك الطرف خارج الحدود', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/index.js', {});
  const subjects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  equal(sbDLP.adminView.__test.moveSubject(subjects, 'b', -1).join(','), 'b,a,c', 'تحريك b للأعلى يبدّلها مع a');
  equal(sbDLP.adminView.__test.moveSubject(subjects, 'b', 1).join(','), 'a,c,b', 'تحريك b للأسفل يبدّلها مع c');
  equal(sbDLP.adminView.__test.moveSubject(subjects, 'a', -1).join(','), 'a,b,c', 'تحريك الأول للأعلى لا يفعل شيئاً (خارج الحدود)');
  equal(sbDLP.adminView.__test.moveSubject(subjects, 'c', 1).join(','), 'a,b,c', 'تحريك الأخير للأسفل لا يفعل شيئاً (خارج الحدود)');
});

testAsync('api.isAdminOrInstructor(): تُعيد نتيجة RPC كما هي لمستخدم عادي (false)', async () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/index.js', {
    fakeAuth: { isAvailable: () => true, onChange: (cb) => { cb({ id: 'student-1' }); return () => {}; } },
    fakeApi: { isAdminOrInstructor: () => Promise.resolve(false) }
  });
  const isAdmin = await sbDLP.api.isAdminOrInstructor();
  equal(isAdmin, false, 'مستخدم عادي لا يجوز أن يُعامَل كمشرف');
});

test('admin/questions.js — correctAnswerLabel(): mcq تعرض نص الخيار الصحيح لا فهرسه', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const label = sbDLP.adminQuestionsView.__test.correctAnswerLabel({
    type: 'mcq', options: [{ label: 'أ', is_correct: false }, { label: 'ب', is_correct: true }]
  });
  equal(label, 'ب', 'يجب عرض نص الخيار الصحيح المحدَّد فعلياً بـ is_correct');
});

test('admin/questions.js — correctAnswerLabel(): match تعرض كل الأزواج الصحيحة', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const label = sbDLP.adminQuestionsView.__test.correctAnswerLabel({
    type: 'match', pairs: [{ left: 'س', right: 'ص' }, { left: 'ع', right: 'غ' }]
  });
  assert(label.indexOf('س ← ص') !== -1 && label.indexOf('ع ← غ') !== -1, 'يجب عرض كل أزواج المطابقة الصحيحة');
});

test('admin/questions.js — correctAnswerLabel(): order تعرض الترتيب الصحيح كاملاً', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const label = sbDLP.adminQuestionsView.__test.correctAnswerLabel({
    type: 'order', items: [{ text: 'أولاً' }, { text: 'ثانياً' }]
  });
  equal(label, 'أولاً ← ثانياً', 'يجب عرض ترتيب العناصر الصحيح بالكامل');
});

test('admin/questions.js — renderQuestionRow(): لا يرمي على سؤال بلا options/pairs/items (نوع open مثلاً)', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const html = sbDLP.adminQuestionsView.__test.renderQuestionRow({
    id: 'q-open-1', type: 'open', prompt: 'اشرح بإيجاز', answer: null
  });
  assert(html.indexOf('q-open-1') !== -1, 'يجب عرض معرّف السؤال حتى للنوع المفتوح');
});

test('admin/questions.js — parseMcqOptions(): يحدّد correctIndex من علامة * ويحذفها من النص', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const result = sbDLP.adminQuestionsView.__test.parseMcqOptions('خيار أول\n*خيار صحيح\nخيار ثالث');
  equal(result.correctIndex, 1, 'الخيار المُعلَّم بـ* في المنتصف يجب أن يكون فهرسه 1');
  equal(result.options.length, 3, 'يجب بناء 3 خيارات');
  equal(result.options[1].label, 'خيار صحيح', 'علامة * يجب أن تُحذَف من نص الخيار');
  assert(result.options[1].is_correct === true, 'الخيار المُعلَّم يجب أن يحمل is_correct=true');
  assert(!result.options[0].is_correct && !result.options[2].is_correct, 'بقية الخيارات يجب ألا تحمل is_correct');
});

test('admin/questions.js — mcqOptionsToText()/parseMcqOptions(): جولة كاملة ذهاباً وإياباً تحافظ على البيانات', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const original = [{ position: 0, label: 'أ', is_correct: false }, { position: 1, label: 'ب', is_correct: true }];
  const text = sbDLP.adminQuestionsView.__test.mcqOptionsToText(original);
  const parsed = sbDLP.adminQuestionsView.__test.parseMcqOptions(text);
  equal(parsed.correctIndex, 1, 'يجب استعادة نفس فهرس الإجابة الصحيحة بعد التحويل ذهاباً وإياباً');
  equal(parsed.options.map((o) => o.label).join(','), 'أ,ب', 'يجب استعادة نفس تسميات الخيارات بالترتيب نفسه');
});

test('admin/questions.js — parsePairs()/pairsToText(): يفصل يسار/يمين بـ :: ويحافظ على الترتيب', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const parsed = sbDLP.adminQuestionsView.__test.parsePairs('خطر عالي :: نقل أو تجنّب\nخطر منخفض :: قبول');
  equal(parsed.length, 2, 'يجب بناء زوجين');
  equal(parsed[0].left_text, 'خطر عالي', 'left_text يجب أن يكون الجزء الأول');
  equal(parsed[0].right_text, 'نقل أو تجنّب', 'right_text يجب أن يكون الجزء الثاني');
  equal(parsed[1].position, 1, 'position يجب أن يعكس ترتيب الأسطر');
});

test('admin/questions.js — parseItems()/itemsToText(): يبني عناصر مرتَّبة من سطور نصية', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const parsed = sbDLP.adminQuestionsView.__test.parseItems('الخطوة الأولى\nالخطوة الثانية');
  equal(parsed.map((i) => i.item_text).join('|'), 'الخطوة الأولى|الخطوة الثانية', 'يجب بناء item_text لكل سطر');
  const text = sbDLP.adminQuestionsView.__test.itemsToText(parsed.map((i, idx) => ({ position: idx, text: i.item_text })));
  equal(text, 'الخطوة الأولى\nالخطوة الثانية', 'itemsToText يجب أن يعيد نفس النص الأصلي');
});

test('admin/questions.js — parseRubric(): يفصل نص المعيار عن كلماته المفتاحية بـ ::', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const parsed = sbDLP.adminQuestionsView.__test.parseRubric('حدّد المخاطر الرئيسية :: مخاطر,تحديد\nبلا كلمات مفتاحية');
  equal(parsed[0].text, 'حدّد المخاطر الرئيسية', 'text يجب أن يكون الجزء الأول');
  equal(parsed[0].keywords.join(','), 'مخاطر,تحديد', 'keywords يجب أن تُفصَل بفاصلة');
  equal(parsed[1].keywords.length, 0, 'سطر بلا :: يجب أن يُبنى بكلمات مفتاحية فارغة بلا رمي');
});

test('admin/questions.js — collectQuestionSubmission(): mcq يبني answer=correctIndex ويطلب استبدال question_options', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const form = {
    dataset: { type: 'mcq' },
    elements: [
      { name: 'id', value: 'q1' }, { name: 'prompt', value: 'سؤال' }, { name: 'difficulty', value: 'easy' },
      { name: 'status', value: 'published' }, { name: 'options_raw', value: 'خطأ\n*صحيح' }
    ]
  };
  const result = sbDLP.adminQuestionsView.__test.collectQuestionSubmission(form, 'quiz1');
  equal(result.payload.type, 'mcq', 'type يجب أن يُقرأ من dataset');
  equal(result.payload.answer, 1, 'answer يجب أن يكون فهرس الخيار الصحيح (رقم لا مصفوفة)');
  equal(result.children.table, 'question_options', 'يجب طلب استبدال question_options');
  equal(result.children.rows.length, 2, 'يجب بناء صفَّي خيارات');
});

test('admin/questions.js — collectQuestionSubmission(): tf/fill يكتبان answer مباشرة بلا صفوف فرعية', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const tfForm = {
    dataset: { type: 'tf' },
    elements: [{ name: 'prompt', value: 'سؤال' }, { name: 'status', value: 'published' }, { name: 'answer_bool', value: 'false' }]
  };
  const tfResult = sbDLP.adminQuestionsView.__test.collectQuestionSubmission(tfForm, 'quiz1');
  equal(tfResult.payload.answer, false, 'answer لسؤال tf يجب أن يكون boolean فعلي لا نصاً');
  equal(tfResult.children, null, 'tf لا يحتاج أي صفوف فرعية');

  const fillForm = {
    dataset: { type: 'fill' },
    elements: [{ name: 'prompt', value: 'سؤال' }, { name: 'status', value: 'published' }, { name: 'fill_answers_raw', value: 'إجابة1\nإجابة2' }]
  };
  const fillResult = sbDLP.adminQuestionsView.__test.collectQuestionSubmission(fillForm, 'quiz1');
  equal(fillResult.payload.answer.join(','), 'إجابة1,إجابة2', 'answer لسؤال fill يجب أن يكون مصفوفة نصوص');
});

test('admin/questions.js — collectQuestionSubmission(): match/order يطلبان استبدال الجدول الفرعي الصحيح بلا answer', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/questions.js', {});
  const matchForm = {
    dataset: { type: 'match' },
    elements: [{ name: 'prompt', value: 'طابق' }, { name: 'status', value: 'published' }, { name: 'pairs_raw', value: 'أ :: ١' }]
  };
  const matchResult = sbDLP.adminQuestionsView.__test.collectQuestionSubmission(matchForm, 'quiz1');
  equal(matchResult.payload.answer, null, 'match لا يستخدم عمود answer إطلاقاً');
  equal(matchResult.children.table, 'question_pairs', 'match يجب أن يطلب استبدال question_pairs');

  const orderForm = {
    dataset: { type: 'order' },
    elements: [{ name: 'prompt', value: 'رتّب' }, { name: 'status', value: 'published' }, { name: 'items_raw', value: 'أولاً\nثانياً' }]
  };
  const orderResult = sbDLP.adminQuestionsView.__test.collectQuestionSubmission(orderForm, 'quiz1');
  equal(orderResult.children.table, 'question_items', 'order يجب أن يطلب استبدال question_items');
  equal(orderResult.children.rows.length, 2, 'يجب بناء صفَّي عناصر بترتيب الأسطر');
});

/* -------------------- admin/crud-page.js — مصنع صفحات CRUD عامة (Phase D) -------------------- */
group('admin/crud-page.js — مصنع CRUD عام (lectures/summaries/assignments/...)');

const SAMPLE_CRUD_CONFIG = {
  table: 'lectures',
  titleKey: 'admin.hub.lectures',
  orderColumn: 'number',
  fields: [
    { name: 'number', labelKey: 'admin.field.number', type: 'number', required: true },
    { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
    { name: 'objectives', labelKey: 'admin.field.objectives', type: 'lines' }
  ],
  rowLabel: (row) => row.title,
  childrenChecks: [{ table: 'summaries', fk: 'lecture_id' }]
};

test('createPage().render(): بلا DLP.auth تعرض حالة "قريباً" مثل بقية صفحات الإدارة', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/shared.js', {});
  const page = sbDLP.adminCrud.createPage(SAMPLE_CRUD_CONFIG);
  const html = page.render();
  assert(html.indexOf('soon-card') !== -1, 'يجب عرض بطاقة قريباً بلا DLP.auth');
});

test('createPage().render(): يدعو لتسجيل الدخول حين الاتصال جاهز بلا مستخدم', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/shared.js', {
    fakeAuth: { isAvailable: () => true, onChange: (cb) => { cb(null); return () => {}; } }
  });
  const page = sbDLP.adminCrud.createPage(SAMPLE_CRUD_CONFIG);
  const html = page.render();
  assert(html.indexOf('data-admin-action="sign-in"') !== -1, 'زر تسجيل الدخول يجب أن يظهر');
});

test('parseFieldValue(): النوع number يحوّل النص إلى رقم، والفارغ إلى null', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/shared.js', {});
  const page = sbDLP.adminCrud.createPage(SAMPLE_CRUD_CONFIG);
  equal(page.__test.parseFieldValue({ type: 'number' }, '7'), 7, 'يجب التحويل لرقم فعلي');
  equal(page.__test.parseFieldValue({ type: 'number' }, ''), null, 'فارغ يجب أن يصبح null لا NaN');
});

test('parseFieldValue(): النوع lines يبني مصفوفة نصوص، يتجاهل الأسطر الفارغة', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/shared.js', {});
  const page = sbDLP.adminCrud.createPage(SAMPLE_CRUD_CONFIG);
  const result = page.__test.parseFieldValue({ type: 'lines' }, 'هدف أول\n\n  هدف ثانٍ  \n');
  equal(result.join('|'), 'هدف أول|هدف ثانٍ', 'يجب تقليم كل سطر وحذف الفراغات');
});

test('parseFieldValue(): النوع concepts يبني {term,definition} من صيغة term :: definition', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/shared.js', {});
  const page = sbDLP.adminCrud.createPage(SAMPLE_CRUD_CONFIG);
  const result = page.__test.parseFieldValue({ type: 'concepts' }, 'RLS :: أمان على مستوى الصف\nRPC :: دالة عن بُعد');
  equal(result.length, 2, 'يجب بناء عنصرين');
  equal(result[0].term, 'RLS', 'term يجب أن يكون الجزء الأول');
  equal(result[0].definition, 'أمان على مستوى الصف', 'definition يجب أن يكون الباقي');
});

test('collectPayload(): يبني payload يشمل subject_id/status وكل الحقول المُعرَّفة محوَّلة بنوعها', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/shared.js', {});
  const page = sbDLP.adminCrud.createPage(SAMPLE_CRUD_CONFIG);
  const fakeForm = {
    elements: [
      { name: 'number', value: '3' }, { name: 'title', value: 'محاضرة تجريبية' },
      { name: 'objectives', value: 'هدف1\nهدف2' }, { name: 'status', value: 'published' }
    ]
  };
  const payload = page.__test.collectPayload(fakeForm, 's1');
  equal(payload.subject_id, 's1', 'subject_id يجب أن يُضاف تلقائياً من نطاق الصفحة');
  equal(payload.status, 'published', 'status يجب أن يُقرأ من النموذج');
  equal(payload.number, 3, 'number يجب أن يتحوّل لرقم فعلي');
  equal(payload.objectives.join(','), 'هدف1,هدف2', 'objectives يجب أن تتحوّل لمصفوفة');
});

test('collectPayload(): عند الإنشاء (id موجود في النموذج) يُضاف id للـ payload؛ عند التعديل لا', () => {
  const sbDLP = loadAdminLayer('assets/js/components/admin/shared.js', {});
  const page = sbDLP.adminCrud.createPage(SAMPLE_CRUD_CONFIG);
  const newForm = { elements: [{ name: 'id', value: 'rm-l9' }, { name: 'number', value: '9' }, { name: 'title', value: 'محاضرة' }, { name: 'status', value: 'draft' }] };
  equal(page.__test.collectPayload(newForm, 's1').id, 'rm-l9', 'id يجب أن يُضاف عند الإنشاء');
  const editForm = { elements: [{ name: 'number', value: '9' }, { name: 'title', value: 'محاضرة' }, { name: 'status', value: 'draft' }] };
  equal(page.__test.collectPayload(editForm, 's1').id, undefined, 'id يجب ألا يظهر في payload التعديل (لا حقل id في النموذج أصلاً)');
});

testAsync('api.isAdminOrInstructor(): تُعيد false بهدوء بلا عميل (لا استثناء)', async () => {
  const sbDLP = loadSupabaseLayer({});
  const result = await sbDLP.api.isAdminOrInstructor();
  equal(result, false, 'يجب أن تُعيد false بلا عميل');
});

/* ------------------------------ النتيجة ------------------------------ */
Promise.all(pendingAsync).then(() => {
console.log('\n' + '─'.repeat(52));
console.log(`النتيجة: ${passed} نجحت / ${failed} فشلت — الإجمالي ${passed + failed}`);
if (failed) {
  console.log('\nالاختبارات الفاشلة:');
  failures.forEach((f) => console.log(' - ' + f.name + ': ' + f.error.message));
  process.exit(1);
}
console.log('كل الاختبارات نجحت ✓');
});
