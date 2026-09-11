/* إدارة موارد مادة واحدة (CRUD) — إعداد رقيق فوق مصنع admin/crud-page.js. */
(function (global) {
  'use strict';
  var DLP = global.DLP = global.DLP || {};

  DLP.adminResourcesView = DLP.adminCrud.createPage({
    table: 'resources',
    titleKey: 'admin.hub.resources',
    fields: [
      { name: 'title', labelKey: 'admin.field.title', type: 'text', required: true },
      { name: 'type', labelKey: 'admin.field.type', type: 'text' },
      { name: 'date', labelKey: 'admin.field.date', type: 'date' },
      { name: 'url', labelKey: 'admin.field.url', type: 'text' }
    ],
    rowLabel: function (row) { return row.title; },
    childrenChecks: []
  });

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.adminResourcesView; }
})(typeof window !== 'undefined' ? window : globalThis);
