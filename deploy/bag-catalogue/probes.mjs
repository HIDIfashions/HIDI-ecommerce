import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';

export async function probe(base, output) {
  const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output, { recursive: true });
  const results = [], unexpectedWrites = [];
  const engines = ['chromium', 'firefox', 'webkit'];
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
        const cards = page.locator('main article');
        const productPaths = async () => (await page.locator('main article h3 a').evaluateAll(links => links.map(link => new URL(link.href).pathname))).sort();
        try {
          // The hero destination supplies the authoritative catalogue for comparison.
          assert((await page.goto(base + '/collections/all', { waitUntil: 'domcontentloaded' })).ok());
          await cards.first().waitFor();
          const expected = await productPaths();
          assert(expected.length > 0, 'Complete catalogue must contain products');
          await page.goto(base + '/cart', { waitUntil: 'domcontentloaded' });
          const browse = page.getByRole('link', { name: 'Browse new arrivals', exact: true });
          await browse.waitFor();
          await browse.click();
          await cards.first().waitFor();
          await page.waitForURL('**/collections/all*');
          assert.deepEqual(await productPaths(), expected, 'Bag must open the same products as hero');
          assert.equal(await page.getByText('No styles match those filters.', { exact: true }).count(), 0);
          await page.screenshot({ path: `${output}/${engine}-${width}-bag-products.png` });
          const sort = page.getByLabel('Sort products');
          if (await sort.isVisible()) {
            await sort.selectOption({ label: 'Price: Low to high' });
            assert.deepEqual(await productPaths(), expected, 'Sorting retains all published products');
          }
          const productLink = page.locator('main article h3 a').first();
          const productName = await productLink.innerText();
          await productLink.click();
          await page.waitForURL('**/products/**');
          await page.getByRole('heading', { level: 1, name: productName, exact: true }).waitFor();
          // Existing bookmarks and plain full-page navigation are repaired too.
          await page.goto(base + '/collections/new-arrivals?sort=featured', { waitUntil: 'domcontentloaded' });
          await cards.first().waitFor();
          assert.equal(new URL(page.url()).pathname, '/collections/all');
          assert.deepEqual(await productPaths(), expected);
          results.push({ engine, width, height, status: 'PASS', products: expected.length, bagToCatalogue: true, productDetails: true, legacyBookmark: true });
        } catch (error) {
          await page.screenshot({ path: `${output}/${engine}-${width}-failure.png` }).catch(() => {});
          await writeFile(`${output}/${engine}-${width}-failure.txt`, page.url() + '\n' + await page.locator('body').innerText());
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(unexpectedWrites, [], 'No commerce writes permitted');
  const report = { passed: true, engines, results, liveWrites: 0 };
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] === new URL(import.meta.url).pathname) await probe(process.argv[2], process.argv[3]);
