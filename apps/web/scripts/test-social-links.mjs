import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const base = new URL(process.env.HIDI_SOCIAL_BASE_URL || 'http://127.0.0.1:3192').origin;
const live = process.env.HIDI_SOCIAL_LIVE === '1';
const previewConfig = process.env.HIDI_SOCIAL_CONFIG_PREVIEW ? await readFile(process.env.HIDI_SOCIAL_CONFIG_PREVIEW, 'utf8') : null;
const channels = [
  ['HIDI Instagram', 'https://www.instagram.com/hidiindia/'],
  ['HIDI Facebook', 'https://www.facebook.com/profile.php?id=61594615364935'],
  ['HIDI X', 'https://x.com/Hidiindia'],
  ['HIDI Youtube', 'https://www.youtube.com/@Hidiindia']
];

async function verifyCase(engine, width, visit) {
  // Release each engine between cases and exercise the real footer controls.
  const browser = await pw[engine].launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 700 });
  try {
    await context.addInitScript(() => {
      window.__hidiSocialNavigation = [];
      window.open = (...args) => { window.__hidiSocialNavigation.push(args); return null; };
    });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
      // Actual playback is covered by the separate media regression suite.
      if (request.resourceType() === 'media') return route.abort();
      if (url.origin !== base) return route.abort();
      // Preflight applies reviewed settings in this browser only.
      if (previewConfig && url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: previewConfig });
      if (!live && url.pathname === '/api/hidi/hero-config') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, active: false, source: 'bundled' }) });
      if (!live && url.pathname === '/api/hidi/landing-media-config') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, slots: {}, ananya: null }) });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.locator('.site-footer').scrollIntoViewIfNeeded();
    if (visit) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.site-footer').scrollIntoViewIfNeeded();
    }
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    for (const [label, target] of channels) {
      const button = page.getByRole('button', { name: label, exact: true });
      assert.equal(await button.count(), 1);
      assert(await button.isVisible() && await button.isEnabled());
      for (const action of ['click', 'keyboard']) {
        const count = await page.evaluate(() => window.__hidiSocialNavigation.length);
        if (action === 'click') await button.click();
        else { await button.focus(); await button.press('Enter'); }
        const calls = await page.evaluate(() => window.__hidiSocialNavigation);
        assert.deepEqual(calls.slice(count), [[target, '_blank', 'noopener,noreferrer']], 'One navigation to the exact account in a safe new tab');
        assert.equal(await page.getByRole('dialog').count(), 0, 'No placeholder dialog');
        console.log(`PASS ${engine} ${width}px ${visit ? 'reload' : 'fresh'} ${label} ${action}: ${target}`);
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

for (const engine of ['chromium', 'firefox', 'webkit']) for (const width of [390, 1440]) for (const visit of [0, 1]) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await verifyCase(engine, width, visit); break; }
    catch (error) {
      // Retry an engine process crash once. All application assertions fail hard.
      if (attempt === 0 && /Page crashed/.test(error.message)) {
        console.warn(`RETRY ${engine} ${width}px ${visit ? 'reload' : 'fresh'}: test browser process crashed`);
        continue;
      }
      throw error;
    }
  }
}
console.log('PASS: 96 social-link navigation checks across three browsers, mobile/desktop, fresh/reloaded pages, mouse and keyboard.');
