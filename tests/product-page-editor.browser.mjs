import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium, firefox, webkit } = createRequire(import.meta.url)('playwright');
import { handleQuickTools } from '../deploy/admin-tools/handler.mjs';
import { parseEdit, parseVariantEdit, parseStatus } from '../apps/api/src/admin/products/product-input.ts';
const clone = value => structuredClone(value);
const original = { id: 'aashi', skn: '12345', name: 'Aashi Sky Blue Floral Kurta Set', slug: 'aashi-sky-blue-floral-kurta-set', status: 'ACTIVE', updatedAt: '2026-10-13T00:00:00.000Z', categoryId: 'cotton', category: { id: 'cotton', name: 'Casual Wear', slug: 'casual-wear' }, collections: [{ collectionId: 'old-inactive', collection: { id: 'old-inactive', name: 'Retained collection', slug: 'retained' } }], shortDescription: 'Three piece cotton set.\nIncludes: old fallback', description: 'Supplier code: AA_123\nFit: Straight', fabric: 'Cotton', care: 'Gentle Hand Wash / Dry Clean', images: [], variants: ['M', 'L', 'XL', 'XXL'].map((size, index) => ({ id: 'variant-' + size, sku: 'HIDI-KEEP-' + size, size, color: 'Sky Blue with White Floral Print', pricePaise: 199900, mrpPaise: 249900, active: true, weightGrams: 350, bustMm: 1016 + index * 50, waistMm: 965, hipMm: 1067, shoulderMm: 381, sleeveLengthMm: 559, garmentLengthMm: 1143, inventory: { onHand: 8, reserved: 2 }, images: [] })) };
const options = { categories: [original.category], collections: [{ id: 'new', name: 'Work Wear', slug: 'work-wear' }] };
const state = { record: clone(original), writes: [], auth: true, stale: false, loseResponse: false, sequence: 0, uploads: 0 };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture');
  const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  try {
    if (url.pathname.startsWith('/api/admin/')) {
      if (!state.auth) return json({ message: 'Admin session expired' }, 401);
      if (req.method === 'GET') {
        if (url.pathname.endsWith('/options')) return json(options);
        if (url.pathname === '/api/admin/products') return json({ items: [{ id: state.record.id, name: state.record.name, status: 'ACTIVE' }] });
        return json(state.record);
      }
      let raw = ''; for await (const data of req) raw += data;
      if (req.method === 'POST' && url.pathname.endsWith('/images')) { state.uploads++; return json({ saved: true }); }
      const body = JSON.parse(raw), payload = url.pathname.includes('/variants/') ? parseVariantEdit(body) : url.pathname.endsWith('/status') ? parseStatus(body) : parseEdit(body);
      if (state.stale || payload.expectedUpdatedAt.toISOString() !== state.record.updatedAt) return json({ message: 'Product changed. Reload before saving.' }, 409);
      state.writes.push(clone(body));
      if (url.pathname.includes('/variants/')) {
        const v = state.record.variants.find(v => url.pathname.endsWith('/' + v.id)); const { expectedUpdatedAt, ...changes } = payload; Object.assign(v, changes);
      } else if (url.pathname.endsWith('/status')) state.record.status = payload.status;
      else {
        const { expectedUpdatedAt, collectionIds, ...changes } = payload; Object.assign(state.record, changes); assert.deepEqual(collectionIds, ['old-inactive']);
      }
      state.record.updatedAt = new Date(Date.UTC(2026, 9, 13, 0, 0, ++state.sequence)).toISOString();
      // A truncated success body models a completed write without confirmation;
      // sending headers avoids the browser's transport-level request retry.
      if (state.loseResponse) { state.loseResponse = false; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":'); return; }
      return json(state.record);
    }
    if (await handleQuickTools(req, res, url.pathname)) return;
    res.writeHead(404); res.end('Not found');
  } catch (error) { json({ message: error.message }, 400); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
await mkdir('evidence/product-page', { recursive: true });
const engines = process.env.HIDI_EDITOR_ENGINES?.split(',') || ['chromium'];
try {
  for (const engine of engines) {
    const browser = await ({ chromium, firefox, webkit })[engine].launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      state.record = clone(original); state.auth = true; state.stale = false;
      await page.goto(base + '/admin/product-page?product=aashi');
      await page.waitForFunction(() => !document.getElementById('workspace').hidden);
      await page.getByLabel('Included pieces / set contents').fill('1 kurta + 1 pair of pants + 1 dupatta');
      await page.getByLabel('Lining', { exact: true }).fill('Unlined');
      await page.getByLabel('Model information', { exact: true }).fill('168 cm; wears M');
      await page.getByRole('button', { name: 'Preview product page', exact: true }).click();
      assert(await page.locator('#previewFacts').textContent().then(text => text.includes('1 dupatta')));
      await page.screenshot({ path: 'evidence/product-page/' + engine + '-desktop-preview.png', fullPage: true });
      await page.getByRole('button', { name: 'Edit fields', exact: true }).click();
      await page.getByRole('button', { name: 'Save product fields', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('status').className === 'success');
      assert(state.record.description.includes('Includes: 1 kurta + 1 pair of pants + 1 dupatta'));
      assert(state.record.description.includes('Supplier code: AA_123')); assert.equal(state.record.status, 'ACTIVE'); assert.deepEqual(state.record.variants, original.variants);
      await page.reload(); await page.waitForFunction(() => !document.getElementById('workspace').hidden);
      assert.equal(await page.getByLabel('Included pieces / set contents').inputValue(), '1 kurta + 1 pair of pants + 1 dupatta');
      await page.getByLabel('Included pieces / set contents').fill(''); await page.getByRole('button', { name: 'Save product fields' }).click();
      await page.waitForFunction(() => document.getElementById('status').className === 'success');
      assert(!/Includes:/i.test(state.record.description + state.record.shortDescription));
      await page.getByLabel('Garment bust (cm)').fill('105.5'); await page.getByRole('button', { name: 'Save this SKU' }).click();
      await page.waitForFunction(() => document.getElementById('status').textContent === 'SKU price and fit saved.');
      assert.equal(state.record.variants[0].bustMm, 1055); assert.equal(state.record.variants[0].sku, original.variants[0].sku); assert.deepEqual(state.record.variants[0].inventory, original.variants[0].inventory);
      state.stale = true; await page.getByLabel('Fabric / composition').fill('Verified cotton blend'); await page.getByRole('button', { name: 'Save product fields' }).click();
      await page.waitForFunction(() => document.getElementById('status').className === 'error'); assert.equal(await page.getByLabel('Fabric / composition').inputValue(), 'Verified cotton blend'); assert.equal(state.record.fabric, 'Cotton');
      state.stale = false; state.loseResponse = true; await page.getByRole('button', { name: 'Save product fields' }).click();
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('could not be confirmed'));
      assert(await page.getByRole('button', { name: 'Save product fields' }).isDisabled());
      page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reload saved values' }).click();
      await page.waitForFunction(() => document.getElementById('status').textContent === 'Latest saved values loaded.'); assert.equal(await page.getByLabel('Fabric / composition').inputValue(), 'Verified cotton blend');
      for (const width of [320, 390, 844]) { await page.setViewportSize({ width, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at ' + width); }
      await page.screenshot({ path: 'evidence/product-page/' + engine + '-tablet-edit.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: 'evidence/product-page/' + engine + '-mobile-edit.png', fullPage: true });
      page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Move to draft', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('status').textContent === 'Publication status saved: DRAFT.'); assert.equal(state.record.status, 'DRAFT');
      page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Publish storefront', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('status').textContent === 'Publication status saved: ACTIVE.'); assert.equal(state.record.status, 'ACTIVE');
      const beforeUploads = state.uploads;
      await page.locator('#photos').setInputFiles([{ name: 'not-a-photo.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') }]);
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Nothing was uploaded')); assert.equal(state.uploads, beforeUploads);
      state.auth = false; await page.reload(); await page.waitForFunction(() => !document.getElementById('auth').hidden); assert(await page.getByRole('button', { name: 'Find product' }).isDisabled()); assert(await page.locator('#workspace').isHidden());
      assert.deepEqual(errors, []); console.log(engine + ': persistence, facts clearing, SKU preservation, stale save, lost response, mobile layout, photo preflight and auth passed');
    } finally { await browser.close(); }
  }
  const response = await fetch(base + '/admin/product-page'); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive'); assert(response.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.equal((await fetch(base + '/admin/product-page', { method: 'POST' })).status, 405);
} finally { await new Promise(resolve => server.close(resolve)); }
