import http from 'node:http';
import { listenAvailable } from './local-server.mjs';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dependency-free server for the supplied compiled React snapshot.
// Source edits are served by Vite (npm run dev), not by this snapshot.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [path.join(project, 'offline-preview'), path.join(project, 'public')];
const port = Number(process.env.PORT || 4188);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.ico':'image/x-icon', '.svg':'image/svg+xml', '.webp':'image/webp',
  '.png':'image/png', '.jpg':'image/jpeg', '.mp4':'video/mp4', '.json':'application/json', '.webmanifest':'application/manifest+json' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    if (relative.includes('\0') || relative.includes('\\')) throw new Error('Invalid path');
    let file, info;
    for (const root of roots) {
      const candidate = path.resolve(root, relative);
      if (!candidate.startsWith(root + path.sep)) continue;
      try {
        const candidateInfo = await stat(candidate);
        if (candidateInfo.isFile()) { file = candidate; info = candidateInfo; break; }
      } catch { /* Try the other public root. */ }
    }
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache', 'Expires': '0', 'Accept-Ranges': 'bytes' };
    let start = 0, end = info.size - 1, status = 200;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!match) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else start = Number(match[1]);
      if (match[1] && match[2]) end = Math.min(Number(match[2]), end);
      if (!Number.isFinite(start) || start > end || start >= info.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    response.writeHead(status, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(file, { start, end }).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(400); response.end('Bad request'); }
});
try {
  const actualPort = await listenAvailable(server, { port,
    onRetry: (busyPort) => console.log(`Port ${busyPort} is occupied; trying the next local port…`),
  });
  console.log(`\nHIDI React offline preview: http://127.0.0.1:${actualPort}/\nOpen THIS address, not an older bookmark.\nPress Ctrl+C to stop.\nFor source editing, run npm install then npm run dev.\n`);
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
