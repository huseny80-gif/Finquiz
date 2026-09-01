/**
 * فهرس المواد الدراسية — ترتيب ظهور المواد في المنصة.
 * لإضافة مادة جديدة: أنشئ ملف بياناتها في data/subjects/ ثم أضف معرّفها هنا
 * وأضف وسم <script> الخاص بها في index.html.
 */
(function (global) {
  'use strict';

  var ORDER = [
    'ai-data',
    'legal-regulatory',
    'cybersecurity-governance',
    'innovation-project-management',
    'risk-management'
  ];

  global.DLP = global.DLP || {};
  global.DLP.subjectOrder = ORDER;

  if (typeof module !== 'undefined' && module.exports) { module.exports = ORDER; }
})(typeof window !== 'undefined' ? window : globalThis);
