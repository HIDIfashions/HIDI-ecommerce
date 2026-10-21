import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { probe } from './probes.mjs';
import { foundationProbe } from '../seo-foundation/browser.mjs';
import publishedImages from './published-product-images.json' with {type:'json'};

const root = resolve(process.env.HIDI_CANDIDATE_RUNTIME);
const products = Array.from({ length: 3 }, (_, i) => ({
  id: 'bag-fixture-' + i, slug: 'bag-fixture-style-' + i, name: 'Bag catalogue fixture ' + (i + 1),
  status: 'ACTIVE', description: 'Read-only catalogue fixture.', shortDescription: 'Fixture.', fabric: 'Cotton', care: 'Fixture care',
  category: { id: 'fixture-category', name: 'Casual Wear', slug: 'casual-wear' }, collections: [], images: [{url:'https://hidiindia.com'+publishedImages[i]}],
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
const priorReserve=createServer();await new Promise(done=>priorReserve.listen(0,'127.0.0.1',done));
const priorPort=priorReserve.address().port;await new Promise(done=>priorReserve.close(done));
const priorRoot=resolve(root,'../base-app');
const priorRuntime=spawn(process.execPath,[join(priorRoot,'server.mjs')],{cwd:priorRoot,env:{...process.env,PORT:String(priorPort),STOREFRONT_ORIGIN:'http://127.0.0.1:3001',API_URL:api,INTERNAL_API_URL:api},stdio:['ignore','pipe','pipe']});
priorRuntime.stdout.on('data',c=>logs+=c);priorRuntime.stderr.on('data',c=>logs+=c);
const priorBase='http://127.0.0.1:'+priorPort;

const bodyEvidencePath = 'evidence/seo-discovery/body-preservation.json';
const forwardedHeaders = {
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'x-forwarded-host': 'hidiindia.com',
  'x-forwarded-proto': 'https',
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const firstDifference = (left, right) => {
  const shared = Math.min(left.length, right.length);
  let offset = 0;
  while (offset < shared && left[offset] === right[offset]) offset++;
  if (offset === shared && left.length === right.length) return null;
  const start = Math.max(0, offset - 80), end = offset + 80;
  return {
    offset,
    priorSnippet: left.subarray(start, Math.min(left.length, end)).toString('utf8'),
    candidateSnippet: right.subarray(start, Math.min(right.length, end)).toString('utf8'),
  };
};
const sampleBody = async (origin, route) => {
  const response = await fetch(origin + route, { headers: forwardedHeaders });
  const document = Buffer.from(await response.arrayBuffer());
  const marker = document.indexOf(Buffer.from('</head>'));
  assert.equal(response.status, 200, `${route} must return HTTP 200`);
  assert(marker >= 0, `${route} must contain </head>`);
  const body = document.subarray(marker + Buffer.byteLength('</head>'));
  return { body, status: response.status, length: body.length, sha256: sha256(body) };
};
const compareRetainedBodies = async () => {
  const report = { passed: false, readOnly: true, sampleCount: 3, routes: [] };
  for (const route of ['/', '/privacy']) {
    const prior = [], candidate = [];
    for (let i = 0; i < report.sampleCount; i++) {
      prior.push(await sampleBody(priorBase, route));
      candidate.push(await sampleBody(base, route));
    }
    const priorStable = prior.every(sample => sample.sha256 === prior[0].sha256 && sample.length === prior[0].length);
    const candidateStable = candidate.every(sample => sample.sha256 === candidate[0].sha256 && sample.length === candidate[0].length);
    const difference = firstDifference(prior[0].body, candidate[0].body);
    report.routes.push({
      route,
      status: { prior: prior[0].status, candidate: candidate[0].status },
      prior: { sha256: prior[0].sha256, length: prior[0].length, samples: prior.map(({ sha256, length }) => ({ sha256, length })) },
      candidate: { sha256: candidate[0].sha256, length: candidate[0].length, samples: candidate.map(({ sha256, length }) => ({ sha256, length })) },
      priorStable,
      candidateStable,
      exactMatch: difference === null,
      firstDifference: difference,
    });
  }
  report.passed = report.routes.every(route => route.priorStable && route.candidateStable && route.exactMatch);
  await mkdir('evidence/seo-discovery', { recursive: true });
  await writeFile(bodyEvidencePath, JSON.stringify(report, null, 2) + '\n');
  assert(report.passed, `Retained public body comparison failed; see ${bodyEvidencePath}`);
};
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/collections/all')).ok && (await fetch(priorBase+'/about')).ok) { ready = true; break; } } catch {}
    if (runtime.exitCode !== null) throw new Error('Candidate exited: ' + logs.slice(-2000));
    await new Promise(done => setTimeout(done, 200));
  }
  assert(ready, 'Actual candidate must become ready');
  await compareRetainedBodies();
  await probe(base, 'evidence/seo-discovery/candidate');
  await foundationProbe(base,'evidence/seo-discovery/foundation-candidate',{baseline:priorBase});
  assert(reads.length > 0, 'Catalogue regression must reach read-only fixture');
  assert.deepEqual(writes, []);
} catch (error) { console.error(logs.slice(-2000)); throw error; }
finally {
  priorRuntime.kill('SIGTERM');
  runtime.kill('SIGTERM');
  await new Promise(done => { if (runtime.exitCode !== null) return done(); runtime.once('exit', done); setTimeout(() => { runtime.kill('SIGKILL'); done(); }, 5000).unref(); });
  upstream.closeAllConnections(); await new Promise(done => upstream.close(done));
}

