/* خادم ثابت بسيط للتطوير المحلي: npm start ثم افتح http://localhost:8080 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  let requested = decodeURIComponent(req.url.split('?')[0]);
  if (requested === '/') { requested = '/index.html'; }
  const full = path.join(ROOT, path.normalize(requested).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('الملف غير موجود');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen(PORT, () => {
  console.log('المنصة تعمل على: http://localhost:' + PORT);
});
