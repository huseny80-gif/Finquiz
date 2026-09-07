/* يُطبَّق مبكراً (قبل رسم الهيكل) لتفادي وميض تبديل السمة عند التحميل.
   يقرأ تفضيل المستخدم المحفوظ، أو تفضيل نظام التشغيل عند غيابه. */
(function (global) {
  'use strict';
  try {
    var doc = global.document;
    var saved = global.localStorage.getItem('dlp.theme');
    var theme = (saved === 'dark' || saved === 'light') ? saved : null;
    if (!theme) {
      theme = (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    doc.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* التخزين المحلي قد يكون معطلاً — الافتراضي هو السمة الفاتحة */ }
})(typeof window !== 'undefined' ? window : globalThis);
