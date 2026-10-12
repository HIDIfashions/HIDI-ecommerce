import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { probe } from './probes.mjs';

const root = resolve(process.env.HIDI_CANDIDATE_RUNTIME);
const products = Array.from({ length: 3 }, (_, i) => ({
  id: 'bag-fixture-' + i, slug: 'bag-fixture-style-' + i, name: 'Bag catalogue fixture ' + (i + 1),
  status: 'ACTIVE', description: 'Read-only catalogue fixture.', shortDescription: 'Fixture.', fabric: 'Cotton', care: 'Fixture care',
  category: { id: 'fixture-category', name: 'Casual Wear', slug: 'casual-wear' }, collections: [], images: [],
  minPricePaise: 100000 + i * 10000, maxPricePaise: 100000 + i * 10000, inStock: true,
  variants: [{ id: 'bag-variant-' + i, sku: 'FIXTURE-BAG-' + i, size: 'M', color: 'Pink', available: 4, pricePaise: 100000 + i * 10000, mrpPaise: 140000 }],
}));
const reads = [], writes = [];
const upstream = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture'), path = url.pathname.replace(/^\/v1/, '');
  const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (!['GET', 'HEAD'].includes(req.method)) { writes.push(path); return send(403, { message: 'Read-only fixture' }); }
  if (path.includes('/health')) return send(200, { status: 'ok' });
  if (path.startsWith('/carts/')) return send(200, { items: [], itemCount: 0, subtotalPaise: 0, shippingPaise: 0, totalPaise: 0 });
  if (path.includes('/reviews')) return send(200, { averageRating: 0, reviewCount: 0, verifiedReviewCount: 0, reviews: [], ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  if (/^\/products(?:\/(featured|best-sellers))?$/.test(path)) {
    reads.push(url.searchParams.get('category'));
    // Reproduce the actual bug: the obsolete collection has no members.
    return send(200, url.searchParams.get('category') === 'new-arrivals' ? [] : products);
  }
  if (path.startsWith('/products/')) {
    if (path.endsWith('/related')) return send(200, products.slice(1));
    const product = products.find(p => p.slug === decodeURIComponent(path.split('/')[2]));
    return send(product ? 200 : 404, product || {});
  }
  return send(401, { message: 'Authentication required' });
});
await new Promise(done => upstream.listen(0, '127.0.0.1', done));
const reserve = createServer(); await new Promise(done => reserve.listen(0, '127.0.0.1', done));
const port = reserve.address().port; await new Promise(done => reserve.close(done));
const api = 'http://127.0.0.1:' + upstream.address().port + '/v1';
const runtime = spawn(process.execPath, [join(root, 'server.mjs')], { cwd: root,
  env: { ...process.env, PORT: String(port), API_URL: api, INTERNAL_API_URL: api }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; runtime.stdout.on('data', c => logs += c); runtime.stderr.on('data', c => logs += c);
const base = 'http://127.0.0.1:' + port;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/collections/all')).ok) { ready = true; break; } } catch {}
    if (runtime.exitCode !== null) throw new Error('Candidate exited: ' + logs.slice(-2000));
    await new Promise(done => setTimeout(done, 200));
  }
  assert(ready, 'Actual candidate must become ready');
  await probe(base, 'evidence/seo-discovery/candidate');
  assert(reads.length > 0, 'Catalogue regression must reach read-only fixture');
  assert.deepEqual(writes, []);
} catch (error) { console.error(logs.slice(-2000)); throw error; }
finally {
  runtime.kill('SIGTERM');
  await new Promise(done => { if (runtime.exitCode !== null) return done(); runtime.once('exit', done); setTimeout(() => { runtime.kill('SIGKILL'); done(); }, 5000).unref(); });
  upstream.closeAllConnections(); await new Promise(done => upstream.close(done));
}

