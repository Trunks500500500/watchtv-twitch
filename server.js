// Servidor HTTP estático para TrunksTV — sin dependencias
// Uso:  node server.js         (puerto por defecto 3000)
//       PORT=8080 node server.js

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT         = process.env.PORT || 3000;
const HOST         = process.env.HOST || '0.0.0.0';
const ROOT         = __dirname;
const DEFAULT_FILE = 'reproductorTwitch.html';

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.htm':   'text/html; charset=utf-8',
  '.js':    'text/javascript; charset=utf-8',
  '.mjs':   'text/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.webp':  'image/webp',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.txt':   'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel     = urlPath === '/' ? DEFAULT_FILE : urlPath.replace(/^\/+/, '');
  const abs     = path.resolve(ROOT, rel);

  // Evita path traversal fuera de la raíz
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 — Prohibido');
  }

  fs.stat(abs, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — No encontrado');
    }
    const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type':  mime,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │            🎬  TrunksTV listo                │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log(`  │  Local:  http://localhost:${PORT}              │`);
  console.log(`  │  Red:    http://<tu-ip-lan>:${PORT}            │`);
  console.log('  │                                             │');
  console.log('  │  Ctrl+C para detener                        │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
});
