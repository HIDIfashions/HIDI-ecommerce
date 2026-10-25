// Real Next routes + browser, with a disposable upstream. Never connects to HIDI production.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
// HIDI's existing dev API client uses localhost:4000 regardless of API_URL.
const port = 3194, upstreamPort = 4000, base = `http://127.0.0.1:${port}`;
const directory = resolve('test-results/delhivery-sync'); await mkdir(directory, { recursive: true });
const requests = [], errors = [];
const order = { id: 'fixture-order', orderNumber: 'HIDI-DELIVERY-TEST', status: 'SHIPPED', createdAt: '2026-10-20T00:00:00Z',
  totalPaise: 187800, subtotalPaise: 187800, shippingPaise: 0, discountPaise: 0, itemCount: 1,
  customerPhone: '9000000000', customerEmail: 'fixture@example.test', shippingAddress: { firstName: 'Test customer', line1: 'Test address', city: 'Hyderabad', postalCode: '500001' },
  payment: { provider: 'COD', method: 'cod', status: 'CREATED', amountPaise: 187800 },
  shipment: { provider: 'DELHIVERY', awb: 'TEST123', status: 'SHIPPED', trackingUrl: 'https://example.test/tracking' },
  items: [{ id: 'item-1', productName: 'Test Kurta', color: 'Yellow', size: 'M', sku: 'TEST-M', quantity: 1, totalPaise: 187800 }],
  returns: [], auditEvents: [],
};
const upstream = createServer(async (req, res) => {
  const send = (data, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  requests.push({ path: req.url, body, authorization: req.headers.authorization });
  if (req.url === '/v1/admin/me') return send({ admin: { id: 'test-admin', role: 'OWNER', displayName: 'Test admin', permissions: ['order:read', 'order:write'] } });
  if (req.url === '/v1/admin/orders/HIDI-DELIVERY-TEST') return send({ order });
  if (req.url.endsWith('/status')) {
    assert.deepEqual(body, { status: 'DELIVERED' });
    order.status = 'DELIVERED'; order.shipment.status = 'DELIVERED';
    order.shipment.deliveredAt = '2026-10-24T07:15:00Z';
    return send({ order });
  }
  if (req.url.endsWith('/cod-collection')) {
    assert.deepEqual(body, { confirmed: true, amountPaise: 187800 });
    assert.equal(req.headers.authorization, 'Bearer fixture-only');
    order.payment.status = 'CAPTURED'; return send({ collected: true });
  }
  return send({ message: 'Unmatched fixture route' }, 404);
});
await new Promise(resolve => upstream.listen(upstreamPort, '127.0.0.1', resolve));
// Compare errors with the untouched retained image: its existing outer HTML
// injector currently produces a React hydration warning, which this change must not increase.
const baselineErrors = [];
if (process.env.HIDI_BASELINE_WEB) {
  const baselineName='delivery-browser-baseline';
  const baseline=spawn('docker',['run','--rm','--name',baselineName,'--network','host','-e',`PORT=${port}`,
    '-e',`API_URL=http://127.0.0.1:${upstreamPort}/v1`,'-e',`INTERNAL_API_URL=http://127.0.0.1:${upstreamPort}/v1`,process.env.HIDI_BASELINE_WEB],{stdio:'ignore'});
  let baselineBrowser;
  try {
    let ready=false;
    for(let i=0;i<90;i++){try{if((await fetch(`${base}/api/admin/session`)).status===401){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,1000));}
    assert(ready,'Retained baseline must start');
    baselineBrowser=await chromium.launch({headless:true});
    const context=await baselineBrowser.newContext();
    await context.addCookies([{name:'hidi_admin_access',value:'fixture-only',url:base}]);
    await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',error=>baselineErrors.push(error.message));
    await page.goto(`${base}/admin/orders/HIDI-DELIVERY-TEST`);
    await page.getByRole('heading',{name:'CREATED',exact:true}).waitFor();
    await page.waitForTimeout(500);
  } finally {
    if(baselineBrowser)await baselineBrowser.close();
    await new Promise(r=>spawn('docker',['rm','-f',baselineName],{stdio:'ignore'}).on('close',r));baseline.kill();
  }
}
const candidateImage = process.env.HIDI_CANDIDATE_WEB;
const candidateName = 'delivery-browser-fixture';
const server = spawn(candidateImage ? 'docker' : process.execPath, candidateImage ? ['run', '--rm', '--name', candidateName, '--network', 'host',
  '-e', `PORT=${port}`, '-e', `API_URL=http://127.0.0.1:${upstreamPort}/v1`, '-e', `INTERNAL_API_URL=http://127.0.0.1:${upstreamPort}/v1`, candidateImage]
  : [resolve('apps/web/node_modules/next/dist/bin/next'), 'dev', '--webpack', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: resolve('apps/web'), windowsHide: true, env: { ...process.env, API_URL: `http://127.0.0.1:${upstreamPort}/v1`, INTERNAL_API_URL: `http://127.0.0.1:${upstreamPort}/v1`, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error(log);
    try { if ((await fetch(`${base}/api/admin/session`)).status === 401) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(ready, log);
  const endpoint = `${base}/api/admin/orders/HIDI-DELIVERY-TEST/cod-collection`;
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 401);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { cookie: 'hidi_admin_access=fixture-only', 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: false, amountPaise: 187800 }) })).status, 400);
  browser = await chromium.launch({ headless: true, ...(process.env.HIDI_BROWSER_CHANNEL ? { channel: process.env.HIDI_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addCookies([{ name: 'hidi_admin_access', value: 'fixture-only', url: base }]);
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/admin/orders/HIDI-DELIVERY-TEST`);
  await page.getByRole('heading', { name: 'Collection pending' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Mark as DELIVERED' }).isEnabled(), true);
  assert.equal(await page.getByRole('checkbox').count(), 0, 'delivery does not require a COD checkbox');
  await page.getByRole('button', { name: 'Mark as DELIVERED' }).click();
  await page.getByRole('button', { name: 'Confirm COD collection' }).waitFor();
  assert.equal(order.payment.status, 'CREATED', 'delivery keeps COD pending');
  assert.equal(await page.getByRole('button', { name: 'Confirm COD collection' }).isDisabled(), true);
  await page.screenshot({ path: resolve(directory, 'delivered-cod-pending-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(directory, 'delivered-cod-pending-mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile page must not overflow');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm COD collection' }).click();
  await page.getByRole('heading', { name: 'COD collected', exact: true }).waitFor();
  assert.equal(requests.filter(r => r.path.endsWith('/cod-collection')).length, 1);
  assert.deepEqual(errors, baselineErrors, 'candidate must introduce no browser errors beyond the retained baseline');
  await writeFile(resolve(directory,'browser-errors.json'),JSON.stringify({baselineErrors,candidateErrors:errors,introduced:0},null,2));
  console.log('PASS: delivery independent of COD, exact-amount confirmation, authenticated proxy, rejected unconfirmed requests, desktop/mobile layout');
} finally {
  await writeFile(resolve(directory, 'server.log'), log);
  if (browser) await browser.close();
  if (candidateImage) await new Promise(resolve => { const stop=spawn('docker',['rm','-f',candidateName]);stop.on('close',resolve); });
  server.kill(); await new Promise(resolve => upstream.close(resolve));
}
