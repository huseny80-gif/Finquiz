/* إدارة محاضرات مادة واحدة (CRUD) — إعداد رقيق فوق مصنع admin/crud-page.js. */
(function (global) {
  'use strict';
  var DLP = global.DLP = global.DLP || {};

  DLP.adminLecturesView = DLP.adminCrud.createPage({
    table: 'lectures',
    titleKey: 'admin.hub.lectures',
    orderColumn: 'number',
    fields: [
      { name: 'number', labelKey: 'admin.field.number', type: 'number', required: true },
      { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
      { name: 'date', labelKey: 'admin.field.date', type: 'date' },
      { name: 'description', labelKey: 'admin.field.description', type: 'textarea' },
      { name: 'objectives', labelKey: 'admin.field.objectives', type: 'lines' }
    ],
    rowLabel: function (row) { return row.title; },
    childrenChecks: [
      { table: 'summaries', fk: 'lecture_id' },
      { table: 'files', fk: 'lecture_id' }
    ]
  });

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminLecturesView; }
})(typeof window !== 'undefined' ? window : globalThis);
