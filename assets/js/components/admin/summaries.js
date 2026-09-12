/* إدارة ملخصات مادة واحدة (CRUD) — إعداد رقيق فوق مصنع admin/crud-page.js.
 * ربط الملخص بمحاضرة (lecture_id) حقل نصّي حرّ (معرّف المحاضرة كما يظهر في
 * صفحة إدارة المحاضرات) بدل قائمة منسدلة حيّة — يبقي المصنع العام بسيطاً؛
 * معرّف خاطئ يُرفَض بوضوح من قيد المفتاح الأجنبي في القاعدة (خطأ حفظ صريح،
 * لا حفظ صامت لبيانات غير متّسقة). */
(function (global) {
  'use strict';
  var DLP = global.DLP = global.DLP || {};

  DLP.adminSummariesView = DLP.adminCrud.createPage({
    table: 'summaries',
    titleKey: 'admin.hub.summaries',
    fields: [
      { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
      { name: 'date', labelKey: 'admin.field.date', type: 'date' },
      { name: 'lecture_id', labelKey: 'admin.field.lecture', type: 'text', hintKey: 'admin.field.lectureHint' },
      { name: 'key_points', labelKey: 'admin.field.keyPoints', type: 'lines' },
      { name: 'concepts', labelKey: 'admin.field.concepts', type: 'concepts' },
      { name: 'terms', labelKey: 'admin.field.terms', type: 'lines' }
    ],
    rowLabel: function (row) { return row.title; },
    childrenChecks: [{ table: 'files', fk: 'summary_id' }]
  });

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminSummariesView; }
})(typeof window !== 'undefined' ? window : globalThis);
