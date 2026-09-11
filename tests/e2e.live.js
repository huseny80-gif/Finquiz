/* اختبار حي حقيقي — يفتح متصفحاً فعلياً ويتصل بمشروع Supabase الحقيقي عبر شبكة
   حقيقية (بخلاف tests/e2e.js الذي يعمل غالباً على البيانات الثابتة في بيئات
   شبكتها محجوبة). يسجّل دخول مستخدم اختبار حقيقي (بريد/كلمة مرور)، يُجري
   اختباراً تفاعلياً كاملاً (بدء محاولة → إجابة → تصحيح خادمي → إنهاء)، ثم
   يتحقّق مباشرة من قراءة الاستمرار الفعلي (quiz_attempts) من القاعدة نفسها.

   لا يُشغَّل تلقائياً ضمن npm test/npm run build — فقط عبر:
     npm run test:e2e:live
   ويتطلب متغيرَي بيئة حقيقيَّين لمستخدم اختبار موجود مسبقاً في Supabase Auth
   لهذا المشروع (بريد/كلمة مرور، auth.confirmed):
     E2E_LIVE_EMAIL, E2E_LIVE_PASSWORD
   بغيابهما (محلياً، أو في أي CI لم تُضَف له هذه الأسرار) يتخطّى الاختبار
   بهدوء برسالة واضحة — لا يفشل البناء. هذا عمداً: هذا الملف تحقّق تكميلي
   حقيقي إضافي، لا بديل عن tests/e2e.js الذي يبقى يعمل بلا أي شرط شبكة. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const EMAIL = process.env.E2E_LIVE_EMAIL;
const PASSWORD = process.env.E2E_LIVE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log('⚠️  E2E_LIVE_EMAIL/E2E_LIVE_PASSWORD غير معرَّفين — تخطّي الاختبار الحي المتصل فعلياً بـ Supabase.');
  console.log('    (هذا متوقَّع محلياً وفي أي CI لم تُضَف له هذان السرّان بعد — انظر IMPLEMENTATION_REPORT.md)');
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');
const PORT = 8138;
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
async function test(name, fn) {
  try { await fn(); passed += 1; console.log('  ✓ ' + name); }
  catch (error) { failed += 1; console.log('  ✗ ' + name + '\n      ' + error.message); }
}
function assert(condition, message) { if (!condition) { throw new Error(message || 'التوقع لم يتحقق'); } }

(async function main() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) {
    console.log('⚠️  playwright غير متوفر — تخطّي الاختبار الحي.');
    process.exit(0);
  }

  const server = await startServer();
  const base = 'http://127.0.0.1:' + PORT + '/';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') { consoleErrors.push(msg.text()); } });
  page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message));

  console.log('\n▶ اختبار حي متصل فعلياً بـ Supabase');

  await test('hydrate() تنجح فعلياً عبر شبكة حقيقية (dataSource=database)', async () => {
    await page.goto(base + '#/subject/risk-management/quizzes', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.DLP && window.DLP.store &&
      window.DLP.store.dataSource() === 'database', null, { timeout: 20000 });
  });

  await test('تسجيل دخول مستخدم اختبار حقيقي بالبريد/كلمة المرور ينجح', async () => {
    const result = await page.evaluate(([email, password]) => {
      return window.DLP.supabaseClient.auth.signInWithPassword({ email, password })
        .then((r) => ({ error: r.error ? r.error.message : null }));
    }, [EMAIL, PASSWORD]);
    assert(!result.error, 'فشل تسجيل الدخول: ' + result.error);
    await page.waitForFunction(() => window.DLP.auth.isAvailable(), null, { timeout: 5000 });
    const user = await page.evaluate(() => window.DLP.auth.getUser());
    assert(user && user.email === EMAIL, 'المستخدم الحالي غير مطابق بعد الدخول');
  });

  await test('الإجابة والتصحيح الخادمي (RPC حقيقي) يعملان وتُحفظ الإجابة', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.DLP.store.dataSource() === 'database', null, { timeout: 20000 });
    await page.waitForSelector('.opt');
    await page.click('.opt[data-value="1"]');
    await page.click('[data-quiz-action="check"]');
    await page.waitForFunction(() => {
      const el = document.querySelector('.feedback');
      return el && el.classList.contains('show') && !el.textContent.includes('جارٍ التحقق');
    }, null, { timeout: 15000 });
    const feedback = await page.textContent('.feedback');
    assert(feedback.includes('صحيحة'), 'لم يظهر تصحيح فعلي بعد RPC حقيقي: ' + feedback);
  });

  await test('إنهاء المحاولة يُحفظ فعلياً في quiz_attempts (finished_at)', async () => {
    while (await page.$('[data-quiz-action="next"]')) { await page.click('[data-quiz-action="next"]'); }
    await page.click('[data-quiz-action="finish"]');
    await page.waitForSelector('.quiz-result', { timeout: 15000 });

    const attempts = await page.evaluate(() => {
      return window.DLP.auth.getUser().then((u) => window.DLP.api.fetchMyAttempts(u.id));
    });
    assert(Array.isArray(attempts) && attempts.length > 0, 'لا توجد أي محاولة محفوظة للمستخدم في القاعدة');
    const last = attempts[0];
    assert(!!last.finished_at, 'المحاولة الأخيرة لم تُعلَّم كمنتهية (finished_at) في القاعدة الحية');
    assert(typeof last.total_questions === 'number' && last.total_questions > 0,
      'عدد الأسئلة الكلي في المحاولة المحفوظة غير صحيح');
  });

  await test('تسجيل الخروج ينجح وتبقى الصفحة قابلة للتصفح بلا حساب', async () => {
    await page.evaluate(() => window.DLP.auth.signOut());
    await page.waitForFunction(() => {
      return window.DLP.auth.getUser().then((u) => u === null);
    }, null, { timeout: 5000 });
  });

  await test('لا أخطاء Console حقيقية خلال التدفّق الحي الكامل', async () => {
    assert(!consoleErrors.length, consoleErrors.join(' | '));
  });

  await browser.close();
  server.close();

  console.log('\n────────────────────────────────────────────────────');
  console.log(`نتيجة الاختبار الحي: ${passed} نجحت / ${failed} فشلت`);
  if (failed > 0) { console.log('❌ فشل الاختبار الحي المتصل فعلياً بـ Supabase.'); process.exit(1); }
  console.log('✅ الاختبار الحي المتصل فعلياً بـ Supabase نجح بالكامل.');
})();
