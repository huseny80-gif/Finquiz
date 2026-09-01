/* اختبارات المتصفح (Playwright) — وظيفية + استجابة + إمكانية وصول + أخطاء Console.
   التشغيل: npm run test:e2e   (يتطلب توفر playwright في البيئة) */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8137;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

function startServer() {
  const server = http.createServer((req, res) => {
    let filePath = decodeURIComponent(req.url.split('?')[0]);
    if (filePath === '/') { filePath = '/index.html'; }
    const full = path.join(ROOT, path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log('  ✓ ' + name); }
  catch (error) { failed += 1; failures.push(name); console.log('  ✗ ' + name + '\n      ' + error.message); }
}
function assert(condition, message) { if (!condition) { throw new Error(message || 'التوقع لم يتحقق'); } }
function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'قيمة غير متوقعة') + ` — المتوقع: ${expected} / الفعلي: ${actual}`);
  }
}
function group(name) { console.log('\n▶ ' + name); }

(async function main() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) {
    console.log('⚠️  playwright غير متوفر — تخطّي اختبارات المتصفح.');
    process.exit(0);
  }

  const server = await startServer();
  const base = 'http://127.0.0.1:' + PORT + '/';
  const browser = await chromium.launch();
  const consoleErrors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // منع تحميل الخطوط الخارجية أثناء الاختبار لتسريعه وعزله عن الشبكة
  await context.route(/fonts\.googleapis\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' }));
  await context.route(/fonts\.gstatic\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') { consoleErrors.push(msg.text()); } });
  page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message));

  /** فتح مسار بحالة نظيفة — التنقل بين hash فقط لا يعيد تحميل الصفحة. */
  async function open(url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // مسح التقدّم المحفوظ حتى لا تتسرّب حالة اختبار إلى آخر
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* لا شيء */ } });
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  const SUBJECTS = ['ai-data', 'legal-regulatory', 'cybersecurity-governance',
                    'innovation-project-management', 'risk-management'];
  const SECTIONS = ['lectures', 'summaries', 'assignments', 'quizzes', 'references', 'resources', 'updates'];

  group('الصفحة الرئيسية');

  await test('تفتح الرئيسية وتعرض العنوان والبرنامج', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const h1 = await page.textContent('.hero h1');
    assert(h1.includes('القيادة الرقمية'), 'العنوان الرئيسي غير صحيح: ' + h1);
    assert((await page.textContent('.hero-sub')).includes('الكورس الثاني'), 'العنوان الفرعي مفقود');
  });

  await test('تعرض بطاقات المواد الخمس', async () => {
    const cards = await page.$$('.subject-card');
    assert(cards.length === 5, 'عدد البطاقات: ' + cards.length);
  });

  await test('بطاقات الإحصائيات ديناميكية وغير صفرية', async () => {
    const nums = await page.$$eval('.stat-num', (els) => els.map((e) => Number(e.textContent)));
    assert(nums.length === 6, 'عدد بطاقات الإحصاء: ' + nums.length);
    assert(nums.every((n) => n > 0), 'قيمة إحصائية صفرية: ' + nums.join(','));
    assert(nums[0] === 5, 'عدد المواد يجب أن يكون 5');
  });

  await test('اتجاه الصفحة RTL ولغتها عربية', async () => {
    assert(await page.getAttribute('html', 'dir') === 'rtl', 'dir');
    assert(await page.getAttribute('html', 'lang') === 'ar', 'lang');
  });

  await test('قسم آخر التحديثات وقسم التواصل ظاهران', async () => {
    assert(await page.$('#contact'), 'قسم التواصل مفقود');
    assert((await page.$$('.result-item')).length > 0, 'قائمة التحديثات فارغة');
  });

  group('التنقل بين المواد والأقسام');

  for (const id of SUBJECTS) {
    await test('تفتح المادة ' + id + ' وكل أقسامها السبعة', async () => {
      for (const section of SECTIONS) {
        await page.goto(base + '#/subject/' + id + '/' + section, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#sectionPanel');
        const selected = await page.getAttribute('.sectionbar-btn[data-section="' + section + '"]', 'aria-selected');
        assert(selected === 'true', 'التبويب غير نشط: ' + section);
        const text = (await page.textContent('#sectionPanel')).trim();
        assert(text.length > 40, 'قسم فارغ: ' + id + '/' + section);
        assert(!text.includes('undefined'), 'قيمة undefined في: ' + id + '/' + section);
      }
    });
  }

  await test('التبويبات قابلة للنقر وتغيّر المسار', async () => {
    await page.goto(base + '#/subject/ai-data', { waitUntil: 'domcontentloaded' });
    await page.click('.sectionbar-btn[data-section="summaries"]');
    await page.waitForFunction(() => location.hash.includes('/summaries'));
    assert(page.url().includes('/summaries'), 'المسار لم يتغيّر');
  });

  await test('مسار المادة الافتراضي يفتح المحاضرات', async () => {
    await page.goto(base + '#/subject/risk-management', { waitUntil: 'domcontentloaded' });
    assert(await page.getAttribute('.sectionbar-btn[data-section="lectures"]', 'aria-selected') === 'true', 'الافتراضي');
  });

  await test('شريط المسار (Breadcrumbs) يعمل', async () => {
    await page.goto(base + '#/subject/ai-data/quizzes', { waitUntil: 'domcontentloaded' });
    assert(await page.$('.breadcrumbs'), 'شريط المسار مفقود');
    await page.click('.breadcrumbs a[href="#/"]');
    await page.waitForSelector('.subjects-grid');
  });

  await test('مسار غير موجود يعرض صفحة "غير موجودة"', async () => {
    await page.goto(base + '#/no/such/route', { waitUntil: 'domcontentloaded' });
    assert((await page.textContent('#main')).includes('غير موجودة'), 'صفحة 404 مفقودة');
  });

  group('البحث');

  await test('البحث العام يعيد نتائج ذات صلة', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.fill('#globalSearchInput', 'المخاطر');
    await page.click('.btn-search');
    await page.waitForSelector('.result-item');
    const results = await page.$$('.result-item');
    assert(results.length > 0, 'لا نتائج');
    assert((await page.textContent('.section-title')).includes('المخاطر'), 'عنوان النتائج');
  });

  await test('نتيجة البحث تنقل إلى المحتوى المطلوب', async () => {
    await page.click('.result-item .btn-primary');
    await page.waitForSelector('#sectionPanel');
    assert(page.url().includes('#/subject/'), 'لم ينتقل للمحتوى');
  });

  await test('البحث عن كلمة غير موجودة يعرض رسالة واضحة', async () => {
    await page.goto(base + '#/search?q=' + encodeURIComponent('كلمةلاتوجدxyz'), { waitUntil: 'domcontentloaded' });
    assert((await page.textContent('#main')).includes('لا توجد نتائج'), 'رسالة النتائج الفارغة');
  });

  group('الأسئلة التفاعلية');

  await test('اختيار إجابة صحيحة يعرض التصحيح والتفسير', async () => {
    await open(base + '#/subject/ai-data/quizzes');
    await page.waitForSelector('.opt');
    await page.click('.opt[data-value="1"]');
    await page.click('[data-quiz-action="check"]');
    await page.waitForSelector('.feedback.show');
    const feedback = await page.textContent('.feedback');
    assert(feedback.includes('صحيحة'), 'لا توجد نتيجة');
    assert(feedback.includes('التوضيح'), 'لا يوجد تفسير');
    assert(await page.$('.opt.is-correct'), 'الإجابة الصحيحة غير مميّزة');
  });

  await test('اختيار إجابة خاطئة يُظهر الإجابة الصحيحة', async () => {
    await open(base + '#/subject/legal-regulatory/quizzes');
    await page.click('.opt[data-value="0"]');
    await page.click('[data-quiz-action="check"]');
    const feedback = await page.textContent('.feedback');
    assert(feedback.includes('غير صحيحة'), 'لم تُرصد الإجابة الخاطئة');
    assert(feedback.includes('الإجابة الصحيحة'), 'لم تُعرض الإجابة الصحيحة');
  });

  await test('التنقل بين الأسئلة (التالي/السابق) يعمل', async () => {
    await open(base + '#/subject/ai-data/quizzes');
    const first = await page.textContent('.q-prompt');
    await page.click('[data-quiz-action="next"]');
    const second = await page.textContent('.q-prompt');
    assert(first !== second, 'السؤال لم يتغيّر');
    await page.click('[data-quiz-action="prev"]');
    assert((await page.textContent('.q-prompt')) === first, 'الرجوع للسؤال السابق لا يعمل');
  });

  await test('شريط التقدّم يتحدّث مع الإجابة', async () => {
    await open(base + '#/subject/ai-data/quizzes');
    const before = await page.getAttribute('.progress-track', 'aria-valuenow');
    await page.click('.opt[data-value="1"]');
    const after = await page.getAttribute('.progress-track', 'aria-valuenow');
    assert(Number(after) > Number(before), 'التقدّم لم يتغيّر');
  });

  await test('سؤال صح/خطأ يعمل', async () => {
    await open(base + '#/subject/ai-data/quizzes');
    await page.click('[data-quiz-action="next"]');
    await page.waitForSelector('.opt[data-value="false"]');
    await page.click('.opt[data-value="false"]');
    await page.click('[data-quiz-action="check"]');
    assert((await page.textContent('.feedback')).includes('صحيحة'), 'تصحيح صح/خطأ');
  });

  await test('سؤال إكمال الفراغ يقبل الإجابة النصية', async () => {
    await open(base + '#/subject/ai-data/quizzes');
    await page.click('[data-quiz-action="next"]');
    await page.click('[data-quiz-action="next"]');
    await page.waitForSelector('.fill-input');
    await page.fill('.fill-input', 'التنبؤي');
    await page.click('[data-quiz-action="check"]');
    assert((await page.textContent('.feedback')).includes('إجابة صحيحة'), 'تصحيح إكمال الفراغ');
  });

  await test('سؤال المطابقة يعمل عبر القوائم المنسدلة', async () => {
    await open(base + '#/subject/ai-data/quizzes');
    for (let i = 0; i < 3; i++) { await page.click('[data-quiz-action="next"]'); }
    await page.waitForSelector('.match-select');
    const rows = await page.$$('.match-select');
    const answers = ['ماذا حدث؟', 'لماذا حدث؟', 'ماذا سيحدث؟', 'ماذا ينبغي أن نفعل؟'];
    for (let i = 0; i < rows.length; i++) { await rows[i].selectOption(answers[i]); }
    await page.click('[data-quiz-action="check"]');
    assert((await page.textContent('.feedback')).includes('إجابة صحيحة'), 'تصحيح المطابقة');
  });

  await test('سؤال الترتيب يعمل عبر أزرار التحريك', async () => {
    await open(base + '#/subject/ai-data/quizzes');
    for (let i = 0; i < 4; i++) { await page.click('[data-quiz-action="next"]'); }
    await page.waitForSelector('.order-item');
    // الترتيب الافتراضي في البيانات صحيح — نبدّل عنصرين ثم نعيدهما للتأكد من عمل الأزرار
    await page.click('.order-item:nth-child(2) [data-move="down"]');
    await page.click('[data-quiz-action="check"]');
    assert((await page.textContent('.feedback')).includes('غير صحيحة'), 'الترتيب المبدّل يجب أن يكون خاطئاً');
  });

  await test('حساب النتيجة النهائية وإعادة الاختبار يعملان', async () => {
    await open(base + '#/subject/risk-management/quizzes');
    await page.click('.opt[data-value="1"]');
    await page.click('[data-quiz-action="check"]');
    for (let i = 0; i < 5; i++) { await page.click('[data-quiz-action="next"]'); }
    await page.click('[data-quiz-action="finish"]');
    await page.waitForSelector('.quiz-result');
    const score = await page.textContent('.score-big');
    assert(/\d+\s*\/\s*\d+/.test(score), 'النتيجة غير معروضة: ' + score);
    await page.click('.quiz-result [data-quiz-action="retry"]');
    assert(!(await page.$('.feedback.show')), 'إعادة الاختبار لم تمسح الإجابات');
  });

  await test('تصفية الأسئلة حسب الصعوبة تعمل', async () => {
    await open(base + '#/subject/cybersecurity-governance/quizzes');
    await page.click('[data-quiz-filter="hard"]');
    assert(await page.getAttribute('[data-quiz-filter="hard"]', 'aria-pressed') === 'true', 'الفلتر غير نشط');
    assert((await page.textContent('.q-prompt')).includes('صعب'), 'السؤال المعروض ليس صعباً');
  });

  await test('تقدّم الاختبار يُحفظ بعد إعادة تحميل الصفحة', async () => {
    await open(base + '#/subject/ai-data/quizzes');
    await page.click('.opt[data-value="1"]');
    await page.click('[data-quiz-action="check"]');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.feedback.show', { timeout: 5000 });
    assert((await page.textContent('.feedback')).includes('صحيحة'), 'لم تُستعد الإجابة المحفوظة');
  });

  await test('زر «مسح التقدّم» يمسح الحفظ فعلياً', async () => {
    await page.click('[data-quiz-action="clear"]');
    assert(!(await page.$('.feedback.show')), 'لم تُمسح الإجابة من الشاشة');
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert(!(await page.$('.feedback.show')), 'عادت الإجابة بعد إعادة التحميل');
    const stored = await page.evaluate(() => localStorage.getItem('dlp.quiz.ai-q1'));
    assert(!stored, 'بقي أثر في التخزين المحلي');
  });

  await test('الاختبار يعمل حتى لو كان التخزين المحلي معطّلاً', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new Error('التخزين معطّل'); }
      });
    });
    const blind = await ctx.newPage();
    const errors = [];
    blind.on('pageerror', (e) => errors.push(e.message));
    await blind.goto(base + '#/subject/ai-data/quizzes', { waitUntil: 'domcontentloaded' });
    await blind.click('.opt[data-value="1"]');
    await blind.click('[data-quiz-action="check"]');
    assert(await blind.$('.feedback.show'), 'الاختبار توقف عن العمل بلا تخزين');
    assert(!errors.length, 'أخطاء: ' + errors.join(' | '));
    await ctx.close();
  });

  group('إمكانية الوصول — إدارة التركيز والتبويبات');

  await test('التركيز ينتقل إلى عنوان الصفحة عند تغيير المسار', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.click('.subject-card a.btn');
    await page.waitForSelector('#sectionPanel');
    const tag = await page.evaluate(() => document.activeElement.tagName);
    equal(tag, 'H1', 'التركيز لم ينتقل إلى العنوان');
  });

  await test('تغيّر الصفحة يُعلَن لقارئ الشاشة', async () => {
    await page.goto(base + '#/about', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('routeAnnouncer').textContent.length > 0,
      null, { timeout: 3000 });
    const text = await page.textContent('#routeAnnouncer');
    assert(text.includes('من نحن'), 'الإعلان لا يذكر الصفحة: ' + text);
  });

  await test('التبويبات تطبّق roving tabindex', async () => {
    await page.goto(base + '#/subject/ai-data/summaries', { waitUntil: 'domcontentloaded' });
    const values = await page.$$eval('[role="tab"]',
      (els) => els.map((e) => e.getAttribute('tabindex')));
    equal(values.filter((v) => v === '0').length, 1, 'يجب أن يكون تبويب واحد فقط في تسلسل Tab');
    const activeTab = await page.getAttribute('[aria-selected="true"]', 'tabindex');
    equal(activeTab, '0', 'التبويب النشط خارج تسلسل Tab');
  });

  await test('مفاتيح Home وEnd والأسهم تنقل التركيز بين التبويبات', async () => {
    await page.focus('[aria-selected="true"]');
    await page.keyboard.press('End');
    let focused = await page.evaluate(() => document.activeElement.dataset.section);
    equal(focused, 'updates', 'End لم ينقل إلى آخر تبويب');
    await page.keyboard.press('Home');
    focused = await page.evaluate(() => document.activeElement.dataset.section);
    equal(focused, 'lectures', 'Home لم ينقل إلى أول تبويب');
    await page.keyboard.press('ArrowLeft');
    focused = await page.evaluate(() => document.activeElement.dataset.section);
    equal(focused, 'summaries', 'السهم الأيسر لا يتقدّم في وضع RTL');
  });

  group('الأرشيف والملخص الخارجي');

  await test('صفحة من نحن تعرض أرشيف الكورس الأول برابط يعمل', async () => {
    await page.goto(base + '#/about', { waitUntil: 'domcontentloaded' });
    assert(await page.$('#archive'), 'قسم الأرشيف مفقود');
    const href = await page.getAttribute('#archive a.btn', 'href');
    assert(href && href.length > 10, 'رابط الأرشيف مفقود');
    const response = await page.request.get(base + href);
    equal(response.status(), 200, 'ملف الأرشيف لا يُفتح');
  });

  await test('الملخص الخارجي يحمل شريط عودة إلى المنصة', async () => {
    await page.goto(base + 'files/legal-regulatory/summary-01.html', { waitUntil: 'domcontentloaded' });
    assert(await page.$('#dlp-return-bar'), 'شريط العودة مفقود');
    await page.click('#dlp-return-bar a:first-child');
    await page.waitForSelector('#sectionPanel', { timeout: 5000 });
    assert(page.url().includes('legal-regulatory'), 'العودة لم تصل إلى المادة');
  });

  group('أزرار الرجوع والتنقل السريع');

  await test('زر "الرجوع إلى أعلى" موجود ويعمل في كل مادة', async () => {
    for (const id of SUBJECTS) {
      await page.goto(base + '#/subject/' + id, { waitUntil: 'domcontentloaded' });
      assert(await page.$('[data-action="scroll-top"]'), 'زر الرجوع مفقود في ' + id);
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.click('[data-action="scroll-top"]');
      await page.waitForFunction(() => window.scrollY < 50, null, { timeout: 3000 });
    }
  });

  await test('زر "الرئيسية" في نهاية كل مادة ينقل للرئيسية', async () => {
    for (const id of SUBJECTS) {
      await page.goto(base + '#/subject/' + id, { waitUntil: 'domcontentloaded' });
      await page.click('.page-end-actions a[href="#/"]');
      await page.waitForSelector('.subjects-grid');
    }
  });

  await test('الزر العائم يظهر عند التمرير', async () => {
    await page.goto(base + '#/subject/ai-data', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForSelector('#fabTop.show', { timeout: 3000 });
  });

  group('من نحن والتواصل');

  await test('صفحة من نحن تعرض كل الأقسام المطلوبة', async () => {
    await page.goto(base + '#/about', { waitUntil: 'domcontentloaded' });
    const text = await page.textContent('#main');
    ['الهدف من المنصة', 'الفئة المستهدفة', 'طبيعة المحتوى', 'أهداف التعلم', 'طريقة تنظيم المواد', 'قابل للتحديث']
      .forEach((needle) => assert(text.includes(needle), 'قسم مفقود: ' + needle));
  });

  await test('وسائل التواصل تُعرض بلا روابط وهمية', async () => {
    const links = await page.$$eval('#contact a[href]', (els) => els.map((e) => e.getAttribute('href')));
    links.forEach((href) => assert(!/example\.com|#$|javascript:/i.test(href), 'رابط وهمي: ' + href));
  });

  group('التذييل والروابط');

  await test('التذييل يحتوي روابط المواد ومن نحن وحقوق النشر', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const footer = await page.textContent('.site-footer');
    assert(footer.includes('الدبلوم العالي المهني في القيادة الرقمية'), 'اسم البرنامج');
    assert(footer.includes('الكورس الثاني'), 'الكورس');
    assert(footer.includes('جميع الحقوق محفوظة'), 'حقوق النشر');
    assert(footer.includes(String(new Date().getFullYear())), 'سنة التحديث');
    const links = await page.$$('.site-footer a');
    assert(links.length >= 9, 'روابط التذييل ناقصة: ' + links.length);
  });

  await test('كل روابط التنقل الداخلية قابلة للحل', async () => {
    const hrefs = await page.$$eval('a[href^="#"]', (els) => [...new Set(els.map((e) => e.getAttribute('href')))]);
    for (const href of hrefs) {
      if (!href.startsWith('#/')) { continue; }
      await page.goto(base + href, { waitUntil: 'domcontentloaded' });
      const text = await page.textContent('#main');
      assert(!text.includes('الصفحة غير موجودة'), 'رابط مكسور: ' + href);
    }
  });

  group('الاستجابة (Responsive)');

  const VIEWPORTS = [
    { name: 'موبايل (375×667)', width: 375, height: 667 },
    { name: 'موبايل كبير (414×896)', width: 414, height: 896 },
    { name: 'تابلت (768×1024)', width: 768, height: 1024 },
    { name: 'آيباد (834×1112)', width: 834, height: 1112 },
    { name: 'لابتوب (1280×800)', width: 1280, height: 800 },
    { name: 'سطح مكتب (1920×1080)', width: 1920, height: 1080 }
  ];

  for (const viewport of VIEWPORTS) {
    await test('لا تمرير أفقي على ' + viewport.name, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const url of [base, base + '#/subject/ai-data/quizzes', base + '#/about', base + '#/search?q=المخاطر']) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert(overflow <= 2, 'تمرير أفقي (' + overflow + 'px) في ' + url);
      }
    });
  }

  await test('قائمة الجوال تفتح وتغلق', async () => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert(!(await page.isVisible('#mainNav .nav-link')), 'القائمة يجب أن تكون مغلقة');
    await page.click('#navToggle');
    assert(await page.isVisible('#mainNav .nav-link'), 'القائمة لم تُفتح');
    assert(await page.getAttribute('#navToggle', 'aria-expanded') === 'true', 'aria-expanded');
  });

  await page.setViewportSize({ width: 1280, height: 900 });

  group('إمكانية الوصول (Accessibility)');

  await test('بنية دلالية: header وmain وfooter وnav', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    for (const selector of ['header.site-header', 'main#main', 'footer.site-footer', 'nav.main-nav']) {
      assert(await page.$(selector), 'عنصر دلالي مفقود: ' + selector);
    }
  });

  await test('عنوان h1 واحد في كل صفحة', async () => {
    for (const url of [base, base + '#/subject/ai-data', base + '#/about']) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const count = (await page.$$('h1')).length;
      assert(count === 1, 'عدد h1 في ' + url + ' = ' + count);
    }
  });

  await test('رابط التخطي وحقل البحث لهما تسميات', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert(await page.$('.skip-link'), 'رابط التخطي مفقود');
    assert(await page.$('label[for="globalSearchInput"]'), 'تسمية حقل البحث مفقودة');
  });

  await test('التنقل بلوحة المفاتيح يصل إلى روابط التنقل', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement.className);
    assert(first.includes('skip-link'), 'أول عنصر بالتركيز ليس رابط التخطي: ' + first);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); }
    const tag = await page.evaluate(() => document.activeElement.tagName);
    assert(['A', 'BUTTON', 'INPUT'].includes(tag), 'التركيز على عنصر غير تفاعلي: ' + tag);
  });

  await test('أزرار الاختبار قابلة للتشغيل بلوحة المفاتيح', async () => {
    await page.goto(base + '#/subject/ai-data/quizzes', { waitUntil: 'domcontentloaded' });
    await page.focus('.opt[data-value="1"]');
    await page.keyboard.press('Enter');
    assert(await page.getAttribute('.opt[data-value="1"]', 'aria-pressed') === 'true', 'الاختيار بلوحة المفاتيح');
  });

  await test('التبويبات تحمل أدوار ARIA صحيحة', async () => {
    await page.goto(base + '#/subject/ai-data', { waitUntil: 'domcontentloaded' });
    assert(await page.$('[role="tablist"]'), 'tablist مفقود');
    assert(await page.$('[role="tabpanel"]'), 'tabpanel مفقود');
    const tabs = await page.$$eval('[role="tab"]', (els) => els.map((e) => e.getAttribute('aria-selected')));
    assert(tabs.filter((v) => v === 'true').length === 1, 'يجب أن يكون تبويب واحد نشطاً');
  });

  await test('الأيقونات الزخرفية مخفية عن قارئ الشاشة', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const icons = await page.$$eval('.subject-icon', (els) => els.map((e) => e.getAttribute('aria-hidden')));
    assert(icons.every((v) => v === 'true'), 'أيقونة غير مخفية عن قارئ الشاشة');
  });

  group('أخطاء Console');

  await test('لا توجد أخطاء في الـ Console عبر كل الصفحات', async () => {
    consoleErrors.length = 0;
    const urls = [base, base + '#/about', base + '#/search?q=المخاطر'];
    SUBJECTS.forEach((id) => SECTIONS.forEach((s) => urls.push(base + '#/subject/' + id + '/' + s)));
    for (const url of urls) { await page.goto(url, { waitUntil: 'domcontentloaded' }); }
    assert(consoleErrors.length === 0, 'أخطاء: ' + consoleErrors.slice(0, 5).join(' | '));
  });

  await browser.close();
  server.close();

  console.log('\n' + '─'.repeat(52));
  console.log(`نتيجة اختبارات المتصفح: ${passed} نجحت / ${failed} فشلت`);
  if (failed) { console.log('الفاشلة: ' + failures.join(' | ')); process.exit(1); }
  console.log('كل اختبارات المتصفح نجحت ✓');
})();
