/* طبقة البيانات: الوصول للمواد وتصفية الحالة وحساب الإحصائيات. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};

  var SECTIONS = [
    { key: 'lectures',    labelKey: 'section.lectures',    icon: '🎓', num: '01' },
    { key: 'summaries',   labelKey: 'section.summaries',   icon: '📝', num: '02' },
    { key: 'assignments', labelKey: 'section.assignments', icon: '✏️', num: '03' },
    { key: 'quizzes',     labelKey: 'section.quizzes',     icon: '❓', num: '04' },
    { key: 'references',  labelKey: 'section.references',  icon: '📚', num: '05' },
    { key: 'resources',   labelKey: 'section.resources',   icon: '📁', num: '06' },
    { key: 'updates',     labelKey: 'section.updates',     icon: '📣', num: '07' }
  ];

  function visibleStatuses() {
    var site = (DLP.config && DLP.config.site) || {};
    return site.visibleStatuses || ['published'];
  }

  function isVisible(item) {
    if (!item) { return false; }
    var status = item.status || 'published';
    return visibleStatuses().indexOf(status) !== -1;
  }

  function list(subject, sectionKey) {
    if (!subject || !Array.isArray(subject[sectionKey])) { return []; }
    return subject[sectionKey].filter(isVisible);
  }

  /** كل المواد المنشورة بالترتيب المحدّد في data/subjects/index.js */
  function subjects() {
    var data = DLP.data || {};
    var order = DLP.subjectOrder || Object.keys(data);
    return order
      .map(function (id) { return data[id]; })
      .filter(function (s) { return !!s && isVisible(s); })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function getSubject(id) {
    var found = subjects().filter(function (s) { return s.id === id; });
    return found.length ? found[0] : null;
  }

  function countQuestions(subject) {
    return list(subject, 'quizzes').reduce(function (sum, quiz) {
      return sum + (Array.isArray(quiz.questions) ? quiz.questions.length : 0);
    }, 0);
  }

  /** عدّاد محتوى المادة لكل قسم + الإجمالي. */
  function subjectCounts(subject) {
    var counts = {};
    SECTIONS.forEach(function (section) { counts[section.key] = list(subject, section.key).length; });
    counts.questions = countQuestions(subject);
    counts.total = counts.lectures + counts.summaries + counts.assignments +
                   counts.quizzes + counts.references + counts.resources;
    return counts;
  }

  /** إحصائيات المنصة — محسوبة من البيانات وليست مكتوبة يدوياً. */
  function stats() {
    var all = subjects();
    var totals = { subjects: all.length, lectures: 0, summaries: 0, assignments: 0, quizzes: 0, questions: 0 };
    all.forEach(function (subject) {
      var counts = subjectCounts(subject);
      totals.lectures += counts.lectures;
      totals.summaries += counts.summaries;
      totals.assignments += counts.assignments;
      totals.quizzes += counts.quizzes;
      totals.questions += counts.questions;
    });
    return totals;
  }

  /** آخر التحديثات عبر كل المواد. */
  function latestUpdates(limit) {
    var all = [];
    subjects().forEach(function (subject) {
      list(subject, 'updates').forEach(function (update) {
        all.push({ subject: subject, update: update });
      });
    });
    all.sort(function (a, b) { return String(b.update.date || '').localeCompare(String(a.update.date || '')); });
    return typeof limit === 'number' ? all.slice(0, limit) : all;
  }

  function findQuiz(subject, quizId) {
    var found = list(subject, 'quizzes').filter(function (q) { return q.id === quizId; });
    return found.length ? found[0] : null;
  }

  DLP.store = {
    SECTIONS: SECTIONS,
    isVisible: isVisible,
    list: list,
    subjects: subjects,
    getSubject: getSubject,
    subjectCounts: subjectCounts,
    countQuestions: countQuestions,
    stats: stats,
    latestUpdates: latestUpdates,
    findQuiz: findQuiz
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.store; }
})(typeof window !== 'undefined' ? window : globalThis);
