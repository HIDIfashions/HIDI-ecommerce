/** Isolated browser fixtures: no real staff, orders, shipments or refunds are created. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const port = 3100, upstreamPort = 4100, base = `http://127.0.0.1:${port}`;
const output = resolve('test-results/admin-workspace'); await mkdir(output, { recursive: true });
const upstreamRequests = [], contexts = [], diagnostics = [];
const upstream = createServer((req, res) => { upstreamRequests.push({ url: req.url, authorization: req.headers.authorization }); res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Test upstream: invalid staff token' })); });
await new Promise(resolve => upstream.listen(upstreamPort, '127.0.0.1', resolve));
const server = spawn(process.execPath, [resolve('apps/web/node_modules/next/dist/bin/next'), 'start', '-p', String(port)], { cwd: resolve('apps/web'), env: { ...process.env, API_URL: `http://127.0.0.1:${upstreamPort}/v1`, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', b => { log += b; }); server.stderr.on('data', b => { log += b; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser; let passes = 0;
const passed = name => { passes++; diagnostics.push(`PASS ${passes}: ${name}`); console.log(diagnostics.at(-1)); };
const istToday = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const order = { id: 'ci-order-1', orderNumber: 'HIDI-CI-1042', status: 'CONFIRMED', totalPaise: 599800, createdAt: new Date().toISOString(), customerPhone: '9999999999', customerEmail: 'fixture@example.test', itemCount: 2, payments: [{ status: 'CAPTURED' }], shipments: [] };
function overview(url, empty = false) {
  const from = url.searchParams.get('from') || istToday(), to = url.searchParams.get('to') || from;
  const days = Math.min(90, Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1));
  const series = Array.from({ length: days }, (_, i) => ({ day: new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10), salesPaise: empty ? 0 : i === days - 1 ? 599800 : 0, orders: empty ? 0 : i === days - 1 ? 3 : 0, previousSalesPaise: empty ? 0 : i === days - 1 ? 499800 : 0, previousOrders: empty ? 0 : i === days - 1 ? 2 : 0 }));
  return { asOf: new Date().toISOString(), period: { from, to, days }, metrics: { salesPaise: empty ? 0 : 599800, previousSalesPaise: empty ? 0 : 499800, salesChange: empty ? null : 20, orders: empty ? 0 : 3, ordersChange: empty ? null : 50, aovPaise: empty ? 0 : 199933, processedCashRefundsPaise: 0, pendingReturns: empty ? 0 : 2, lowStock: empty ? 0 : 1 }, series, pipeline: [{ status: 'CONFIRMED', count: empty ? 0 : 3 }], recentOrders: empty ? [] : [order], bestsellers: empty ? [] : [{ productId: 'ci-product', name: 'CI fixture kurta', quantity: 2, salesPaise: 599800 }], definitions: { sales: 'Booked value is not cash collected or accounting revenue.', refunds: 'Cash refunds exclude wallet credits.', comparison: 'Previous equal-length calendar period; today is incomplete.' } };
}
async function fixtureContext(options = {}) {
  const state = { role: 'OWNER', mode: 'normal', calls: [], ...options };
  const context = await browser.newContext({ viewport: state.viewport || { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); contexts.push(context);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort();
    if (!url.pathname.startsWith('/api/admin/')) return route.continue();
    state.calls.push(url.pathname + url.search);
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/admin/session') return send({ admin: { id: 'ci-fixture-staff', displayName: 'CI Fixture', email: 'fixture@example.test', role: state.role } });
    if (url.pathname.endsWith('/overview')) return state.mode === 'error' ? send({ message: 'CI simulated reporting outage' }, 502) : send(overview(url, state.mode === 'empty'));
    if (url.pathname.endsWith('/search')) return send({ results: [{ id: 'ci-customer', kind: 'Customer', title: 'CI Fixture Customer', detail: 'View orders', href: '/admin/orders?q=9999999999' }] });
    if (url.pathname.endsWith('/queue')) {
      const kind = url.searchParams.get('kind'), page = Number(url.searchParams.get('page') || 1);
      return send({ kind, page, pageSize: 25, total: 53, asOf: new Date().toISOString(), rows: kind === 'returns' ? [{ id: 'ci-return-1', type: 'RETURN', status: 'REQUESTED', reason: 'CI fixture size mismatch', quantity: 1, refundPaise: 199900, createdAt: new Date().toISOString(), order: { orderNumber: order.orderNumber, customerPhone: order.customerPhone }, orderItem: { productName: 'CI fixture kurta', size: 'M' } }] : [order] });
    }
    return send({ message: 'Unexpected fixture request' }, 404);
  });
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => { errors.push(error.message); diagnostics.push('PAGE ERROR: ' + error.stack); });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) diagnostics.push('NAVIGATION: ' + frame.url()); });
  return { context, page, state, errors };
}
async function waitText(page, text) { await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 }); }
async function noOverflow(page) { const sizes = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth })); assert(sizes.scroll <= sizes.viewport + 1, JSON.stringify(sizes)); }
try {
  let ready = false;
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw new Error('Next.js exited: ' + log.slice(-2000)); try { const r = await fetch(base + '/admin'); if (r.ok) { ready = true; break; } } catch {} await sleep(1000); }
  assert(ready, 'Next.js did not start: ' + log.slice(-2000));
  const noAuth = await fetch(base + '/api/admin/dashboard/overview'); assert.equal(noAuth.status, 401); assert.match(noAuth.headers.get('cache-control'), /private.*no-store/);
  const badToken = await fetch(base + '/api/admin/dashboard/overview?from=2020-01-01&to=2020-01-01&unexpected=drop', { headers: { Cookie: 'hidi_admin_access=ci-invalid-token' } });
  assert.equal(badToken.status, 401); assert(upstreamRequests.some(r => r.authorization === 'Bearer ci-invalid-token')); assert(upstreamRequests.every(r => !r.url.includes('unexpected')));
  assert.equal((await fetch(base + '/api/admin/dashboard/not-allowed', { headers: { Cookie: 'hidi_admin_access=ci-invalid-token' } })).status, 404);
  for (const token of [null, 'ci-invalid-token']) {
    const deniedInventory = await fetch(base + '/api/admin/inventory', {
      headers: token ? { Cookie: 'hidi_admin_access=' + token } : {},
    });
    assert.equal(deniedInventory.status, 401, 'inventory preserves the upstream authentication status');
  }
  passed('real Next.js BFF denies missing and forged sessions; forwards only allowed filters');
  browser = await chromium.launch({ headless: true });
  const signedOut = await browser.newPage(); await signedOut.goto(base + '/admin'); await waitText(signedOut, 'Secure staff access'); assert.equal(await signedOut.getByRole('heading', { name: 'Overview', exact: true }).count(), 0); await signedOut.close(); passed('signed-out workspace does not render operational data');
  const { page, context, state, errors } = await fixtureContext();
  await page.goto(base + '/admin'); await waitText(page, 'Booked order value'); await noOverflow(page);
  assert(await page.getByText('₹5,998.00', { exact: true }).count() >= 1);
  await page.screenshot({ path: resolve(output, 'desktop-overview.png'), fullPage: true });
  await page.getByRole('button', { name: '7 days', exact: true }).click(); await waitText(page, 'Booked order value');
  assert(state.calls.some(url => url.includes('/overview?from=')));
  await page.getByText('View chart data', { exact: true }).click(); await waitText(page, 'Date (IST)');
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export daily report' }).click(); const download = await downloadEvent; assert(download.suggestedFilename().startsWith('hidi-daily-orders-'));
  passed('overview figures, date presets, accessible chart table and daily CSV download');
  await page.keyboard.press('Control+k'); await page.getByRole('combobox').fill('Fixture'); await page.getByRole('option').filter({ hasText: 'CI Fixture Customer' }).waitFor();
  await page.screenshot({ path: resolve(output, 'global-search.png') });
  await page.getByRole('combobox').press('Enter');
  await page.waitForURL(url => url.pathname === '/admin/orders' && url.searchParams.get('q') === '9999999999', { timeout: 15000 }); await waitText(page, 'HIDI-CI-1042'); passed('global search keyboard navigation opens customer order results');
  await page.goto(base + '/admin/deliveries'); await waitText(page, 'HIDI-CI-1042'); await noOverflow(page);
  await page.getByRole('button', { name: /Next/ }).click(); await page.waitForURL(url => url.searchParams.get('page') === '2'); await waitText(page, 'HIDI-CI-1042');
  await page.screenshot({ path: resolve(output, 'desktop-deliveries.png'), fullPage: true }); passed('delivery queue pagination and carrier fallback');
  await page.goto(base + '/admin/returns'); await waitText(page, 'CI fixture size mismatch'); passed('item-level return queue renders reason, quantity and order link');
  state.mode = 'empty'; await page.goto(base + '/admin'); await waitText(page, 'No qualifying orders in this period'); passed('empty reporting state shows zeroes, never sample data');
  state.mode = 'error'; await page.reload(); await waitText(page, 'This view could not be loaded.'); assert.equal(await page.getByText('Booked order value', { exact: true }).count(), 0); passed('outage is visibly distinct from zero sales');
  assert.deepEqual(errors, []); await context.close();
  const catalog = await fixtureContext({ role: 'CATALOG' }); await catalog.page.goto(base + '/admin'); await waitText(catalog.page, 'Access is limited to your role');
  assert.equal(await catalog.page.getByRole('link', { name: 'Orders', exact: true }).count(), 0); assert.equal(await catalog.page.getByRole('link', { name: 'Team & access', exact: true }).count(), 0);
  assert(!catalog.state.calls.some(url => /dashboard\/(overview|queue)/.test(url))); await catalog.context.close(); passed('catalogue role has no order dashboard or team controls');
  const mobile = await fixtureContext({ viewport: { width: 390, height: 844 } }); await mobile.page.goto(base + '/admin'); await waitText(mobile.page, 'Booked order value'); await noOverflow(mobile.page);
  await mobile.page.screenshot({ path: resolve(output, 'mobile-overview.png'), fullPage: true });
  await mobile.page.getByRole('button', { name: 'Open navigation' }).click(); await mobile.page.getByRole('dialog', { name: 'Admin navigation' }).waitFor(); await mobile.page.keyboard.press('Escape');
  assert.equal(await mobile.page.getByRole('dialog', { name: 'Admin navigation' }).count(), 0);
  await mobile.page.goto(base + '/admin/orders'); await waitText(mobile.page, 'HIDI-CI-1042'); await noOverflow(mobile.page); assert.deepEqual(mobile.errors, []); await mobile.context.close(); passed('390px mobile layout, navigation dialog and contained table overflow');
  console.log(`${passes} browser checks passed. Isolated UI fixtures only; not a live order lifecycle certification.`);
  await writeFile(resolve(output, 'result.txt'), `${passes} browser checks passed. No live data changes or cloud resources.\n`);
} catch (error) {
  diagnostics.push(error instanceof Error ? error.stack : String(error));
  for (let i = 0; i < contexts.length; i++) for (const page of contexts[i].pages()) {
    diagnostics.push('FAILURE URL: ' + page.url());
    await page.screenshot({ path: resolve(output, `failure-${i}.png`), fullPage: true }).catch(() => {});
    diagnostics.push(await page.locator('body').innerText().catch(() => 'Body unavailable'));
  }
  throw error;
} finally { await writeFile(resolve(output, 'browser-diagnostics.txt'), diagnostics.join('\n\n')); if (browser) await browser.close(); server.kill('SIGTERM'); await new Promise(resolve => upstream.close(resolve)); await writeFile(resolve(output, 'next-server.log'), log); }
