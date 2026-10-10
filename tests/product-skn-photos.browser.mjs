// Run the actual photo matching page against local fixtures. No Azure, SQL or Blob writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const playwright = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const assets = process.env.HIDI_CANDIDATE_RUNTIME ? pathToFileURL(join(process.env.HIDI_CANDIDATE_RUNTIME, 'admin-tools') + '/') : new URL('../deploy/admin-tools/', import.meta.url);
const output = new URL('../test-results/product-skn-photos/', import.meta.url); await mkdir(output, { recursive: true });
await writeFile(new URL('report.json', output), JSON.stringify({ passed: false, state: 'running', liveWrites: false }));
const files = new Set(['admin-tools.css', 'product-photos.mjs', 'product-photo-match.mjs']);
const photo = name => ({ name, mimeType: name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg', buffer: Buffer.from('preserved-fixture-photo-bytes:' + name) });
let products, posts, unauthorized, failure, activePosts, maxActivePosts, malformedCatalogue;
function reset() {
  products = [
    { id: 'p1', skn: '12345', name: "Women's Magenta Floral Embroidered Anarkali Suit", status: 'DRAFT', category: { name: 'Casual Wear' }, variants: ['XXL', 'L', 'M', 'XL'].map(size => ({ id: 'pink-' + size, color: 'Magenta Pink', size, sku: 'PINK-' + size, images: [] })) },
    { id: 'p2', skn: '54321', name: 'Blue work kurta', status: 'ACTIVE', category: { name: 'Work Wear' }, variants: ['Blue', 'Cream'].flatMap(color => ['M', 'L'].map(size => ({ id: color + '-' + size, color, size, sku: color + '-' + size, images: [] }))) },
    { id: 'p3', skn: '67890', name: 'Archived product', status: 'ARCHIVED', variants: [] },
  ]; posts = []; unauthorized = false; failure = ''; activePosts = 0; maxActivePosts = 0; malformedCatalogue = false;
}
function json(response, status, value) { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); }
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.test');
    if (url.pathname === '/admin/product-photos') { response.writeHead(200, { 'content-type': 'text/html' }); return response.end(await readFile(new URL('product-photos.html', assets))); }
    if (url.pathname.startsWith('/admin-tools-assets/')) { const name = url.pathname.split('/').pop(); if (!files.has(name)) return json(response, 404, {}); response.writeHead(200, { 'content-type': name.endsWith('.css') ? 'text/css' : 'text/javascript' }); return response.end(await readFile(new URL(name, assets))); }
    if (url.pathname.startsWith('/api/admin/') && unauthorized) return json(response, 401, { message: 'Admin sign-in required' });
    if (url.pathname === '/api/admin/products/options') return json(response, 200, { categories: [] });
    if (url.pathname === '/api/admin/products') {
      const q = url.searchParams.get('q');
      if (q) return json(response, 200, { items: products.filter(product => product.skn === q), total: products.filter(product => product.skn === q).length });
      if (malformedCatalogue) return json(response, 200, { items: [], total: 3 });
      const page = Number(url.searchParams.get('page') || 1); return json(response, 200, { items: products.slice((page - 1) * 2, page * 2).map(({ variants, ...product }) => product), total: products.length });
    }
    if (url.pathname.startsWith('/api/admin/products/')) { const id = decodeURIComponent(url.pathname.split('/').pop()); const product = products.find(product => product.id === id); return json(response, product ? 200 : 404, product || { message: 'Product not found' }); }
    if (request.method === 'POST' && /^\/api\/admin\/inventory\/[^/]+\/images$/.test(url.pathname)) {
      activePosts++; maxActivePosts = Math.max(maxActivePosts, activePosts);
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const form = await new Request('http://fixture.test/', { method: 'POST', headers: { 'content-type': request.headers['content-type'] }, body: Buffer.concat(chunks) }).formData();
      const file = form.get('file'), variantId = decodeURIComponent(url.pathname.split('/')[4]);
      const product = products.find(product => product.variants.some(variant => variant.id === variantId)); const source = product?.variants.find(variant => variant.id === variantId);
      assert.ok(source); assert.equal(form.get('applyToColor'), 'true'); assert.ok(['true', 'false'].includes(form.get('isMain')));
      assert.equal(Buffer.from(await file.arrayBuffer()).toString(), 'preserved-fixture-photo-bytes:' + file.name);
      const record = { filename: file.name, variantId, colour: source.color, isMain: form.get('isMain') === 'true', alt: form.get('alt') }; posts.push(record);
      const fail = failure; failure = '';
      if (fail !== 'before-commit') {
        const image = { id: 'img-' + posts.length, url: 'https://fixture.invalid/' + posts.length + '-' + file.name, alt: record.alt };
        for (const variant of product.variants.filter(variant => variant.color === source.color)) record.isMain ? variant.images.unshift({ ...image }) : variant.images.push({ ...image });
      }
      await new Promise(resolve => setTimeout(resolve, 10)); activePosts--;
      return fail ? json(response, 502, { message: 'Fixture interrupted upload response' }) : json(response, 200, { id: source.id, sku: source.sku, images: source.images });
    }
    return json(response, 404, { message: 'Fixture route not found' });
  } catch (error) { activePosts = Math.max(0, activePosts - 1); return json(response, 500, { message: error.message }); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
const opened = []; const results = []; let checks = 0;
try {
  for (const engine of (process.env.HIDI_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
    reset();
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'firefox' ? { env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1' } } : {}) }); opened.push(browser);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    await page.goto(base + '/admin/product-photos'); await page.waitForFunction(() => !document.querySelector('#preview').disabled);
    assert.equal(posts.length, 0); checks++;
    const downloadPromise = page.waitForEvent('download'); await page.locator('#catalogue').click(); const download = await downloadPromise;
    const catalogue = await readFile(await download.path(), 'utf8'); assert.match(catalogue, /12345_001_main.webp/); assert.match(catalogue, /Magenta Pink/); assert.match(catalogue, /SKU|PINK-M/); assert.ok(!catalogue.includes('Archived product')); assert.equal(posts.length, 0); checks += 5;
    await page.locator('#files').setInputFiles([photo('12345_002.jpeg'), photo('12345_001_main.webp'), photo('54321_001_main.png')]); await page.locator('#preview').click(); await page.locator('#review').waitFor();
    assert.equal(posts.length, 0); assert.equal(await page.locator('#upload').isDisabled(), true); assert.match(await page.locator('#errors').innerText(), /Choose the photo colour/); assert.match(await page.locator('#products').innerText(), /M, L, XL, XXL/); checks += 4;
    await page.locator('[data-photo-colour="54321"]').selectOption('Blue'); assert.equal(await page.locator('#upload').isDisabled(), false); checks++;
    await page.locator('#upload').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('All matched photos uploaded successfully'));
    assert.deepEqual(posts.map(post => post.filename), ['12345_001_main.webp', '12345_002.jpeg', '54321_001_main.png']); assert.equal(maxActivePosts, 1);
    assert.equal(products[0].variants.every(variant => variant.images.length === 2 && variant.images[0].alt.includes('_main.webp')), true);
    assert.equal(products[1].variants.filter(variant => variant.color === 'Blue').every(variant => variant.images.length === 1), true);
    assert.equal(products[1].variants.filter(variant => variant.color === 'Cream').every(variant => variant.images.length === 0), true); assert.equal(await page.locator('#upload').isDisabled(), true); checks += 6;
    const completed = posts.length;
    await page.locator('#files').setInputFiles([photo('99999_001.jpeg'), photo('12345_003.jpeg')]); await page.locator('#preview').click(); await page.waitForFunction(() => document.querySelector('#errors').textContent.includes('No product has SKN 99999'));
    assert.equal(await page.locator('#upload').isDisabled(), true); assert.equal(posts.length, completed); checks += 2;
    await page.locator('#files').setInputFiles([photo('12345_003.jpeg'), photo('12345_003_main.webp')]); await page.locator('#preview').click(); await page.waitForFunction(() => document.querySelector('#errors').textContent.includes('Duplicate photo number'));
    assert.equal(await page.locator('#upload').isDisabled(), true); assert.equal(posts.length, completed); checks += 2;
    await page.locator('#files').setInputFiles([photo('12345_003.jpeg'), photo('12345_004.jpeg')]); await page.locator('#preview').click(); await page.waitForFunction(() => !document.querySelector('#upload').disabled);
    failure = 'after-commit'; await page.locator('#upload').click(); await page.waitForFunction(() => document.querySelector('[data-photo-recheck]'));
    assert.equal(posts.length, completed + 1); assert.equal(await page.locator('#upload').isDisabled(), true); assert.ok(!posts.some(post => post.filename === '12345_004.jpeg')); checks += 3;
    await page.locator('[data-photo-recheck]').click(); await page.waitForFunction(() => !document.querySelector('#upload').disabled);
    assert.match(await page.locator('#products').innerText(), /attachment confirmed for every size/);
    await page.locator('#upload').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('All matched photos uploaded successfully'));
    assert.equal(posts.filter(post => post.filename === '12345_003.jpeg').length, 1); assert.equal(posts.filter(post => post.filename === '12345_004.jpeg').length, 1); checks += 3;
    await page.locator('#files').setInputFiles([photo('12345_005.jpeg')]); await page.locator('#preview').click(); await page.waitForFunction(() => !document.querySelector('#upload').disabled);
    failure = 'before-commit'; await page.locator('#upload').click(); await page.waitForFunction(() => document.querySelector('[data-photo-recheck]'));
    await page.locator('[data-photo-recheck]').click(); await page.locator('[data-photo-retry]').waitFor(); assert.equal(await page.locator('#upload').isDisabled(), true); checks++;
    await page.locator('[data-photo-retry]').click(); await page.locator('#upload').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('All matched photos uploaded successfully'));
    assert.equal(products[0].variants.every(variant => variant.images.filter(image => image.alt.includes('12345_005.jpeg')).length === 1), true); assert.equal(posts.filter(post => post.filename === '12345_005.jpeg').length, 2); checks += 2;
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); checks++; if (width === 390 || width === 1440) await page.screenshot({ path: join(output.pathname, `${engine}-${width}.png`), fullPage: true }); }
    malformedCatalogue = true; const downloads = []; page.on('download', value => downloads.push(value)); await page.locator('#catalogue').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('No partial CSV'));
    assert.equal(downloads.length, 0); checks++; malformedCatalogue = false;
    unauthorized = true; await page.goto(base + '/admin/product-photos'); await page.locator('#auth').waitFor(); assert.equal(await page.locator('#files').isDisabled(), true); assert.equal(await page.locator('#preview').isDisabled(), true); assert.equal(await page.locator('#catalogue').isDisabled(), true); checks += 3;
    assert.deepEqual(errors, []); checks++; results.push({ engine, passed: true }); console.log(`PASS ${engine}: SKN catalogue, complete read-only preview, exact matching, colour choice, sequential original-byte upload, duplicate and unknown blocks, interrupted-response confirmation, explicit retry, authentication, mobile bounds`);
    await page.close(); await browser.close();
  }
  const report = { passed: true, checks, results, liveWrites: false }; await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { for (const browser of opened) await browser.close().catch(() => {}); server.closeAllConnections(); server.close(); }
