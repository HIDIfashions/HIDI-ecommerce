import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { probe } from './probes.mjs';
import { foundationProbe } from '../seo-foundation/browser.mjs';
import { catalogueStatus } from '../pricing/model.mjs';
import publishedImages from './published-product-images.json' with {type:'json'};
import reviewedProductImages from './reviewed-product-image-map.json' with {type:'json'};
import bodyConfig from './body-preservation-config.json' with {type:'json'};
import { priorCollectionTitle, compareReviewedCollectionBodies, inspectCollectionBody } from './collection-body-delta.mjs';

const root = resolve(process.env.HIDI_CANDIDATE_RUNTIME);
const categories = [
  { id: 'fixture-work-wear', name: 'Work Wear', slug: 'work-wear' },
  { id: 'fixture-casual-wear', name: 'Casual Wear', slug: 'casual-wear' },
  { id: 'fixture-occasional-wear', name: 'Occasion Wear', slug: 'occasional-wear' },
  { id: 'fixture-ananyas-pick', name: 'Ananya\u2019s Pick', slug: 'ananyas-pick' },
];
const titleFromSlug = slug => slug.replace(/^(?:hidi|kur)-\d+-/, '').split('-')
  .map(word => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ');
const products = Object.entries(reviewedProductImages).map(([slug, reviewed], i) => {
  const category = categories[i % categories.length];
  const colour = ['Wine', 'Pink', 'Blue', 'Green'][i % 4];
  return {
    id: reviewed.id, slug, name: titleFromSlug(slug), status: 'ACTIVE',
    description: 'Read-only full-catalogue fixture for HIDI women\u2019s Indian wear.', shortDescription: 'Read-only HIDI catalogue fixture.',
    fabric: 'Cotton blend', care: 'Gentle hand wash', category, collections: [category],
    images: reviewed.paths.map(url => ({url:'https://hidiindia.com'+url})),
    minPricePaise: 119000, maxPricePaise: 119000, inStock: true,
    variants: ['S','M','L','XL'].map((size, variantIndex) => ({
      id: `${reviewed.id}-${size}`, sku: `FIXTURE-${String(i + 1).padStart(3, '0')}-${size}`,
      size, color: colour, available: variantIndex + 1, pricePaise: 119000, mrpPaise: 140000,
    })),
  };
});
const fixtureImagePaths = products.flatMap(product => product.images.map(image => new URL(image.url).pathname));
assert.equal(products.length, 54, 'Candidate uses every reviewed live product identity');
assert.equal(fixtureImagePaths.length, 238, 'Candidate uses every reviewed live product image association');
assert.equal(new Set(fixtureImagePaths).size, 238, 'Candidate image associations are unique');
assert.deepEqual([...fixtureImagePaths].sort(), [...publishedImages].sort(), 'Candidate image set matches the reviewed live image allowlist');
assert(catalogueStatus(products).ready, 'Read-only catalogue fixture must retain the live 15% price campaign');
const reads = [], writes = [];
const upstream = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture'), path = url.pathname.replace(/^\/v1/, '');
  const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (!['GET', 'HEAD'].includes(req.method)) { writes.push(path); return send(403, { message: 'Read-only fixture' }); }
  if (path.includes('/health')) return send(200, { status: 'ok' });
  if (path.startsWith('/carts/')) return send(200, { items: [], itemCount: 0, subtotalPaise: 0, shippingPaise: 0, totalPaise: 0 });
  if (path.includes('/reviews')) return send(200, { averageRating: 0, reviewCount: 0, verifiedReviewCount: 0, reviews: [], ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  if (/^\/products(?:\/(featured|best-sellers))?$/.test(path)) {
    const category = url.searchParams.get('category');
    reads.push(category);
    // Reproduce the actual bug: the obsolete collection has no members.
    if (category === 'new-arrivals') return send(200, []);
    if (path !== '/products') return send(200, products.slice(0, 8));
    return send(200, category ? products.filter(product => product.category.slug === category) : products);
  }
  if (path.startsWith('/products/')) {
    const slug = decodeURIComponent(path.split('/')[2]);
    if (path.endsWith('/related')) return send(200, products.filter(product => product.slug !== slug).slice(0, 4));
    const product = products.find(p => p.slug === slug);
    return send(product ? 200 : 404, product || {});
  }
  return send(401, { message: 'Authentication required' });
});
await new Promise(done => upstream.listen(0, '127.0.0.1', done));
const reserveLoopbackPorts = async count => {
  const reservations = [];
  try {
    for (let i = 0; i < count; i++) {
      const reservation = createServer();
      await new Promise((done, reject) => {
        reservation.once('error', reject);
        reservation.listen(0, '127.0.0.1', done);
      });
      reservations.push(reservation);
    }
    const ports = reservations.map(reservation => reservation.address().port);
    assert.equal(new Set(ports).size, count, 'Candidate and prior runtimes require distinct loopback ports');
    return ports;
  } finally {
    await Promise.all(reservations.map(reservation => new Promise(done => reservation.close(done))));
  }
};
const [port, storefrontPort, priorPort, priorStorefrontPort] = await reserveLoopbackPorts(4);
const api = 'http://127.0.0.1:' + upstream.address().port + '/v1';
const privacyFixture = new URL('./privacy-store-fixture.mjs', import.meta.url).href;
const runtimeEnvironment = {
  ...process.env,
  ALLOW_PUBLIC_DOMAIN: 'true',
  API_URL: api,
  INTERNAL_API_URL: api,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + ' ' : ''}--import=${privacyFixture}`,
  IDENTITY_ENDPOINT: 'http://127.0.0.1/hidi-seo-fixture-token',
  IDENTITY_HEADER: 'read-only-fixture',
  AZURE_STORAGE_ACCOUNT: 'fixture',
  AZURE_STORAGE_BLOB_ENDPOINT: 'https://fixture.blob.core.windows.net/',
};
const childFailures = new Map();
const logsFrom = (child, label) => {
  child.stdout.on('data', chunk => logs += chunk);
  child.stderr.on('data', chunk => logs += chunk);
  child.on('error', failure => {
    childFailures.set(child, failure);
    logs += `${label} failed to start: ${failure.message}\n`;
  });
  return child;
};
let logs = '';
const storefrontBase = 'http://127.0.0.1:' + storefrontPort;
const storefront = logsFrom(spawn(process.execPath, [join(root, 'apps/web/server.js')], {
  cwd: join(root, 'apps/web'),
  env: { ...runtimeEnvironment, PORT: String(storefrontPort), HOSTNAME: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
}), 'candidate storefront');
const runtime = spawn(process.execPath, [join(root, 'server.mjs')], { cwd: root,
  env: { ...runtimeEnvironment, PORT: String(port), STOREFRONT_ORIGIN: storefrontBase }, stdio: ['ignore', 'pipe', 'pipe'] });
logsFrom(runtime, 'candidate wrapper');
const base = 'http://127.0.0.1:' + port;
const priorRoot=resolve(root,'../base-app');
const priorStorefrontBase='http://127.0.0.1:'+priorStorefrontPort;
const priorStorefront=logsFrom(spawn(process.execPath,[join(priorRoot,'apps/web/server.js')],{
  cwd:join(priorRoot,'apps/web'),env:{...runtimeEnvironment,PORT:String(priorStorefrontPort),HOSTNAME:'127.0.0.1'},
  stdio:['ignore','pipe','pipe'],
}),'prior storefront');
const priorRuntime=logsFrom(spawn(process.execPath,[join(priorRoot,'server.mjs')],{cwd:priorRoot,
  env:{...runtimeEnvironment,PORT:String(priorPort),STOREFRONT_ORIGIN:priorStorefrontBase},stdio:['ignore','pipe','pipe']}),'prior wrapper');
const priorBase='http://127.0.0.1:'+priorPort;

const bodyEvidencePath = 'evidence/seo-discovery/candidate-body-preservation.json';
const collectionBodyEvidencePath = 'evidence/seo-discovery/candidate-collection-body-delta.json';
const forwardedHeaders = bodyConfig.requestHeaders;
const announcement = Buffer.from(bodyConfig.announcementHtml);
const headMarker = Buffer.from('</head>');
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
const countBytes = (value, needle) => {
  let count = 0, offset = 0;
  while ((offset = value.indexOf(needle, offset)) >= 0) { count++; offset += needle.length; }
  return count;
};
const requestDocument = (origin, route) => new Promise((resolveRequest, reject) => {
  const target = new URL(route, origin);
  const req = request({ hostname: target.hostname, port: target.port, path: target.pathname + target.search,
    method: 'GET', headers: forwardedHeaders }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolveRequest({
      status: response.statusCode,
      contentType: response.headers['content-type'] || '',
      document: Buffer.concat(chunks),
    }));
  });
  req.setTimeout(30000, () => req.destroy(new Error(`Timed out reading ${route}`)));
  req.on('error', reject); req.end();
});
const readinessRequest = async origin => {
  try {
    const response = await fetch(origin + '/collections/all', { signal: AbortSignal.timeout(3000) });
    try { return response.ok; }
    finally { try { await response.body?.cancel(); } catch {} }
  } catch { return false; }
};
const sampleBody = async (origin, route) => {
  const response = await requestDocument(origin, route), document = response.document;
  const marker = document.indexOf(headMarker), markerCount = countBytes(document, headMarker);
  assert.equal(response.status, 200, `${route} must return HTTP 200`);
  assert.match(response.contentType, /^text\/html\b/i, `${route} must return HTML`);
  assert.equal(markerCount, 1, `${route} must contain exactly one lowercase </head>`);
  const head = document.subarray(0, marker + headMarker.length);
  const body = document.subarray(marker + headMarker.length);
  const announcementCount = countBytes(body, announcement);
  const optional = bodyConfig.routes[route]?.optionalAnnouncement;
  assert.notEqual(optional, undefined, `Unreviewed retained-body route: ${route}`);
  assert(optional ? announcementCount <= 1 : announcementCount === 0, `${route} has an unexpected HIDI price announcement`);
  const announcementPosition = announcementCount ? body.indexOf(announcement) : null;
  if (announcementCount) {
    const bodyTag = /<body\b[^>]*>/i.exec(body.subarray(0, 1024).toString('utf8'));
    assert(bodyTag, `${route} must contain a body start tag`);
    const bodyTagEnd = Buffer.byteLength(bodyTag.input.slice(0, bodyTag.index) + bodyTag[0]);
    assert.equal(announcementPosition, bodyTagEnd, 'Optional announcement must occur once immediately after <body>');
  }
  const normalized = announcementCount
    ? Buffer.concat([body.subarray(0, announcementPosition), body.subarray(announcementPosition + announcement.length)])
    : body;
  return {
    body, normalized,
    evidence: {
      status: response.status, contentType: response.contentType, markerCount,
      document: { length: document.length, sha256: sha256(document) },
      head: { length: head.length, sha256: sha256(head) },
      body: { length: body.length, sha256: sha256(body) },
      normalizedBody: { length: normalized.length, sha256: sha256(normalized) },
      announcement: { count: announcementCount, position: announcementPosition, exactReviewedLiteral: announcementCount === 1 },
    },
  };
};
const compareRetainedBodies = async () => {
  const report = { passed: false, readOnly: true, liveWrites: 0, sampleCount: 3,
    requestHeaders: forwardedHeaders, normalization: 'Only the exact reviewed optional homepage price announcement is removed', routes: [] };
  for (const route of ['/', '/privacy']) {
    const prior = [], candidate = [];
    for (let i = 0; i < report.sampleCount; i++) {
      prior.push(await sampleBody(priorBase, route));
      candidate.push(await sampleBody(base, route));
    }
    const priorRawStable = prior.every(sample => sample.evidence.body.sha256 === prior[0].evidence.body.sha256);
    const candidateRawStable = candidate.every(sample => sample.evidence.body.sha256 === candidate[0].evidence.body.sha256);
    const priorStable = prior.every(sample => sample.normalized.equals(prior[0].normalized));
    const candidateStable = candidate.every(sample => sample.normalized.equals(candidate[0].normalized));
    const difference = firstDifference(prior[0].normalized, candidate[0].normalized);
    report.routes.push({
      route,
      optionalAnnouncement: bodyConfig.routes[route].optionalAnnouncement,
      prior: { rawStable: priorRawStable, normalizedStable: priorStable, samples: prior.map(sample => sample.evidence) },
      candidate: { rawStable: candidateRawStable, normalizedStable: candidateStable, samples: candidate.map(sample => sample.evidence) },
      exactNormalizedMatch: difference === null,
      firstDifference: difference,
    });
  }
  report.passed = report.routes.every(route => route.prior.normalizedStable && route.candidate.normalizedStable && route.exactNormalizedMatch);
  await mkdir('evidence/seo-discovery', { recursive: true });
  await writeFile(bodyEvidencePath, JSON.stringify(report, null, 2) + '\n');
  assert(report.passed, `Retained public body comparison failed; see ${bodyEvidencePath}`);
};
const sampleCollectionBody = async origin => {
  const response = await requestDocument(origin, '/collections/all');
  assert.equal(response.status, 200, 'Shop All reviewed body must return HTTP 200');
  assert.match(response.contentType, /^text\/html\b/i, 'Shop All reviewed body must return HTML');
  const document=response.document.toString('utf8');
  const marker=document.indexOf('</head>');
  assert.equal(countBytes(response.document,headMarker),1,'Shop All retained body contains exactly one head boundary');
  const body=document.slice(marker+7);
  return {body,value:inspectCollectionBody(body),evidence:{status:response.status,contentType:response.contentType,
    body:{length:Buffer.byteLength(body),sha256:sha256(body)}}};
};
const compareReviewedCollectionBody = async () => {
  const sampleCount=3,prior=[],candidate=[];
  for(let i=0;i<sampleCount;i++) {
    prior.push(await sampleCollectionBody(priorBase));
    candidate.push(await sampleCollectionBody(base));
  }
  const priorStable=prior.every(value=>value.evidence.body.sha256===prior[0].evidence.body.sha256);
  const candidateStable=candidate.every(value=>value.evidence.body.sha256===candidate[0].evidence.body.sha256);
  assert(priorStable&&candidateStable,'Shop All reviewed body must be stable before comparison');
  const comparisons=candidate.map(value=>compareReviewedCollectionBodies(prior[0].body,value.body));
  assert(comparisons.every(value=>value.exactBodyMatch),'Every candidate sample must remain byte-identical to the prior body');
  assert(candidate.every(value=>value.value.productArticleCount===products.length),'Candidate Shop All body must retain all 54 reviewed product cards');
  const summarize=value=>({...value.evidence,...value.value});
  const report={passed:true,readOnly:true,liveWrites:0,sampleCount,route:'/collections/all',
    reviewedDelta:'none',retainedExactBodyRoutes:['/','/privacy','/collections/all'],
    exactBodyMatch:true,normalization:{mode:'none',operations:[]},
    body:{prior:prior[0].evidence.body,candidate:candidate[0].evidence.body},
    prior:{stable:priorStable,samples:prior.map(summarize)},candidate:{stable:candidateStable,samples:candidate.map(summarize)},
    fixtureCatalogue:{products:products.length,imageAssociations:fixtureImagePaths.length},
    expected:{heading:priorCollectionTitle,introCount:0,breadcrumbLabel:priorCollectionTitle}};
  await writeFile(collectionBodyEvidencePath,JSON.stringify(report,null,2)+'\n');
};
try {
  let ready = false;
  const readinessDeadline=Date.now()+30000;
  for (let i = 0; i < 100 && Date.now()<readinessDeadline; i++) {
    const responses=await Promise.all([base,storefrontBase,priorBase,priorStorefrontBase].map(readinessRequest));
    if(responses.every(Boolean)){ready=true;break;}
    for(const [label,child] of [['candidate wrapper',runtime],['candidate storefront',storefront],
      ['prior wrapper',priorRuntime],['prior storefront',priorStorefront]]) {
      const failure=childFailures.get(child);
      if(failure) throw new Error(label+' failed before readiness: '+failure.message+'\n'+logs.slice(-2000));
      if(child.exitCode!==null||child.signalCode!==null) throw new Error(label+' exited before readiness: '+logs.slice(-2000));
    }
    await new Promise(done => setTimeout(done, 200));
  }
  assert(ready, 'Isolated candidate and prior runtimes must become ready');
  await compareRetainedBodies();
  await compareReviewedCollectionBody();
  await probe(base, 'evidence/seo-discovery/candidate', {baseline:priorBase});
  await foundationProbe(base,'evidence/seo-discovery/foundation-candidate',{baseline:priorBase});
  assert(reads.length > 0, 'Catalogue regression must reach read-only fixture');
  assert.deepEqual(writes, []);
} catch (error) { console.error(logs.slice(-2000)); throw error; }
finally {
  const stopChild=child=>new Promise(done=>{
    if(child.exitCode!==null||child.signalCode!==null)return done();
    let settled=false,deadline,force;
    const finish=()=>{if(settled)return;settled=true;clearTimeout(force);clearTimeout(deadline);done();};
    child.once('exit',finish);
    deadline=setTimeout(()=>child.kill('SIGKILL'),4500);
    force=setTimeout(finish,5000);
    child.kill('SIGTERM');
  });
  await Promise.all([stopChild(priorRuntime),stopChild(priorStorefront),stopChild(runtime),stopChild(storefront)]);
  upstream.closeAllConnections(); await new Promise(done => upstream.close(done));
}

