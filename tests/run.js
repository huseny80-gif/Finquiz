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

test('التفعيل الفعلي (enabled) معطَّل افتراضياً — فجوة question_pairs لم تُحل بعد', () => {
  const configDLP = loadSupabaseLayer({});
  assert(configDLP.config.supabase.enabled === false,
    'enabled يجب أن يبقى false حتى يُحل TODO أسئلة المطابقة في 002_rls.sql');
});

/* -------------------- store.hydrate() — الاستبدال الذرّي وسقوط fallback -------------------- */

/** يحمّل نسخة معزولة من core/store.js مع بيانات ثابتة لمادة واحدة فقط، ليمكن
 * حقن DLP.api وهمي والتحقّق من hydrate() بمعزل عن بقية اختبارات DLP المشتركة. */
function loadStoreLayer() {
  const sandbox = { console, addEventListener() {}, document: null };
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
function loadQuizViewLayer(options) {
  options = options || {};
  const sandbox = { console, addEventListener() {}, document: null };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.DLP = { auth: options.fakeAuth, api: options.fakeApi };
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
