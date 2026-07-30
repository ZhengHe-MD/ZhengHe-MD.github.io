#!/usr/bin/env node
// Local Development Server with Watch & Auto-Reload (Live Reload)
//
// Usage: node scripts/dev.mjs [--port 8901]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');

const portArgIdx = process.argv.indexOf('--port');
const PORT = portArgIdx !== -1 ? parseInt(process.argv[portArgIdx + 1], 10) : 8901;

// 1. Initial build
build({ verbose: true });

// Connected SSE clients for Live Reload
const clients = new Set();

function notifyReload() {
  for (const client of clients) {
    client.write('data: reload\n\n');
  }
}

// 2. Watcher with debounce
let rebuildTimer = null;
const IGNORED_PATHS = new Set(['_site', '.git', 'node_modules', '.DS_Store']);

fs.watch(ROOT, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  const parts = filename.split(path.sep);
  if (parts.some((p) => IGNORED_PATHS.has(p) || p.startsWith('.'))) return;

  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    console.log(`\n[dev] Change detected in ${filename}. Rebuilding...`);
    try {
      build({ verbose: false });
      console.log(`[dev] Rebuilt successfully. Triggering page reload...`);
      notifyReload();
    } catch (err) {
      console.error(`[dev] Build error:`, err.message);
    }
  }, 100);
});

// MIME types lookup
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const LIVE_RELOAD_SCRIPT = `
<script>
  (() => {
    const es = new EventSource('/__livereload');
    es.onmessage = () => {
      console.log('[live-reload] File changed. Reloading page...');
      location.reload();
    };
    es.onerror = () => {
      setTimeout(() => location.reload(), 2000);
    };
  })();
</script>
`;

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // SSE endpoint
  if (urlPath === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Resolve static file path in _site
  let safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(OUT, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const page404 = path.join(OUT, '404.html');
    if (fs.existsSync(page404)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(page404));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  if (ext === '.html') {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('</body>')) {
      content = content.replace('</body>', `${LIVE_RELOAD_SCRIPT}\n</body>`);
    } else {
      content += LIVE_RELOAD_SCRIPT;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } else {
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Dev server with Auto-Reload running at: http://localhost:${PORT}/\n`);
});
