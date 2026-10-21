import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import test from 'node:test';
import {CLIENT_NAVIGATION_CASES, crawlerDocument, isFixtureProductImageRequest} from './probes.mjs';

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('crawler document waits for the complete HTML stream and sends canonical crawler headers', async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.host, 'hidiindia.com');
    assert.equal(request.headers['x-forwarded-host'], 'hidiindia.com');
    assert.equal(request.headers['x-forwarded-proto'], 'https');
    assert.equal(request.headers.accept, 'text/html,application/xhtml+xml');
    assert.equal(request.headers['accept-encoding'], 'identity');
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    response.write('<!doctype html><html><body>first');
    setTimeout(() => response.end(' second</body></html>'), 40);
  }, async base => {
    const started = Date.now();
    const document = await crawlerDocument(base, '/streamed', {timeoutMs: 500, limit: 1024});
    assert.equal(document.status, 200);
    assert.match(document.headers.get('content-type'), /^text\/html\b/i);
    assert.equal(document.text, '<!doctype html><html><body>first second</body></html>');
    assert(Date.now() - started >= 30, 'reader must not resolve before the response end event');
  });
});

test('crawler document enforces the response-size cap', async () => {
  await withServer((_request, response) => {
    response.writeHead(200, {'content-type': 'text/html', 'content-length': '1024'});
    response.end('oversized');
  }, async base => {
    await assert.rejects(
      crawlerDocument(base, '/oversized', {timeoutMs: 500, limit: 64}),
      /Crawler document \/oversized rejected after \d+ms: declared body exceeds 64 bytes/,
    );
  });
});

test('crawler document has an absolute deadline even when the server keeps sending bytes', async () => {
  await withServer((_request, response) => {
    response.writeHead(200, {'content-type': 'text/html'});
    const interval = setInterval(() => response.write('x'), 10);
    response.once('close', () => clearInterval(interval));
  }, async base => {
    await assert.rejects(
      crawlerDocument(base, '/never-ending', {timeoutMs: 80, limit: 1024}),
      /Crawler document \/never-ending timed out after \d+ms: request exceeded 80ms/,
    );
  });
});

test('Firefox client navigation has fixed immediate and settled fresh-context cases', () => {
  assert.deepEqual(CLIENT_NAVIGATION_CASES, [
    {name:'fresh-immediate-pointer',settled:false,history:false,freshContext:true},
    {name:'fresh-settled-pointer',settled:true,history:true,freshContext:true},
  ]);
  const source=readFileSync(new URL('./probes.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function probeClientNavigation');
  const end=source.indexOf('\nexport async function probe',start);
  assert(start>=0&&end>start,'Client-navigation helper remains independently reviewable');
  const helper=source.slice(start,end);
  assert.match(source,/const navigationContext=await createReadOnlyContext\(browser,engine,width,height,base,writes\)/);
  assert.match(source,/finally \{await navigationContext\.close\(\);\}/);
  assert.match(helper,/const productHeading=page\.locator\('main article h3'\)\.first\(\);/);
  assert.match(helper,/document\.elementFromPoint\(rect\.left\+x,y\)/,
    'The physical activation point must be verified inside the visible clipped heading');
  assert.match(helper,/productHeading\.click\(\{position:\{x:activation\.x,y:activation\.y\},noWaitAfter:true,timeout:45000\}\)/,
    'The bounded heading receives one physical pointer action at the verified product-link point');
  assert.doesNotMatch(helper,/nextProduct\.click\(/,
    'The oversized inline product anchor must not be auto-centred outside its clipped mobile card');
  assert.match(helper,/window\.addEventListener\('click',record\)/,
    'The trusted click recorder must run after the Next/React bubble handler');
  assert.doesNotMatch(helper,/queueMicrotask/,
    'The recorder must not sample defaultPrevented before the link bubble handler runs');
  assert.match(helper,/activationEvidence\.trusted,true/);
  assert.match(helper,/activationEvidence\.defaultPrevented,true/);
  assert.match(helper,/__hidiSeoDocumentMarker/,
    'The gate must prove the pointer kept a same-document Next client transition');
  assert.doesNotMatch(helper,/\b(?:chromium|firefox|webkit)\b/i,
    'The exact trusted activation must be identical in every browser engine');
  assert.match(helper,/waitForLoadState\('load',\{timeout:45000\}\)/);
  assert.match(helper,/document\.fonts\.status==='loaded'.*timeout:30000/s);
  assert.doesNotMatch(helper,/\bretr(?:y|ies|ied)\b/i,'Navigation gate must not mask failures with retries');
  for(const match of helper.matchAll(/timeout:(\d+)/g))assert(Number(match[1])<=45000,'Navigation operation timeout must not exceed 45 seconds');
});

test('read-only browser probe isolates reviewed SEO checks from the fake Azure media backend', () => {
  const optimized='http://127.0.0.1:4100/_next/image?url=%2Fmedia%2Fproducts%2F_display_v2%2Fitem.jpg&w=1080&q=75';
  const direct='http://127.0.0.1:4100/media/products/_display_v2/item.jpg';
  assert.equal(isFixtureProductImageRequest('http://127.0.0.1:4100','image',optimized),true);
  assert.equal(isFixtureProductImageRequest('http://127.0.0.1:4100','image',direct),true);
  assert.equal(isFixtureProductImageRequest('http://127.0.0.1:4100','image','http://127.0.0.1:4100/brand/hidi-logo-header.svg'),false);
  assert.equal(isFixtureProductImageRequest('https://hidiindia.com','image','https://hidiindia.com/media/products/item.jpg'),false);
  assert.equal(isFixtureProductImageRequest('http://127.0.0.1:4100','script',optimized),false);
  const source=readFileSync(new URL('./probes.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function createReadOnlyContext');
  const end=source.indexOf('\nfunction observeFrameworkHeadErrors',start);
  assert(start>=0&&end>start,'Read-only BrowserContext factory remains independently reviewable');
  const helper=source.slice(start,end);
  assert.match(helper,/if\(isFixtureProductImageRequest\(base,req\.resourceType\(\),req\.url\(\)\)\)return route\.abort\(\);/,
    'Synthetic image fetches must not reach the intentionally unavailable fixture media backend');
  assert.match(helper,/return route\.continue\(\);/,'Documents, scripts and styles still use the candidate runtime');
});

test('candidate catalogue and guarded product-fact release retain reviewed boundaries', () => {
  const map=JSON.parse(readFileSync(new URL('./reviewed-product-image-map.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(map).length,54,'Candidate catalogue covers every reviewed live product');
  assert.equal(new Set(Object.values(map).flatMap(product=>product.paths)).size,238,
    'Candidate catalogue covers every reviewed live image association');
  const workflow=readFileSync(new URL('../../.github/workflows/seo-product-facts-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/if: github\.event_name == 'workflow_dispatch' \|\| contains\(github\.event\.head_commit\.message, '\[deploy-seo-product-facts\]'\)/,
    'Product-fact production release must require an explicit deploy token or manual dispatch');
});
