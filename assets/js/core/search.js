/* محرّك البحث الداخلي: يبني فهرساً من طبقة البيانات ويبحث في كل أنواع المحتوى. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};

  var TYPE_LABELS = {
    lecture: 'محاضرة', summary: 'ملخص', assignment: 'واجب',
    question: 'سؤال', reference: 'مرجع', resource: 'ملف', update: 'تحديث'
  };

  var index = null;

  function push(entries, entry) { entries.push(entry); }

  function buildIndex() {
    var store = DLP.store;
    var entries = [];

    store.subjects().forEach(function (subject) {
      var base = { subjectId: subject.id, subjectTitle: subject.title, subjectIcon: subject.icon };

      store.list(subject, 'lectures').forEach(function (item) {
        push(entries, Object.assign({}, base, {
          type: 'lecture', id: item.id, title: 'المحاضرة ' + item.number + ' — ' + item.title,
          body: [item.description].concat(item.objectives || []).join(' '),
          route: '#/subject/' + subject.id + '/lectures', anchor: item.id, date: item.date
        }));
      });

      store.list(subject, 'summaries').forEach(function (item) {
        push(entries, Object.assign({}, base, {
          type: 'summary', id: item.id, title: item.title,
          body: (item.keyPoints || []).concat(
            (item.concepts || []).map(function (c) { return c.term + ' ' + c.definition; }),
            item.terms || []
          ).join(' '),
          route: '#/subject/' + subject.id + '/summaries', anchor: item.id, date: item.date
        }));
      });

      store.list(subject, 'assignments').forEach(function (item) {
        push(entries, Object.assign({}, base, {
          type: 'assignment', id: item.id, title: item.title, body: item.description,
          route: '#/subject/' + subject.id + '/assignments', anchor: item.id, date: item.date
        }));
      });

      store.list(subject, 'quizzes').forEach(function (quiz) {
        (quiz.questions || []).forEach(function (question) {
          push(entries, Object.assign({}, base, {
            type: 'question', id: question.id, title: question.prompt,
            body: [question.explanation].concat(question.options || []).join(' '),
            route: '#/subject/' + subject.id + '/quizzes', anchor: quiz.id, date: null
          }));
        });
      });

      store.list(subject, 'references').forEach(function (item) {
        push(entries, Object.assign({}, base, {
          type: 'reference', id: item.id, title: item.title,
          body: [item.author, item.publisher, item.note].filter(Boolean).join(' '),
          route: '#/subject/' + subject.id + '/references', anchor: item.id, date: null
        }));
      });

      store.list(subject, 'resources').forEach(function (item) {
        push(entries, Object.assign({}, base, {
          type: 'resource', id: item.id, title: item.title, body: item.type,
          route: '#/subject/' + subject.id + '/resources', anchor: item.id, date: item.date
        }));
      });

      store.list(subject, 'updates').forEach(function (item) {
        push(entries, Object.assign({}, base, {
          type: 'update', id: item.id, title: item.title, body: item.body,
          route: '#/subject/' + subject.id + '/updates', anchor: item.id, date: item.date
        }));
      });
    });

    entries.forEach(function (entry) {
      entry.haystack = DLP.utils.normalizeArabic(entry.title + ' ' + (entry.body || '') + ' ' + entry.subjectTitle);
      entry.typeLabel = TYPE_LABELS[entry.type] || entry.type;
    });

    return entries;
  }

  function getIndex() {
    if (!index) { index = buildIndex(); }
    return index;
  }

  function reset() { index = null; }

  /** بحث بكل كلمات الاستعلام (AND) مع ترتيب بسيط حسب موضع التطابق. */
  function query(text, options) {
    var opts = options || {};
    var normalized = DLP.utils.normalizeArabic(text);
    if (!normalized) { return []; }
    var words = normalized.split(' ').filter(Boolean);

    var results = getIndex().filter(function (entry) {
      if (opts.subjectId && entry.subjectId !== opts.subjectId) { return false; }
      if (opts.type && entry.type !== opts.type) { return false; }
      return words.every(function (word) { return entry.haystack.indexOf(word) !== -1; });
    });

    results.sort(function (a, b) {
      var aTitle = DLP.utils.normalizeArabic(a.title).indexOf(words[0]);
      var bTitle = DLP.utils.normalizeArabic(b.title).indexOf(words[0]);
      var aScore = aTitle === -1 ? 1000 : aTitle;
      var bScore = bTitle === -1 ? 1000 : bTitle;
      return aScore - bScore;
    });

    return typeof opts.limit === 'number' ? results.slice(0, opts.limit) : results;
  }

  DLP.search = { buildIndex: buildIndex, getIndex: getIndex, reset: reset, query: query, TYPE_LABELS: TYPE_LABELS };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.search; }
})(typeof window !== 'undefined' ? window : globalThis);
