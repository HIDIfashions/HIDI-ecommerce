import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';

export async function probe(base, output) {
  const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output, { recursive: true });
  const engines = ['chromium', 'firefox', 'webkit'], results = [], unexpectedWrites = [];
  const launch = Date.parse('2026-10-11T19:01:00+05:30');
  for (const engine of engines) {
    const browser = await pw[engine].launch({ headless: true,
      ...(engine === 'firefox' ? { env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1' } } : {}) });
    try {
      for (const [width, height] of [[390, 844], [1440, 900]]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 700, reducedMotion: 'reduce' });
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          if (!['GET', 'HEAD'].includes(req.method())) {
            if (!isBlockedTelemetry(req.method(), req.url(), new URL(base).origin)) unexpectedWrites.push({ method: req.method(), path: url.pathname });
            return route.abort();
          }
          if (req.resourceType() === 'media' || /googletagmanager|google-analytics|facebook\.net/.test(url.hostname)) return route.abort();
          return route.continue();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(45000);
        const banner = page.locator('#hidi-launch-countdown'), clock = banner.locator('[role="timer"]');
        try {
          // Only this isolated test browser changes time; no server settings or orders are changed.
          await page.clock.setFixedTime(new Date(launch - 10_000));
          assert((await page.goto(base + '/', { waitUntil: 'domcontentloaded' })).ok());
          await banner.waitFor();
          await page.waitForFunction(() => document.querySelector('#hidi-launch-countdown [role="timer"]')?.textContent === '00 : 00 : 10');
          assert.equal(await banner.getAttribute('data-launch-at'), '2026-10-11T19:01:00+05:30');
          assert.equal(await banner.getAttribute('data-phase'), 'countdown');
          assert.equal(await banner.getByRole('link', { name: /Shop now/ }).isVisible(), false);
          const header = await page.locator('#root .hidi-page .site-header').boundingBox(), box = await banner.boundingBox();
          assert(header && box && box.y >= header.y + header.height - 1, 'Countdown must sit below the header');
          assert(box.height <= 56 && box.width <= width + 1, 'Countdown stays compact on mobile and desktop');
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
          await page.screenshot({ path: `${output}/${engine}-${width}-countdown.png` });
          await page.reload({ waitUntil: 'domcontentloaded' });
          await banner.waitFor();
          await page.waitForFunction(() => document.querySelector('#hidi-launch-countdown [role="timer"]')?.textContent === '00 : 00 : 10');
          await page.clock.setFixedTime(new Date(launch - 9_000));
          await page.waitForFunction(() => document.querySelector('#hidi-launch-countdown [role="timer"]')?.textContent === '00 : 00 : 09');
          await page.clock.setFixedTime(new Date(launch));
          await banner.getByText('We’re live', { exact: true }).waitFor();
          assert.equal(await clock.isVisible(), false);
          assert.equal(await banner.getAttribute('data-phase'), 'live');
          await page.clock.setFixedTime(new Date(launch + 3_600_000));
          await page.reload({ waitUntil: 'domcontentloaded' });
          await banner.getByText('We’re live', { exact: true }).waitFor();
          await page.screenshot({ path: `${output}/${engine}-${width}-live.png` });
          await banner.getByRole('link', { name: /Shop now/ }).click();
          await page.waitForURL('**/collections/all*');
          const cards = page.locator('main article');
          await cards.first().waitFor();
          const products = await cards.count();
          assert(products > 0, 'Shop now must open published catalogue');
          assert.equal(await page.locator('#hidi-launch-countdown').count(), 0, 'Storefront pages are untouched');
          const productLink = page.locator('main article h3 a').first(), productName = await productLink.innerText();
          await productLink.click();
          await page.waitForURL('**/products/**');
          await page.getByRole('heading', { level: 1, name: productName, exact: true }).waitFor();
          await page.goto(base + '/cart', { waitUntil: 'domcontentloaded' });
          await page.getByRole('link', { name: 'Browse new arrivals', exact: true }).click();
          await page.waitForURL('**/collections/all*');
          await cards.first().waitFor();
          results.push({ engine, width, height, status: 'PASS', fixedLaunchTime: true, refreshDoesNotRestart: true,
            countdownTicks: true, exactExpiry: true, postLaunchRefresh: true, headerClearance: true,
            shopNowCatalogue: true, products, productDetails: true, bagNavigation: true });
          console.log(`PASS: ${engine} ${width} countdown, expiry, catalogue, product and bag`);
        } catch (error) {
          await page.screenshot({ path: `${output}/${engine}-${width}-failure.png` }).catch(() => {});
          await writeFile(`${output}/${engine}-${width}-failure.txt`, page.url() + '\n' + await page.locator('body').innerText());
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(unexpectedWrites, [], 'No commerce writes permitted');
  const report = { passed: true, launchAt: '2026-10-11T19:01:00+05:30', engines, results, liveWrites: 0 };
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] === new URL(import.meta.url).pathname) await probe(process.argv[2], process.argv[3]);
