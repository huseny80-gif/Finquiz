/* إدارة تحديثات/إعلانات مادة واحدة (CRUD) — إعداد رقيق فوق مصنع admin/crud-page.js. */
(function (global) {
  'use strict';
  var DLP = global.DLP = global.DLP || {};

  DLP.adminUpdatesView = DLP.adminCrud.createPage({
    table: 'updates',
    titleKey: 'admin.hub.updates',
    orderColumn: 'date',
    fields: [
      { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
      { name: 'type', labelKey: 'admin.field.type', type: 'text' },
      { name: 'date', labelKey: 'admin.field.date', type: 'date' },
      { name: 'body', labelKey: 'admin.field.body', type: 'textarea' }
    ],
    rowLabel: function (row) { return row.title; },
    childrenChecks: []
  });

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminUpdatesView; }
})(typeof window !== 'undefined' ? window : globalThis);
