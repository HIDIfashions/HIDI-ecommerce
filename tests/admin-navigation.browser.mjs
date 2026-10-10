import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const playwright = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const navigation = await readFile(process.env.HIDI_CANDIDATE_RUNTIME ? join(process.env.HIDI_CANDIDATE_RUNTIME, 'admin-tools/navigation.js') : new URL('../deploy/admin-tools/navigation.js', import.meta.url));
const tools = [
  ['/admin/landing-media', 'Media Upload', 'media'],
  ['/admin/packing-scanner', 'Packing Scanner', 'packing'],
  ['/admin/product-quick-fill', 'Product Quick Fill', 'quick-fill'],
  ['/admin/product-bulk', 'Bulk Product Details', 'bulk-details'],
];
const native = [
  ['/admin', 'Overview'], ['/admin/orders', 'Orders'], ['/admin/deliveries', 'Deliveries'],
  ['/admin/returns', 'Returns & exchanges'], ['/admin/reports', 'Sales & reports'],
  ['/admin/products', 'Products'], ['/admin/products/price-tags', 'Price tags'],
  ['/admin/inventory', 'Inventory'], ['/admin/inventory/receive', 'Receive stock'],
  ['/admin/import', 'Bulk imports'], ['/admin/customers', 'Customers'],
  ['/admin/staff', 'Team & access'], ['/admin/privacy-policy', 'Privacy policy'],
];
const nativeMarkup = (path = '/admin/products') => `<div class="admin_navGroup_fixture"><p>Workspace</p>${native.map(([href, text]) => `<a href="${href}" class="admin_navLink_hashABC${path === href ? ' admin_navActive_otherHash' : ''}"${path === href ? ' aria-current="page"' : ''}><svg width="18" height="18" aria-hidden="true"></svg><span>${text}</span></a>`).join('')}</div>`;
const legacyLinks = '<a href="/admin/landing-media">Media Upload</a><a href="/admin/landing-media" data-hidi-admin-tab="media" style="color:red">Media Upload</a><a href="/admin/packing-scanner" data-hidi-admin-tab="packing">Packing Scanner</a><a href="/admin/product-quick-fill" data-hidi-quick-fill="true">Product Quick Fill</a><a href="/admin/product-bulk" data-hidi-bulk-details="true">Bulk Product Details</a>';
// Reproduce the older injector's marker-based checks while both observers are active.
const legacyScript = `(() => { let pending = false; function add() { const nav = document.querySelector('nav[aria-label="Admin navigation"]'); if (!nav) return; for (const [key,href,text] of [['media','/admin/landing-media','Media Upload'],['packing','/admin/packing-scanner','Packing Scanner']]) { if (nav.querySelector('[data-hidi-admin-tab="'+key+'"]')) continue; const a = document.createElement('a'); a.href = href; a.textContent = text; a.dataset.hidiAdminTab = key; nav.append(a); } } function schedule() { if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;add()}); } new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});schedule(); })();`;
const server = createServer((req, res) => {
  if (req.url === '/navigation.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(navigation); }
  const path = new URL(req.url, 'http://fixture.test').pathname;
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.workspace{--admin-gold:#edc36d;display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100dvh}aside{background:#591d20;color:#fff8ef;padding:24px 16px;height:100dvh;overflow:auto}.admin_navGroup_fixture{margin-bottom:22px}.admin_navGroup_fixture>p{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:#e6c9ba;margin:0 16px 9px}.admin_navLink_hashABC{display:flex;align-items:center;gap:12px;min-height:44px;padding:11px 14px;border-radius:9px;font-size:13px;color:#f4e5dc;text-decoration:none}.admin_navActive_otherHash{background:#edc36d22;color:#ffe3a7;box-shadow:inset 3px 0 #edc36d}main{padding:24px;min-width:0}dialog{width:290px;max-width:85vw;height:100dvh;max-height:100dvh;margin:0;padding:28px 18px;border:0;background:#591d20;color:#fff8ef;overflow:auto}#open{min-height:44px}dialog>button{margin-bottom:16px}@media(max-width:900px){.workspace{grid-template-columns:minmax(0,1fr)}aside{display:none}}
  </style></head><body><div class="workspace"><aside><nav id="desktop" aria-label="Admin navigation">${nativeMarkup(path)}${legacyLinks}</nav></aside><main><button id="open" onclick="document.querySelector('dialog').showModal()">Open navigation</button><header><nav id="legacy-content" aria-label="Admin navigation"><a href="/admin/orders">Orders</a><a href="/admin/products">Products</a></nav></header><h1>Admin products</h1></main><dialog><button onclick="this.closest('dialog').close()">Close navigation</button><nav id="mobile" aria-label="Admin navigation">${nativeMarkup(path)}${legacyLinks}</nav></dialog></div><script>${legacyScript}</script><script src="/navigation.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const out = new URL('../test-results/admin-navigation/', import.meta.url); await mkdir(out, { recursive: true });
const opened = []; const results = []; let checks = 0;
try {
  for (const engine of (process.env.HIDI_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'firefox' ? { env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1' } } : {}) }); opened.push(browser);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/admin/products'); await page.locator('#desktop [data-hidi-admin-tool]').nth(3).waitFor();
    async function verifyNavigation() {
      for (const id of ['desktop', 'mobile']) {
        const nav = page.locator('#' + id);
        assert.equal(await nav.locator('[data-hidi-tools-group]').count(), 1);
        assert.deepEqual(await nav.locator('[data-hidi-admin-tool] span').allTextContents(), tools.map(item => item[1]));
        assert.deepEqual(await nav.locator('a:not([data-hidi-admin-tool]) span').allTextContents(), native.map(item => item[1]));
        for (const [href, label, key] of tools) {
          const row = nav.locator(`[data-hidi-admin-tool="${key}"]`);
          assert.equal(await nav.locator(`a[href="${href}"]`).count(), 1);
          assert.equal(await row.getAttribute('href'), href); assert.equal(await row.getAttribute('class'), 'admin_navLink_hashABC');
          assert.equal(await row.locator('svg[aria-hidden="true"]').count(), 1); assert.equal((await row.innerText()).trim(), label);
          assert.equal(await row.evaluate(link => getComputedStyle(link).display), 'flex');
          assert.ok(await row.evaluate(link => parseFloat(getComputedStyle(link).minHeight) >= 44)); checks += 7;
        }
        assert.equal(await nav.locator('[data-hidi-admin-tab="media"]').count(), 1);
        assert.equal(await nav.locator('[data-hidi-admin-tab="packing"]').count(), 1); checks += 5;
      }
    }
    await verifyNavigation();
    assert.equal(await page.locator('#legacy-content [data-hidi-admin-tool]').count(), 0); checks++;
    assert.equal(await page.locator('#desktop a[href="/admin/products"]').getAttribute('aria-current'), 'page'); checks++;
    await page.screenshot({ path: new URL(`desktop-${engine}.png`, out).pathname, fullPage: true });
    for (const [href, , key] of tools) {
      await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, href);
      await page.locator(`#desktop [data-hidi-admin-tool="${key}"][aria-current="page"]`).waitFor();
      for (const id of ['desktop', 'mobile']) { assert.equal(await page.locator(`#${id} a[aria-current="page"]`).count(), 1); assert.equal(await page.locator(`#${id} a:not([data-hidi-admin-tool])[class*="navActive"]`).count(), 0); checks += 2; }
      assert.equal(await page.locator(`#desktop [data-hidi-admin-tool="${key}"]`).evaluate(link => getComputedStyle(link).color), 'rgb(255, 227, 167)'); checks++;
    }
    // React hydration/navigation can replace a nav; all tabs must recover without duplicates.
    await page.evaluate(markup => { document.querySelector('#desktop').innerHTML = markup; }, nativeMarkup('/admin/products'));
    await page.locator('#desktop [data-hidi-admin-tool]').nth(3).waitFor(); await verifyNavigation();
    // Late legacy additions are adopted, with the old marker still preventing re-injection.
    await page.evaluate(() => { const a = document.createElement('a'); a.href = '/admin/landing-media'; a.textContent = 'Media Upload'; document.querySelector('#desktop').append(a); });
    await page.waitForFunction(() => document.querySelectorAll('#desktop a[href="/admin/landing-media"]').length === 1); checks++;
    for (const width of [320, 360, 390, 768]) {
      await page.setViewportSize({ width, height: 900 }); await page.locator('#open').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const rows = await page.locator('#mobile [data-hidi-admin-tool]').evaluateAll(links => links.map(link => { const box = link.getBoundingClientRect(); return { x: box.x, right: box.right, top: box.top, bottom: box.bottom, height: box.height }; }));
      for (let i = 0; i < rows.length; i++) { assert.ok(rows[i].x >= 0 && rows[i].right <= width && rows[i].height >= 44); if (i) assert.ok(rows[i].top >= rows[i - 1].bottom); }
      await page.locator('#mobile [data-hidi-admin-tool="bulk-details"]').scrollIntoViewIfNeeded();
      if (width === 390) await page.screenshot({ path: new URL(`mobile-${engine}.png`, out).pathname });
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click(); checks += 5;
    }
    await page.goto(base + '/storefront'); assert.equal(await page.locator('[data-hidi-admin-tool]').count(), 0); checks++;
    assert.deepEqual(errors, []); checks++; results.push({ engine, passed: true }); console.log(`PASS ${engine}: four themed tabs, existing tabs retained, both menus, active routes, legacy normalization, hydration and mobile bounds`);
    await page.close(); await browser.close();
  }
  console.log(JSON.stringify({ passed: true, checks, results }));
} finally { for (const browser of opened) await browser.close().catch(() => {}); server.closeAllConnections(); server.close(); }
