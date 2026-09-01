/**
 * وسائل التواصل.
 * اترك القيمة null لإخفاء الوسيلة، أو ضع الرابط/العنوان الحقيقي لتفعيلها.
 * لا تضع روابط وهمية — العناصر غير المفعّلة تظهر كـ "قريباً" بدل رابط مكسور.
 */
(function (global) {
  'use strict';

  var CONTACT = {
    channels: [
      { id: 'phone',    label: 'اتصال مباشر',       icon: '📱', value: '+9647706003138', hrefPrefix: 'tel:' },
      { id: 'whatsapp', label: 'واتساب',            icon: '💬', value: '9647706003138', hrefPrefix: 'https://wa.me/' },
      { id: 'email',    label: 'البريد الإلكتروني', icon: '✉️', value: 'huseny80@gmail.com', hrefPrefix: 'mailto:' },
      { id: 'telegram', label: 'تيليجرام',          icon: '✈️', value: null, hrefPrefix: 'https://t.me/' },
      { id: 'linkedin', label: 'لينكدإن',           icon: '💼', value: null, hrefPrefix: '' },
      { id: 'facebook', label: 'فيسبوك',            icon: '📘', value: null, hrefPrefix: '' }
    ],
    // نص يظهر للزوّار أسفل وسائل التواصل. للمشرف: طريقة التفعيل موضّحة في README.md
    note: 'يمكن التواصل مباشرة عبر الاتصال أو واتساب أو البريد الإلكتروني أدناه.'
  };

  global.DLP = global.DLP || {};
  global.DLP.config = global.DLP.config || {};
  global.DLP.config.contact = CONTACT;

  if (typeof module !== 'undefined' && module.exports) { module.exports = CONTACT; }
})(typeof window !== 'undefined' ? window : globalThis);
