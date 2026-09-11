/* إدارة مراجع مادة واحدة (CRUD) — إعداد رقيق فوق مصنع admin/crud-page.js. */
(function (global) {
  'use strict';
  var DLP = global.DLP = global.DLP || {};

  DLP.adminReferencesView = DLP.adminCrud.createPage({
    table: 'references',
    titleKey: 'admin.hub.references',
    fields: [
      { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
      { name: 'type', labelKey: 'admin.field.type', type: 'text' },
      { name: 'author', labelKey: 'admin.field.author', type: 'text' },
      { name: 'year', labelKey: 'admin.field.year', type: 'number' },
      { name: 'publisher', labelKey: 'admin.field.publisher', type: 'text' },
      { name: 'url', labelKey: 'admin.field.url', type: 'text' },
      { name: 'note', labelKey: 'admin.field.note', type: 'textarea' }
    ],
    rowLabel: function (row) { return row.title; },
    childrenChecks: []
  });

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminReferencesView; }
})(typeof window !== 'undefined' ? window : globalThis);
