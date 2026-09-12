/* إدارة بيانات اختبارات مادة واحدة (عنوان/وصف/حالة فقط) — إدارة الأسئلة نفسها
 * منفصلة في admin/questions.js عبر رابط "إدارة الأسئلة" في كل صفّ. */
(function (global) {
  'use strict';
  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };

  DLP.adminQuizzesView = DLP.adminCrud.createPage({
    table: 'quizzes',
    titleKey: 'admin.hub.quizzes',
    fields: [
      { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
      { name: 'description', labelKey: 'admin.field.description', type: 'textarea' }
    ],
    rowLabel: function (row) { return row.title; },
    childrenChecks: [{ table: 'questions', fk: 'quiz_id' }],
    extraRowActions: function (row) {
      return '<a class="btn btn-ghost btn-sm" href="#/admin/quiz/' + esc(row.id) + '">📝 ' + esc(t('admin.viewQuestions')) + '</a>';
    }
  });

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminQuizzesView; }
})(typeof window !== 'undefined' ? window : globalThis);
