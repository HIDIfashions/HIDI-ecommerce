/** Destructive-feature UI regression: every API operation stays on an isolated localhost fixture. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const output = resolve('test-results/admin-product-delete');
const toolsDirectory = process.env.HIDI_CANDIDATE_RUNTIME ? resolve(process.env.HIDI_CANDIDATE_RUNTIME, 'admin-tools') : resolve('deploy/admin-tools');
await mkdir(output, { recursive: true });
const fixtures = new Map(), results = [], requests = [];
let sequence = 0, browser;
const standard = { name: 'HIDI Ivory Office Kurta', status: 'ACTIVE', updatedAt: '2026-10-10T12:00:00.000Z', photoCount: 4, pendingMediaCount: 0 };
function fixture(options = {}) {
  const id = `fixture-${++sequence}`;
  const state = { product: { id, ...standard, ...(options.product || {}) }, deletes: [], gets: 0, ...options };
  state.product = { id, ...standard, ...(options.product || {}) };
  fixtures.set(id, state);
  return { id, state };
}
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/hidi/product-deletion/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop()), state = fixtures.get(id);
      requests.push({ id, method: req.method });
      if (!state) return json(res, 404, { message: 'Product not found.' });
      if (req.method === 'GET') {
        state.gets++;
        return json(res, state.getStatus || 200, state.getStatus ? { message: state.getMessage || 'Admin access required.' } : state.product);
      }
      if (req.method === 'DELETE') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString()); state.deletes.push(body);
        if (state.delay) await new Promise(done => setTimeout(done, state.delay));
        if (state.deleteStatus) return json(res, state.deleteStatus, { message: state.deleteMessage });
        const pending = state.pendingOnce && state.deletes.length === 1;
        state.product.status = 'DELETED'; state.product.pendingMediaCount = pending ? 2 : 0;
        return json(res, 200, pending ? { cleanupComplete: false, pendingMediaCount: 2, message: 'Product removed from sale. 2 photos still require cleanup.' } : { cleanupComplete: true, pendingMediaCount: 0, message: 'Product deleted and its dedicated photos removed from storage.' });
      }
      return json(res, 405, { message: 'Method not allowed.' });
    }
    if (url.pathname.startsWith('/admin-tools-assets/')) {
      const name = url.pathname.split('/').pop();
      if (!['product-delete.mjs', 'product-delete-links.js', 'admin-tools.css'].includes(name)) return json(res, 404, {});
      res.writeHead(200, { 'Content-Type': name.endsWith('.css') ? 'text/css' : 'text/javascript' });
      return res.end(await readFile(resolve(toolsDirectory, name)));
    }
    if (url.pathname === '/admin/product-delete') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(await readFile(resolve(toolsDirectory, 'product-delete.html')));
    }
    if (url.pathname === '/admin/products' || url.pathname.startsWith('/admin/products/')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture products</title><script src="/admin-tools-assets/product-delete-links.js" defer></script><main><h1>Products</h1><table><tbody><tr id="first"><td><strong>Ivory Kurta</strong><a href="/admin/products/product-one">Edit</a></td><td><a href="/admin/products/product-one">Open</a></td></tr><tr><td><a href="/admin/products/new">New</a></td><td></td></tr><tr><td><a href="/admin/products/price-tags">Price tags</a></td><td></td></tr><tr><td><a href="/admin/products/bulk-import">Import</a></td><td></td></tr></tbody></table></main></html>`);
    }
    res.writeHead(404); res.end();
  } catch (error) { json(res, 500, { message: error.message }); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const engines = (process.env.HIDI_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',');
async function load(page, id) { await page.goto(`${base}/admin/product-delete?product=${id}`); await page.locator('#loading').waitFor({ state: 'hidden' }); }
async function success(page) { await page.locator('#done').waitFor({ state: 'visible' }); assert.match(await page.locator('#status').textContent(), /dedicated photos removed from storage/); }

try {
  for (const engine of engines) {
    browser = await pw[engine].launch({ headless: true, timeout: 20000, ...(engine === 'firefox' ? { env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1' } } : {}), ...(engine === 'webkit' && process.env.HIDI_WEBKIT_EXECUTABLE ? { executablePath: process.env.HIDI_WEBKIT_EXECUTABLE } : {}) });
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      const mode = viewport.width === 390 ? 'mobile' : 'desktop';
      const context = await browser.newContext({ viewport });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
      const check = async (name, task) => {
        try { await task(); results.push({ engine, mode, name, status: 'PASS' }); console.log(`PASS ${engine} ${mode} ${name}`); }
        catch (error) { results.push({ engine, mode, name, status: 'FAIL', error: error.stack }); console.error(`FAIL ${engine} ${mode} ${name}: ${error}`); await page.screenshot({ path: resolve(output, `${engine}-${mode}-${name}.png`) }).catch(() => {}); }
      };
      await check('confirmation-and-success', async () => {
        const { id, state } = fixture(); await load(page, id);
        const button = page.getByRole('button', { name: 'Delete product and photos', exact: true });
        assert(await button.isDisabled(), 'Deletion starts disabled');
        await page.getByLabel('Type the full product name to confirm').fill('Wrong product'); assert(await button.isDisabled());
        await page.locator('#confirmName').press('Enter'); assert.equal(state.deletes.length, 0, 'Wrong confirmation never sends DELETE');
        await page.locator('#confirmName').fill(state.product.name); assert(await button.isEnabled());
        await button.click(); await success(page);
        assert.equal(state.deletes.length, 1); assert.deepEqual(state.deletes[0], { expectedUpdatedAt: standard.updatedAt, confirmName: standard.name });
        assert(await page.locator('#deleteForm').isHidden()); assert(await page.locator('#retry').isHidden());
        assert.match(await page.locator('#photos').textContent(), /Past order and inventory records are preserved/);
        assert.equal(await page.getByRole('status').getAttribute('aria-live'), 'polite');
        assert(await page.getByRole('link', { name: 'Return to Products', exact: true }).isVisible());
      });
      await check('pending-cleanup-retry-reload', async () => {
        const { id, state } = fixture({ pendingOnce: true }); await load(page, id);
        await page.locator('#confirmName').fill(state.product.name); await page.locator('#deleteButton').click();
        await page.getByRole('button', { name: 'Retry photo cleanup' }).waitFor({ state: 'visible' });
        assert(await page.locator('#done').isHidden()); assert(await page.locator('#deleteForm').isHidden());
        assert.match(await page.locator('#photos').textContent(), /2 photo references remain/);
        await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
        assert.match(await page.locator('#status').textContent(), /already removed from sale/);
        assert(await page.locator('#deleteForm').isHidden()); assert(await page.locator('#retry').isVisible());
        await page.locator('#retry').click(); await success(page); assert.equal(state.deletes.length, 2);
        await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
        assert.match(await page.locator('#status').textContent(), /already been deleted/); assert(await page.locator('#retry').isHidden()); assert(await page.locator('#done').isVisible());
      });
      await check('stale-conflict', async () => {
        const { id, state } = fixture({ deleteStatus: 409, deleteMessage: 'Product changed. Reload before deleting.' }); await load(page, id);
        await page.locator('#confirmName').fill(state.product.name); await page.locator('#deleteButton').click();
        await page.getByRole('status').filter({ hasText: 'Product changed' }).waitFor();
        assert(await page.locator('#done').isHidden()); assert(await page.locator('#deleteForm').isVisible()); assert(!/completed|photos removed/.test(await page.locator('#status').textContent()));
        assert.equal(state.product.status, 'ACTIVE'); assert.equal(state.deletes.length, 1);
      });
      await check('authorization', async () => {
        for (const status of [401, 403]) {
          const { id, state } = fixture({ getStatus: status }); await load(page, id);
          assert.match(await page.locator('#status').textContent(), /Admin access required/); assert(await page.locator('#review').isHidden()); assert.equal(state.deletes.length, 0);
          assert.equal(await page.locator('#signin').isVisible(), status === 401);
        }
        const { id, state } = fixture({ deleteStatus: 401, deleteMessage: 'Admin session expired. Sign in again.' }); await load(page, id);
        await page.locator('#confirmName').fill(state.product.name); await page.locator('#deleteButton').click();
        await page.getByRole('status').filter({ hasText: 'Admin session expired' }).waitFor();
        assert(await page.locator('#signin').isVisible()); assert(await page.locator('#done').isHidden()); assert.equal(state.product.status, 'ACTIVE');
      });
      await check('double-submit', async () => {
        const { id, state } = fixture({ delay: 300 }); await load(page, id); await page.locator('#confirmName').fill(state.product.name);
        await page.evaluate(() => { const form = document.querySelector('#deleteForm'); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); document.querySelector('#deleteButton').click(); });
        assert(await page.locator('#deleteButton').isDisabled()); await success(page); assert.equal(state.deletes.length, 1, 'Busy guard prevents duplicate destructive requests');
      });
      await check('invalid-id-and-text-safety', async () => {
        const before = requests.length; await page.goto(`${base}/admin/product-delete`); await page.locator('#loading').waitFor({ state: 'hidden' });
        assert.match(await page.locator('#status').textContent(), /Open Delete from the Products list/); assert.equal(requests.length, before);
        await load(page, '<invalid>'); assert.equal(requests.length, before);
        const { id, state } = fixture({ product: { name: 'HIDI <img src=x onerror=alert(1)> Office Kurta' } }); await load(page, id);
        assert.equal(await page.locator('#name').textContent(), state.product.name); assert.equal(await page.locator('#name img').count(), 0);
      });
      await check('layout-and-keyboard', async () => {
        const { id } = fixture(); await load(page, id);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
        for (const selector of ['#confirmName', '#deleteButton', '.top a', '#deleteForm a']) {
          const box = await page.locator(selector).boundingBox(); assert(box && box.x >= 0 && box.x + box.width <= viewport.width + 1, `${selector} fits viewport`);
        }
        await page.locator('#confirmName').focus(); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Cancel', 'Disabled delete button is excluded from keyboard order');
        await page.locator('#confirmName').fill(standard.name); await page.locator('#confirmName').focus(); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'deleteButton');
        const outline = await page.locator('#deleteButton').evaluate(el => getComputedStyle(el).outlineStyle); assert.notEqual(outline, 'none', 'Keyboard focus is visible');
        await page.screenshot({ path: resolve(output, `${engine}-${mode}-confirmation.png`) });
      });
      await check('product-links', async () => {
        await page.goto(`${base}/admin/products`); await page.locator('[data-hidi-product-delete]').waitFor();
        assert.equal(await page.locator('[data-hidi-product-delete]').count(), 1); assert.equal(await page.locator('[data-hidi-product-delete]').getAttribute('href'), '/admin/product-delete?product=product-one');
        assert.equal(await page.locator('[data-hidi-product-delete]').getAttribute('aria-label'), 'Delete product Ivory Kurta');
        await page.evaluate(() => { const row = document.createElement('tr'); row.innerHTML = '<td><strong>Blue Kurta</strong><a href="/admin/products/product-two">Edit</a></td><td></td>'; document.querySelector('tbody').append(row); });
        await page.locator('[data-hidi-product-delete="product-two"]').waitFor(); assert.equal(await page.locator('[data-hidi-product-delete]').count(), 2);
        await page.evaluate(() => document.querySelector('main').append(document.createElement('div'))); await page.waitForTimeout(80);
        assert.equal(await page.locator('[data-hidi-product-delete]').count(), 2, 'Mutation observer does not duplicate controls');
        await page.goto(`${base}/admin/products/product-one`); await page.getByRole('link', { name: 'Delete product', exact: true }).waitFor();
        assert.equal(await page.locator('#hidi-delete-product-editor').getAttribute('href'), '/admin/product-delete?product=product-one');
        for (const reserved of ['new', 'price-tags', 'bulk-import']) { await page.goto(`${base}/admin/products/${reserved}`); await page.waitForTimeout(50); assert.equal(await page.locator('#hidi-delete-product-editor').count(), 0); }
      });
      assert.deepEqual(errors, [], `${engine} ${mode}: no uncaught page errors`);
      await context.close();
    }
    await browser.close(); browser = null;
  }
} finally {
  if (browser) await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ scope: 'Isolated localhost API only; no production product/media writes', results, apiRequestCount: requests.length }, null, 2));
}
assert.equal(results.filter(result => result.status === 'FAIL').length, 0, JSON.stringify(results.filter(result => result.status === 'FAIL')));
console.log(`${results.length}/${results.length} product-deletion browser checks passed.`);
