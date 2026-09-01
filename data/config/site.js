/**
 * إعدادات المنصة العامة.
 * عدّل هذا الملف لتغيير العناوين والنصوص الرئيسية دون لمس واجهة الموقع.
 */
(function (global) {
  'use strict';

  var SITE = {
    id: 'digital-leadership-course-2',
    brand: {
      name: 'منصة المواد الدراسية',
      logoText: 'د.ق',
      logoAlt: 'شعار منصة المواد الدراسية للدبلوم العالي المهني في القيادة الرقمية'
    },
    program: 'الدبلوم العالي المهني في القيادة الرقمية',
    course: 'مواد الكورس الثاني',
    courseNumber: 2,
    description:
      'منصة تعليمية رقمية تجمع مواد الكورس الثاني من الدبلوم العالي المهني في القيادة الرقمية ' +
      'في مكان واحد: محاضرات، ملخصات، تمارين وواجبات، أسئلة تفاعلية، مراجع، وملفات وموارد — ' +
      'منظّمة لكل مادة على حدة مع بحث شامل داخل المحتوى.',
    author: 'المهندس / حسين ياسين حسن',
    updatedYear: new Date().getFullYear(),
    /** أظهر فقط المحتوى بهذه الحالات (published | draft | archived). */
    visibleStatuses: ['published'],
    /** إظهار شارة توضح أن المحتوى تجريبي. */
    showDemoBadge: true,
    demoNotice:
      'تنبيه: العناصر التي تحمل شارة «محتوى تجريبي» هي أمثلة للعرض فقط ولا تُعتمد كمنهج دراسي. ' +
      'أما العناصر بلا شارة فهي محتوى المقرر الفعلي كما زُوّدت به المنصة.'
  };

  global.DLP = global.DLP || {};
  global.DLP.config = global.DLP.config || {};
  global.DLP.config.site = SITE;

  if (typeof module !== 'undefined' && module.exports) { module.exports = SITE; }
})(typeof window !== 'undefined' ? window : globalThis);
