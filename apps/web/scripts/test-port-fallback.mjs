import assert from 'node:assert/strict';
import http from 'node:http';
import { listenAvailable } from './local-server.mjs';
import { readFile } from 'node:fs/promises';

const blocker = http.createServer((req, res) => res.end('original server'));
const preview = http.createServer((req, res) => res.end('new preview'));
const close = (server) => new Promise((resolve) => server.close(resolve));
try {
  const busy = await listenAvailable(blocker, { port: 0 });
  const retries = [];
  const selected = await listenAvailable(preview, { port: busy, onRetry: (port) => retries.push(port) });
  assert.ok(selected > busy);
  assert.equal(retries[0], busy);
  assert.equal(await (await fetch(`http://127.0.0.1:${busy}/`)).text(), 'original server');
  assert.equal(await (await fetch(`http://127.0.0.1:${selected}/`)).text(), 'new preview');
  const vite = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.equal((vite.match(/strictPort:\s*false/g) || []).length, 2);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(!pkg.scripts.dev.includes('--strictPort'));
  assert.ok(!pkg.scripts.dev.includes('--force'));
  console.log('PASS: occupied-port fallback; original process untouched; Vite dev/preview strictPort disabled.');
} finally {
  await Promise.all([close(preview), close(blocker)]);
}
