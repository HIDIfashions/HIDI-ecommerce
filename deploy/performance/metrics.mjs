import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sendBuffer } from './delivery.mjs';

const routes = new Set(['home', 'collection', 'product', 'information']);
const thresholds = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25] };
export function validateMetric(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'device,name,route,value') return false;
  return routes.has(value.route) && ['mobile', 'desktop'].includes(value.device)
    && Object.hasOwn(thresholds, value.name) && typeof value.value === 'number'
    && Number.isFinite(value.value) && value.value >= 0 && value.value <= (value.name === 'CLS' ? 10 : 120000);
}

// Bounded in-memory aggregates only: no cookies, IPs, metric IDs, URLs or users.
export function createPerformanceHandler({ origin, root, assetRoot = new URL('./public/', import.meta.url), log = value => console.log(JSON.stringify(value)) }) {
  const assets = new Map();
  const add = (path, source, type) => {
    const body = readFileSync(source), version = createHash('sha256').update(body).digest('hex').slice(0, 12);
    assets.set(path, { body, type, version }); return path + '?v=' + version;
  };
  const links = add('/privacy-policy-assets/links.js', new URL('../privacy-policy/links.js', import.meta.url), 'text/javascript; charset=utf-8');
  const logo = add('/brand/hidi-logo-header.svg', new URL('logo.svg', assetRoot), 'image/svg+xml');
  const rum = add('/performance/rum.js', new URL('rum.js', assetRoot), 'text/javascript; charset=utf-8');
  add('/performance/web-vitals.js', new URL('web-vitals.js', assetRoot), 'text/javascript; charset=utf-8');
  let counts = {}, accepted = 0, windowStart = Date.now();
  function flush() {
    if (accepted) log({ event: 'hidi-performance', windowSeconds: Math.round((Date.now() - windowStart) / 1000), samples: accepted, groups: counts });
    counts = {}; accepted = 0; windowStart = Date.now();
  }
  const timer = setInterval(flush, 300000); timer.unref();
  process.once('SIGTERM', flush); process.once('SIGINT', flush);
  return {
    links, logo, rum,
    async handle(request, response, pathname) {
      const url = new URL(request.url, 'http://localhost'), asset = assets.get(pathname);
      if (asset && url.searchParams.get('v') === asset.version && ['GET', 'HEAD'].includes(request.method)) {
        const etag = '"' + asset.version + '"';
        const status = request.headers['if-none-match']?.replace(/^W\//, '') === etag ? 304 : 200;
        sendBuffer(request, response, status, { 'content-type': asset.type, 'content-length': asset.body.length, etag, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }, asset.body); return true;
      }
      // Public collector is write-only. Browsing this endpoint exposes no metrics.
      if (pathname !== '/api/hidi/performance') return false;
      const reply = (status, body = '') => { response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'text/plain', 'content-length': Buffer.byteLength(body) }); response.end(body); };
      if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); reply(405); return true; }
      let sameOrigin = false;
      try { const from = new URL(request.headers.origin); sameOrigin = from.host === request.headers.host && !from.username && ['http:', 'https:'].includes(from.protocol); } catch {}
      if (!sameOrigin || request.headers['sec-fetch-site'] === 'cross-site') { request.resume(); reply(403); return true; }
      if (Number(request.headers['content-length'] || 0) > 512 || !/^text\/plain|^application\/json/.test(request.headers['content-type'] || '')) { request.resume(); reply(400); return true; }
      if (accepted >= 20000) { request.resume(); reply(429); return true; }
      let size = 0, body = '';
      for await (const chunk of request) { size += chunk.length; if (size > 512) { request.resume(); reply(400); return true; } body += chunk.toString(); }
      let value; try { value = JSON.parse(body); } catch { reply(400); return true; }
      if (!validateMetric(value)) { reply(400); return true; }
      const key = [value.route, value.device, value.name].join(':');
      const group = counts[key] ||= { count: 0, good: 0, needsImprovement: 0, poor: 0, sum: 0, max: 0 };
      const [good, poor] = thresholds[value.name]; group.count++; group.sum += value.value; group.max = Math.max(group.max, value.value);
      group[value.value <= good ? 'good' : value.value <= poor ? 'needsImprovement' : 'poor']++;
      accepted++; reply(204); return true;
    },
    flush,
  };
}
