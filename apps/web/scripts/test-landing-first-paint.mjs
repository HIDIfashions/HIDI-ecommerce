import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base = process.env.HIDI_LANDING_BASE_URL;
assert(base, 'Test the actual built landing container');
const output = resolve('validation/landing-first-paint');
await mkdir(output, { recursive: true });
const photo = await readFile('public/assets/images/hero-landscape.webp');
const legacyPaths = ['occasion-set.webp', 'peach-set.webp', 'cream-set.webp', 'burgundy-set.webp', 'hero-portrait.webp', 'ananya-top-picks/ananya-green.webp', 'hidi-premium-ai-full-banner-lossless.png'].map(name => '/assets/images/' + name);
const slotIds = ['range-occasion', 'range-new-arrivals', 'range-work-edit', 'range-everyday', 'range-shop-all', 'ananya-green', 'hidi-edit-banner'];
const mediaSelector = '#our-range img, #meet-hidi img, #hidi-edit img';
const delay = ms => new Promise(done => setTimeout(done, ms));
const deferred = () => { let release; const promise = new Promise(done => { release = done; }); return { promise, release }; };
const reports = [];
const baseline = process.env.HIDI_LANDING_EXPECT_LEGACY === '1';

async function runCase(browser, engine, width, scenario) {
  let configGate = deferred(), mediaGate = deferred(), version = 1, attempts = 0;
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 700, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const oldRequests = [], errors = [];
  const item = id => ({ active: true, type: 'image', url: `/__landing_fixture__/v${version}/${id}.webp`, desktopPosition: '38% 42%', mobilePosition: '66% 50%', fitMode: 'contain', altText: 'Published ' + id });
  const selection = () => ({ version: 1, slots: Object.fromEntries(slotIds.map(id => [id, item(id)])), ananya: scenario === 'list' ? { active: true, items: [item('ananya-list-first'), item('ananya-list-second')], autoPlay: false, intervalSeconds: 6 } : null });
  page.on('request', request => { if (legacyPaths.includes(new URL(request.url()).pathname)) oldRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(paths => {
    window.__oldLandingSeen = false;
    new MutationObserver(() => {
      for (const image of document.querySelectorAll('#our-range img, #meet-hidi img, #hidi-edit img')) {
        if (image.getAttribute('src') && paths.includes(new URL(image.src).pathname)) window.__oldLandingSeen = true;
      }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }, legacyPaths);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === '/api/hidi/landing-media-config') {
      attempts += 1;
      await configGate.promise;
      if (scenario === 'http-error' || (scenario === 'retry' && attempts === 1)) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporarily unavailable"}' });
      if (scenario === 'invalid-json') return route.fulfill({ contentType: 'application/json', body: '{' });
      const value = selection();
      if (scenario === 'invalid-url') value.slots['range-occasion'].url = 'javascript:alert(1)';
      if (scenario === 'bundled') { value.slots = Object.fromEntries(slotIds.map(id => [id, { active: false, source: 'bundled' }])); value.ananya = { active: false, items: [], source: 'bundled' }; }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    }
    if (url.pathname.startsWith('/__landing_fixture__/')) {
      await mediaGate.promise;
      if (scenario === 'broken-image') return route.fulfill({ status: 404, body: 'missing selected photo' });
      return route.fulfill({ contentType: 'image/webp', body: photo });
    }
    if (url.pathname === '/api/hidi/hero-config') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ active: true, type: 'image', url: '/__landing_fixture__/hero.webp' }) });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"products":[],"items":[]}' });
    return route.continue();
  });
  const id = `${engine}-${width}-${scenario}`;
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#our-range').waitFor({ state: 'attached' });
    await delay(350);
    if (baseline) {
      assert(oldRequests.length > 0, 'The previous release must reproduce original-photo requests during pending configuration');
      assert(await page.locator(mediaSelector).count() >= 7, 'The previous release mounts its earlier photos before selection resolves');
      reports.push({ id, result: 'baseline-reproduced', oldRequests: oldRequests.length });
      console.log(`PASS ${id}: original-photo flash reproduced before the fix`);
      return;
    }
    const geometry = await page.evaluate(() => {
      const hero = document.querySelector('.hero').getBoundingClientRect(), range = document.querySelector('#our-range').getBoundingClientRect(), pick = document.querySelector('#meet-hidi').getBoundingClientRect(), heading = document.querySelector('.ananya-section-heading').getBoundingClientRect(), edit = document.querySelector('#hidi-edit').getBoundingClientRect();
      return { heroBottom: hero.bottom, rangeTop: range.top, rangeBottom: range.bottom, pickTop: pick.top, pickBottom: pick.bottom, headingHeight: heading.height, editTop: edit.top, width: document.documentElement.scrollWidth };
    });
    assert(geometry.rangeTop >= geometry.heroBottom - 1 && geometry.pickTop >= geometry.rangeBottom - 1 && geometry.editTop >= geometry.pickBottom - 1, 'Order is Hero → Explore our range → Ananya’s Pick → shopping banner');
    assert(geometry.headingHeight >= 64 && geometry.width <= width + 1, 'The compact heading stays visible without horizontal overflow');
    assert.equal(await page.locator(mediaSelector).count(), 0, 'Original images never mount while the selection is pending');
    assert.deepEqual(oldRequests, [], 'No original image is downloaded before configuration resolves');
    assert.equal(await page.locator('#our-range').getAttribute('data-landing-config-status'), 'loading');
    configGate.release();
    if (['http-error', 'invalid-json', 'invalid-url'].includes(scenario)) {
      await page.waitForFunction(() => document.querySelector('#our-range')?.dataset.landingConfigStatus === 'error');
      assert.equal(attempts, 3, 'Recovery attempts are bounded');
      assert.equal(await page.locator(mediaSelector).count(), 0, 'Unavailable selection leaves neutral spaces, never the earlier photos');
    } else {
      await page.waitForFunction(() => document.querySelector('#our-range')?.dataset.landingConfigStatus === 'ready');
      assert.equal(await page.locator(mediaSelector).count(), 7);
      if (scenario === 'bundled') {
        assert(oldRequests.length > 0, 'Original media is used only after the server confirms the default selection');
      } else {
        const sources = await page.locator(mediaSelector).evaluateAll(images => images.map(image => image.getAttribute('src')));
        assert(sources.every(src => src.includes('/__landing_fixture__/v1/')), 'Only current published selections mount');
        const expected = scenario === 'list' ? 'ananya-list-first' : 'ananya-green';
        assert((await page.locator('.meet-cinematic__model').getAttribute('src')).endsWith(`/v1/${expected}.webp`));
        if (scenario === 'retry') assert.equal(attempts, 2);
        await delay(200);
        assert.deepEqual(oldRequests, [], 'Slow selected-image responses do not reveal the original photos');
      }
      mediaGate.release();
      await page.locator('#hidi-edit').scrollIntoViewIfNeeded();
      if (scenario !== 'broken-image') await page.waitForFunction(() => [...document.querySelectorAll('#our-range img, #meet-hidi img, #hidi-edit img')].every(image => image.complete && image.naturalWidth > 0));
      if (['legacy', 'list', 'retry'].includes(scenario)) {
        version = 2; attempts = 0; configGate = deferred(); mediaGate = deferred();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('#our-range').waitFor({ state: 'attached' });
        await delay(250);
        assert.equal(await page.locator(mediaSelector).count(), 0, 'Reload does not show the previously selected set');
        configGate.release(); mediaGate.release();
        await page.waitForFunction(() => document.querySelector('#hidi-edit')?.dataset.landingConfigStatus === 'ready');
        await page.locator('#hidi-edit').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => { const images = [...document.querySelectorAll('#our-range img, #meet-hidi img, #hidi-edit img')]; return images.length === 7 && images.every(image => image.src.includes('/v2/') && image.complete && image.naturalWidth > 0); });
        assert.equal(attempts, scenario === 'retry' ? 2 : 1);
      }
    }
    if (scenario !== 'bundled') {
      assert.deepEqual(oldRequests, [], 'No old images requested on initial load, retry, error or reload');
      assert.equal(await page.evaluate(() => window.__oldLandingSeen), false, 'Mutation observer never saw the original media');
    }
    await page.locator('.site-footer').scrollIntoViewIfNeeded();
    assert(await page.locator('.site-footer').isVisible(), 'Normal page scrolling remains available');
    assert.deepEqual(errors, []);
    reports.push({ id, result: 'passed', attempts, oldMediaRequests: oldRequests.length });
    console.log(`PASS ${id}: section order, selection loading and reload boundaries`);
  } catch (error) {
    console.error('LANDING STATE ' + JSON.stringify(await page.evaluate(() => ({status:document.querySelector('#our-range')?.dataset.landingConfigStatus, images:[...document.querySelectorAll('#our-range img,#meet-hidi img,#hidi-edit img')].map(image=>({src:image.getAttribute('src'),complete:image.complete,width:image.naturalWidth,loading:image.loading}))}))));
    await page.screenshot({ path: resolve(output, id + '-failure.png'), animations: 'disabled' });
    await writeFile(resolve(output, 'partial-report.json'), JSON.stringify(reports, null, 2));
    throw error;
  } finally {
    configGate.release(); mediaGate.release();
    await context.close();
  }
}

for (const engine of baseline ? ['chromium'] : ['chromium', 'firefox', 'webkit']) {
  const browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
  try {
    for (const width of baseline ? [390] : [390, 1440]) {
      for (const scenario of baseline ? ['legacy'] : ['legacy', 'list', 'retry', 'http-error', 'invalid-json', 'invalid-url', 'broken-image', 'bundled']) await runCase(browser, engine, width, scenario);
    }
  } finally { await browser.close(); }
}
await writeFile(resolve(output, baseline ? 'baseline-report.json' : 'report.json'), JSON.stringify(reports, null, 2));
console.log(`PASS ${reports.length} landing media ${baseline ? 'baseline reproduction' : 'first-paint/reload'} cases`);
