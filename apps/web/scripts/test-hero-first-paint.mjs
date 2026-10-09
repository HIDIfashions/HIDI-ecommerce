import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base = process.env.HERO_TEST_BASE_URL || 'http://127.0.0.1:3191';
const output = resolve('validation/hero-first-paint');
await mkdir(output, { recursive: true });
const delay = ms => new Promise(done => setTimeout(done, ms));
const deferred = () => { let release; const promise = new Promise(done => { release = done; }); return { promise, release }; };
const legacy = /\/assets\/(?:video\/hidi-hero-(?:mobile|desktop)-luminous-v1\.mp4|images\/hero-(?:mobile|desktop)-luminous-first-frame-v1\.webp)/;
const image = await readFile(resolve('public/assets/images/hidi-logo.png'));
const video = await readFile(resolve('public/assets/video/hidi-hero-mobile-luminous-v1.mp4'));
const reports = [];
let server;
if (!process.env.HERO_TEST_BASE_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '3191', '--strictPort'], { stdio: 'ignore' });
}

async function runCase(browser, engine, width, scenario) {
  const configGate = deferred(), mediaGate = deferred();
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 700,
    reducedMotion: scenario === 'reduced-video' || scenario === 'bundled' ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const oldRequests = [], errors = [];
  let attempts = 0;
  const videoCase = scenario.includes('video');
  const selectedUrl = '/__hero_fixture__/selected.' + (videoCase ? 'mp4' : 'png');
  const selection = { version: 1, active: true, source: 'uploaded', type: videoCase ? 'video' : 'image', url: selectedUrl,
    desktopPosition: '34% 50%', mobilePosition: '66% 50%' };
  page.on('request', request => { if (legacy.test(request.url())) oldRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => {
    window.__heroLegacyNodes = [];
    new MutationObserver(() => {
      const hero = document.querySelector('.hero-media');
      if (hero?.querySelector('.hero-poster, #hero-video')) window.__heroLegacyNodes.push(performance.now());
    }).observe(document, { childList: true, subtree: true });
  });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === '/api/hidi/hero-config') {
      attempts++;
      await configGate.promise;
      if (scenario === 'http-error' || (scenario === 'retry' && attempts === 1)) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"fixture unavailable"}' });
      }
      if (scenario === 'invalid') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"active":true,"type":"video","url":"javascript:alert(1)"}' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(scenario === 'bundled'
        ? { version: 1, active: false, source: 'bundled' } : selection) });
    }
    if (url.pathname === selectedUrl) {
      await mediaGate.promise;
      if (scenario.startsWith('broken')) return route.fulfill({ status: 404, body: 'missing fixture' });
      const bytes = videoCase ? video : image;
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers().range || '');
      if (videoCase && range) {
        const start = Number(range[1]), end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1);
        return route.fulfill({ status: 206, contentType: 'video/mp4', headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes' }, body: bytes.subarray(start, end + 1) });
      }
      return route.fulfill({ status: 200, contentType: videoCase ? 'video/mp4' : 'image/png', body: bytes });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"version":1,"slots":{},"items":[],"products":[]}' });
    return route.continue();
  });

  const id = `${engine}-${width}-${scenario}`;
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.hero-media').waitFor({ state: 'attached' });
    await delay(350);
    const boxBefore = await page.locator('.hero--campaign').boundingBox();
    if (process.env.HERO_EXPECT_LEGACY === '1') {
      assert(await page.locator('.hero-poster, #hero-video').count() > 0, 'Baseline must reproduce the unwanted initial campaign');
      assert(oldRequests.length > 0, 'Baseline must request the old poster before config resolves');
      reports.push({ id, result: 'baseline-reproduced', oldRequests: oldRequests.length });
      console.log(`PASS ${id}: pre-fix defect reproduced before configuration response`);
      return;
    }
    assert.equal(await page.locator('.hero-media').getAttribute('data-hero-config-status'), 'loading');
    assert.equal(await page.locator('.hero-media img, .hero-media video, .hero-media picture').count(), 0);
    assert.deepEqual(oldRequests, [], 'No old poster/video download while selection is unresolved');
    configGate.release();

    if (scenario === 'bundled') {
      mediaGate.release();
      await page.waitForFunction(() => document.querySelector('.hero-media')?.dataset.heroConfigStatus === 'bundled');
      await page.waitForFunction(() => { const img = document.querySelector('.hero-poster'); return img?.complete && img.naturalWidth > 0; });
      assert(await page.locator('#hero-video').count() === 1);
    } else if (scenario === 'http-error' || scenario === 'invalid') {
      await page.waitForFunction(() => document.querySelector('.hero-media')?.dataset.heroConfigStatus === 'error');
      assert.equal(attempts, 3, 'Configuration recovery is bounded');
      assert.equal(await page.locator('.hero-media img, .hero-media video').count(), 0);
    } else {
      await page.locator('.hero-live-media').waitFor({ state: 'attached' });
      assert.equal(await page.locator('.hero-live-media').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'Media remains hidden until a decoded frame is ready');
      mediaGate.release();
      if (scenario.startsWith('broken')) {
        await page.waitForFunction(() => document.querySelector('.hero-media')?.dataset.heroConfigStatus === 'error');
      } else {
        await page.waitForFunction(() => document.querySelector('.hero-media')?.dataset.frameReady === 'true');
        await page.waitForFunction(() => { const el = document.querySelector('.hero-live-media'); return el && getComputedStyle(el).visibility === 'visible'; });
        assert.equal(await page.locator('.hero-live-media').getAttribute('src'), new URL(selectedUrl, base).href);
        assert.equal(await page.locator('.hero-live-media').evaluate(el => getComputedStyle(el).objectPosition), width < 700 ? '66% 50%' : '34% 50%');
        if (scenario === 'retry') assert.equal(attempts, 2);
        if (scenario === 'reduced-video') {
          assert.equal(await page.locator('video.hero-live-media').getAttribute('autoplay'), null);
          assert.equal(await page.locator('video.hero-live-media').evaluate(el => el.paused), true);
        }
        if (scenario === 'image') {
          await page.screenshot({ path: resolve(output, `${id}.png`), animations: 'disabled', timeout: 15000 });
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => document.querySelector('.hero-media')?.dataset.frameReady === 'true');
        }
      }
      assert.deepEqual(oldRequests, [], 'Old media is never downloaded for a selected upload, including reloads and errors');
      assert.deepEqual(await page.evaluate(() => window.__heroLegacyNodes), [], 'Mutation history contains no flash of the old campaign');
    }
    const boxAfter = await page.locator('.hero--campaign').boundingBox();
    assert(Math.abs(boxAfter.height - boxBefore.height) <= 1 && Math.abs(boxAfter.width - boxBefore.width) <= 1, 'Hero layout stays stable');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    reports.push({ id, result: 'passed', attempts, oldRequests: oldRequests.length });
    console.log(`PASS ${id}`);
  } catch (error) {
    const state = await page.evaluate(() => {
      const el = document.querySelector('.hero-live-media');
      return { hero: document.querySelector('.hero-media')?.outerHTML, visibility: el && getComputedStyle(el).visibility,
        mediaError: el?.error?.message, readyState: el?.readyState, networkState: el?.networkState,
        h264: document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') };
    }).catch(() => ({}));
    reports.push({ id, result: 'failed', message: error.message, state });
    console.error(`FAIL ${id}: ${error.stack}\n${JSON.stringify(state)}`);
  } finally {
    configGate.release(); mediaGate.release();
    await context.close();
  }
}

try {
  let ready = false;
  for (let i = 0; i < 100; i++) { try { ready = (await fetch(base)).ok; } catch {} if (ready) break; await delay(100); }
  assert(ready, 'Built homepage must be reachable');
  for (const engine of (process.env.HERO_EXPECT_LEGACY === '1' ? ['chromium'] : ['chrome', 'firefox', 'webkit'])) {
    // Stock Chrome includes the licensed MP4 codecs used by the real uploaded videos.
    const browser = engine === 'chrome' ? await pw.chromium.launch({ channel: 'chrome', headless: true })
      : await pw[engine].launch({ headless: true });
    try {
      for (const width of (process.env.HERO_EXPECT_LEGACY === '1' ? [1440] : [390, 1440])) {
        for (const scenario of (process.env.HERO_EXPECT_LEGACY === '1' ? ['image']
          : ['image', 'video', 'bundled', 'retry', 'http-error', 'invalid', 'broken-image', 'broken-video', 'reduced-video'])) {
          await runCase(browser, engine, width, scenario);
        }
      }
    } finally { await browser.close(); }
  }
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
  if (server) { server.kill('SIGTERM'); await new Promise(done => server.exitCode !== null ? done() : server.once('exit', done)); }
}
assert.equal(reports.filter(item => item.result === 'failed').length, 0, 'All hero first-paint regression scenarios must pass');
