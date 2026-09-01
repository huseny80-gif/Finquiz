/* بيئة تشغيل خفيفة تحمّل ملفات المنصة في Node لاختبارها بلا متصفح وبلا اعتماديات. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'data/config/site.js',
  'data/config/strings.js',
  'data/config/contact.js',
  'data/config/about.js',
  'data/subjects/index.js',
  'data/subjects/ai-data.js',
  'data/subjects/legal-regulatory.js',
  'data/subjects/cybersecurity-governance.js',
  'data/subjects/innovation-project-management.js',
  'data/subjects/risk-management.js',
  'assets/js/core/utils.js',
  'assets/js/core/i18n.js',
  'assets/js/core/store.js',
  'assets/js/core/search.js',
  'assets/js/core/quiz.js',
  'assets/js/core/router.js'
];

function loadPlatform() {
  const sandbox = { console, location: { hash: '' }, addEventListener() {}, document: null };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  FILES.forEach((file) => {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  });
  return sandbox.DLP;
}

module.exports = { loadPlatform, ROOT, FILES };
