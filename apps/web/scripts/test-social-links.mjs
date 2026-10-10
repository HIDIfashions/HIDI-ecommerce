import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const base = new URL(process.env.HIDI_SOCIAL_BASE_URL || 'http://127.0.0.1:3192').origin;
const live = process.env.HIDI_SOCIAL_LIVE === '1';
const channels = [
  ['HIDI Instagram', 'https://www.instagram.com/hidiindia/'],
  ['HIDI Facebook', 'https://www.facebook.com/profile.php?id=61594615364935'],
  ['HIDI X', 'https://x.com/Hidiindia'],
  ['HIDI Youtube', 'https://www.youtube.com/@Hidiindia']
];

for (const engine of ['chromium', 'firefox', 'webkit']) {
  const browser = await pw[engine].launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 700 });
      const outgoing = [];
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
        if (url.origin !== base) {
          if (channels.some(([, target]) => request.url() === target)) {
            outgoing.push(request.url());
            // Verify actual popup navigation without contacting or signing in to a social platform.
            return route.fulfill({ contentType: 'text/html', body: '<title>Social destination verification</title>' });
          }
          return route.abort();
        }
        if (!live && url.pathname === '/api/hidi/hero-config') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, active: false, source: 'bundled' }) });
        if (!live && url.pathname === '/api/hidi/landing-media-config') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, slots: {}, ananya: null }) });
        return route.continue();
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try {
        for (let visit = 0; visit < 2; visit++) {
          if (!visit) await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
          else await page.reload({ waitUntil: 'domcontentloaded' });
          await page.locator('.site-footer').scrollIntoViewIfNeeded();
          assert.equal(await page.getByRole('dialog').count(), 0);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
          for (const [label, target] of channels) {
            const button = page.getByRole('button', { name: label, exact: true });
            assert.equal(await button.count(), 1);
            assert(await button.isVisible() && await button.isEnabled());
            for (const action of ['click', 'keyboard']) {
              const count = outgoing.length;
              const popupReady = context.waitForEvent('page');
              if (action === 'click') await button.click();
              else { await button.focus(); await button.press('Enter'); }
              const popup = await popupReady;
              await popup.waitForURL(target);
              await popup.waitForLoadState('domcontentloaded');
              assert.equal(await popup.evaluate(() => window.opener), null, 'Social page has no opener');
              assert.deepEqual(outgoing.slice(count), [target], 'One navigation to the correct account');
              assert.equal(await page.getByRole('dialog').count(), 0, 'No placeholder dialog');
              await popup.close();
              console.log(`PASS ${engine} ${width}px ${visit ? 'reload' : 'fresh'} ${label} ${action}: ${target}`);
            }
          }
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
console.log('PASS: 96 social-link activations across three browsers, mobile/desktop, fresh/reloaded pages, mouse and keyboard.');
