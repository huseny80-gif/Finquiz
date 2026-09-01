/* تحقّق من سلامة المشروع قبل النشر: بنية الملفات، صحة الصياغة، والبيانات. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadPlatform } = require('../tests/harness');

const ROOT = path.resolve(__dirname, '..');
let problems = [];

function check(label, fn) {
  try { fn(); console.log('  ✓ ' + label); }
  catch (error) { problems.push(label + ' — ' + error.message); console.log('  ✗ ' + label + ': ' + error.message); }
}

function walk(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') { return; }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, out); } else { out.push(full); }
  });
  return out;
}

console.log('▶ التحقق من بنية المشروع');

check('الملفات الأساسية موجودة', () => {
  ['index.html', 'README.md', 'assets/css/styles.css', 'assets/js/app.js',
   'data/subjects/index.js', 'data/config/site.js'].forEach((file) => {
    if (!fs.existsSync(path.join(ROOT, file))) { throw new Error('مفقود: ' + file); }
  });
});

check('كل ملفات JavaScript صحيحة الصياغة', () => {
  walk(path.join(ROOT, 'assets')).concat(walk(path.join(ROOT, 'data')))
    .filter((file) => file.endsWith('.js'))
    .forEach((file) => {
      try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); }
      catch (error) { throw new Error(path.relative(ROOT, file) + ': ' + error.message); }
    });
});

check('لا توجد ملفات ضخمة غير ضرورية (> 1MB)', () => {
  walk(ROOT).forEach((file) => {
    const size = fs.statSync(file).size;
    if (size > 1024 * 1024) {
      throw new Error(path.relative(ROOT, file) + ' حجمه ' + Math.round(size / 1024) + 'KB');
    }
  });
});

console.log('\n▶ التحقق من طبقة البيانات');
const DLP = loadPlatform();

check('عدد المواد = 5', () => {
  const count = DLP.store.subjects().length;
  if (count !== 5) { throw new Error('العدد الفعلي: ' + count); }
});

check('لا يوجد قسم فارغ في أي مادة', () => {
  DLP.store.subjects().forEach((subject) => {
    ['lectures', 'summaries', 'assignments', 'quizzes', 'references', 'resources', 'updates']
      .forEach((key) => {
        if (!DLP.store.list(subject, key).length) {
          throw new Error(subject.id + ' → ' + key + ' فارغ');
        }
      });
  });
});

check('كل مرجع لمحاضرة داخل الملخصات صالح', () => {
  DLP.store.subjects().forEach((subject) => {
    const ids = subject.lectures.map((l) => l.id);
    subject.summaries.forEach((summary) => {
      if (summary.lectureId && !ids.includes(summary.lectureId)) {
        throw new Error(summary.id + ' يشير إلى محاضرة غير موجودة: ' + summary.lectureId);
      }
    });
  });
});

const stats = DLP.store.stats();
console.log('\n▶ ملخص المحتوى');
console.log('  المواد: ' + stats.subjects + ' | المحاضرات: ' + stats.lectures +
            ' | الملخصات: ' + stats.summaries + ' | الواجبات: ' + stats.assignments +
            ' | الاختبارات: ' + stats.quizzes + ' | الأسئلة: ' + stats.questions);
console.log('  عناصر فهرس البحث: ' + DLP.search.getIndex().length);

console.log('\n' + '─'.repeat(52));
if (problems.length) {
  console.log('فشل التحقق (' + problems.length + '):');
  problems.forEach((p) => console.log(' - ' + p));
  process.exit(1);
}
console.log('التحقق ناجح ✓ — المشروع جاهز للنشر');
