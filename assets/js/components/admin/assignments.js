/* إدارة واجبات مادة واحدة (CRUD) — إعداد رقيق فوق مصنع admin/crud-page.js. */
(function (global) {
  'use strict';
  var DLP = global.DLP = global.DLP || {};

  DLP.adminAssignmentsView = DLP.adminCrud.createPage({
    table: 'assignments',
    titleKey: 'admin.hub.assignments',
    fields: [
      { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
      { name: 'difficulty', labelKey: 'admin.field.difficulty', type: 'text' },
      { name: 'date', labelKey: 'admin.field.date', type: 'date' },
      { name: 'due', labelKey: 'admin.field.due', type: 'date' },
      { name: 'description', labelKey: 'admin.field.description', type: 'textarea' }
    ],
    rowLabel: function (row) { return row.title; },
    childrenChecks: [{ table: 'files', fk: 'assignment_id' }]
  });

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminAssignmentsView; }
})(typeof window !== 'undefined' ? window : globalThis);
