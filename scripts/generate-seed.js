/* يولّد supabase/seed/course2.sql من بيانات data/subjects/*.js الحالية.
 * تشغيل: node scripts/generate-seed.js > supabase/seed/course2.sql
 * لا يعدّل أي ملف مصدر — قراءة فقط، توليد SQL فقط. */
'use strict';

const { loadPlatform } = require('../tests/harness');
const DLP = loadPlatform();

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function num(v) {
  return (v === null || v === undefined || v === '') ? 'NULL' : Number(v);
}
function bool(v) {
  return v ? 'TRUE' : 'FALSE';
}
function json(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
}
function dateVal(v) {
  return v ? esc(v) : 'NULL';
}

const lines = [];
function insert(table, cols, rows) {
  if (!rows.length) return;
  lines.push(`-- ===SPLIT:${table}===`);
  lines.push(`insert into ${table} (${cols.join(', ')}) values`);
  lines.push(rows.map((r) => '  (' + r.join(', ') + ')').join(',\n') + '\nON CONFLICT (id) DO NOTHING;\n');
}

lines.push('-- ============================================================================');
lines.push('-- course2.sql — بذرة بيانات الكورس الثاني، مولّدة تلقائياً من data/subjects/*.js');
lines.push('-- عبر scripts/generate-seed.js. لا تُحرَّر يدوياً — أعد التوليد بدلاً من ذلك.');
lines.push('-- ============================================================================\n');

insert('courses', ['id', 'title', 'number', 'status'], [
  [esc('course-2'), esc('الدبلوم العالي المهني في القيادة الرقمية — الكورس الثاني'), num(2), esc('published')]
]);

const subjectRows = [];
const lectureRows = [];
const summaryRows = [];
const assignmentRows = [];
const quizRows = [];
const questionRows = [];
const optionRows = [];
const pairRows = [];
const itemRows = [];
const referenceRows = [];
const resourceRows = [];
const updateRows = [];
const fileRows = [];

function pushFile(subjectId, lectureId, summaryId, assignmentId, f) {
  if (!f || !f.url) return;
  fileRows.push([
    esc(subjectId), lectureId ? esc(lectureId) : 'NULL', summaryId ? esc(summaryId) : 'NULL',
    assignmentId ? esc(assignmentId) : 'NULL', esc(f.label || f.type || 'file'), esc(f.type || null),
    esc(f.label || null), 'NULL', esc(f.url), 'NULL', 'NULL', esc('published')
  ]);
}

DLP.store.subjects().forEach((subject) => {
  subjectRows.push([
    esc(subject.id), esc('course-2'), num(subject.order || 0), esc(subject.title),
    esc(subject.shortTitle || null), esc(subject.icon || null), esc(subject.accent || null),
    esc(subject.status || 'published'), esc(subject.description || null)
  ]);

  DLP.store.list(subject, 'lectures').forEach((l) => {
    lectureRows.push([
      esc(l.id), esc(subject.id), num(l.number || null), esc(l.title), dateVal(l.date),
      esc(l.status || 'published'), bool(!!l.demo), esc(l.description || null), json(l.objectives || [])
    ]);
    (l.files || []).forEach((f) => pushFile(subject.id, l.id, null, null, f));
  });

  DLP.store.list(subject, 'summaries').forEach((s) => {
    summaryRows.push([
      esc(s.id), esc(subject.id), s.lectureId ? esc(s.lectureId) : 'NULL', esc(s.title), dateVal(s.date),
      esc(s.status || 'published'), bool(!!s.demo), json(s.keyPoints || []), json(s.concepts || []), json(s.terms || [])
    ]);
    (s.files || []).forEach((f) => pushFile(subject.id, null, s.id, null, f));
  });

  DLP.store.list(subject, 'assignments').forEach((a) => {
    assignmentRows.push([
      esc(a.id), esc(subject.id), esc(a.title), esc(a.difficulty || null), dateVal(a.date), dateVal(a.due),
      esc(a.status || 'published'), bool(!!a.demo), esc(a.description || null)
    ]);
    (a.files || []).forEach((f) => pushFile(subject.id, null, null, a.id, f));
  });

  DLP.store.list(subject, 'quizzes').forEach((q) => {
    quizRows.push([
      esc(q.id), esc(subject.id), esc(q.title), esc(q.status || 'published'), bool(!!q.demo), esc(q.description || null)
    ]);

    (q.questions || []).forEach((question) => {
      let answerJson = 'NULL';
      if (question.type === 'mcq') answerJson = json(question.answer);
      else if (question.type === 'tf') answerJson = json(!!question.answer);
      else if (question.type === 'fill') answerJson = json(Array.isArray(question.answer) ? question.answer : [question.answer]);

      questionRows.push([
        esc(question.id), esc(q.id), question.lectureId ? esc(question.lectureId) : 'NULL',
        esc(question.type), esc(question.difficulty || null), esc(question.prompt),
        esc(question.kind || null), esc(question.explanation || null), answerJson,
        question.rubric ? json(question.rubric) : 'NULL', esc('published')
      ]);

      if (question.type === 'mcq' && Array.isArray(question.options)) {
        question.options.forEach((label, i) => {
          optionRows.push([esc(question.id), num(i), esc(label), bool(i === question.answer)]);
        });
      }
      if (question.type === 'match' && Array.isArray(question.pairs)) {
        question.pairs.forEach((pair, i) => {
          pairRows.push([esc(question.id), num(i), esc(pair.left), esc(pair.right)]);
        });
      }
      if (question.type === 'order' && Array.isArray(question.items)) {
        question.items.forEach((item, i) => {
          itemRows.push([esc(question.id), num(i), esc(item)]);
        });
      }
    });
  });

  DLP.store.list(subject, 'references').forEach((r) => {
    referenceRows.push([
      esc(r.id), esc(subject.id), esc(r.type || null), esc(r.status || 'published'), bool(!!r.demo),
      esc(r.title || null), esc(r.author || null), num(r.year || null), esc(r.publisher || null),
      esc(r.url || null), esc(r.note || null)
    ]);
  });

  DLP.store.list(subject, 'resources').forEach((res) => {
    resourceRows.push([
      esc(res.id), esc(subject.id), esc(res.type || null), esc(res.title || null), dateVal(res.date),
      esc(res.url || null), esc(res.status || 'published'), bool(!!res.demo)
    ]);
  });

  DLP.store.list(subject, 'updates').forEach((u) => {
    updateRows.push([
      esc(u.id), esc(subject.id), dateVal(u.date), esc(u.type || null), esc(u.title || null),
      esc(u.body || null), esc(u.status || 'published'), bool(!!u.demo)
    ]);
  });
});

insert('subjects', ['id', 'course_id', '"order"', 'title', 'short_title', 'icon', 'accent', 'status', 'description'], subjectRows);
insert('lectures', ['id', 'subject_id', 'number', 'title', 'date', 'status', 'demo', 'description', 'objectives'], lectureRows);
insert('summaries', ['id', 'subject_id', 'lecture_id', 'title', 'date', 'status', 'demo', 'key_points', 'concepts', 'terms'], summaryRows);
insert('assignments', ['id', 'subject_id', 'title', 'difficulty', 'date', 'due', 'status', 'demo', 'description'], assignmentRows);
insert('quizzes', ['id', 'subject_id', 'title', 'status', 'demo', 'description'], quizRows);
insert('questions', ['id', 'quiz_id', 'lecture_id', 'type', 'difficulty', 'prompt', 'kind', 'explanation', 'answer', 'rubric', 'status'], questionRows);
insert('question_options', ['question_id', 'position', 'label', 'is_correct'], optionRows);
insert('question_pairs', ['question_id', 'position', 'left_text', 'right_text'], pairRows);
insert('question_items', ['question_id', 'position', 'item_text'], itemRows);
insert('"references"', ['id', 'subject_id', 'type', 'status', 'demo', 'title', 'author', 'year', 'publisher', 'url', 'note'], referenceRows);
insert('resources', ['id', 'subject_id', 'type', 'title', 'date', 'url', 'status', 'demo'], resourceRows);
insert('updates', ['id', 'subject_id', 'date', 'type', 'title', 'body', 'status', 'demo'], updateRows);
insert('files', ['subject_id', 'lecture_id', 'summary_id', 'assignment_id', 'name', 'type', 'label', 'storage_path', 'public_url', 'size', 'mime_type', 'status'], fileRows);

process.stdout.write(lines.join('\n') + '\n');

process.stderr.write(
  `-- تحقّق: subjects=${subjectRows.length} lectures=${lectureRows.length} summaries=${summaryRows.length} ` +
  `assignments=${assignmentRows.length} quizzes=${quizRows.length} questions=${questionRows.length} ` +
  `options=${optionRows.length} pairs=${pairRows.length} items=${itemRows.length} ` +
  `references=${referenceRows.length} resources=${resourceRows.length} updates=${updateRows.length} files=${fileRows.length}\n`
);
