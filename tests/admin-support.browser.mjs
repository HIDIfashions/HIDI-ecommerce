// Browser fixtures only; never connects to real orders, staff or payment providers.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.env.HIDI_SUPPORT_TEST_URL || 'http://127.0.0.1:3137';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local test server');
const output = new URL('../test-results/admin-support/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const events = [];
const order = { id: 'fixture-order', orderNumber: 'HIDI-FIXTURE', status: 'CONFIRMED', createdAt: '2026-10-17T10:00:00Z', totalPaise: 200000, subtotalPaise: 200000, shippingPaise: 0, discountPaise: 0, taxPaise: 0, itemCount: 1, customerPhone: '9999999999', shippingAddress: { firstName: 'Fixture', city: 'Hyderabad', countryCode: 'IN' }, payment: { status: 'CAPTURED', provider: 'RAZORPAY' }, items: [], returns: [], auditEvents: [] };
async function session(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/admin/session') return send({ admin: { id: role, displayName: role, role, email: 'fixture@example.test' } });
    if (url.pathname === '/api/admin/support') {
      const decided = new Set(events.filter(event => event.kind === 'APPROVAL_DECISION').map(event => event.requestId));
      const latest = events.filter(event => event.kind === 'FOLLOW_UP').at(-1);
      return send({ items: [...events.filter(event => event.kind === 'APPROVAL_REQUEST' && !decided.has(event.id)), ...(latest && latest.status !== 'DONE' ? [latest] : [])].map(event => ({ ...event, orderNumber: order.orderNumber })) });
    }
    if (url.pathname.endsWith('/support') && request.method() === 'GET') return send({ events });
    if (url.pathname.includes('/support') && request.method() === 'POST') {
      const body = request.postDataJSON();
      const decision = url.pathname.endsWith('/decision');
      events.push({ ...body, kind: decision ? 'APPROVAL_DECISION' : body.kind, id: `fixture-${events.length + 1}`, createdAt: new Date().toISOString(), actorName: role, ...(decision ? { requestId: url.pathname.split('/').at(-2) } : {}) });
      return send({ ok: true });
    }
    if (url.pathname === '/api/admin/orders/HIDI-FIXTURE') return send({ order });
    return send({ message: 'Unmocked fixture endpoint' }, 404);
  });
  return context;
}
try {
  const support = await session('SUPPORT'); const page = await support.newPage();
  await page.goto(`${base}/admin/orders/HIDI-FIXTURE`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('heading', { name: 'Notes and follow-ups' }).waitFor({ timeout: 60000 });
  const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Notes and follow-ups' }) }).last();
  await panel.getByLabel('Details', { exact: true }).fill('Customer asked about delivery.');
  await panel.getByRole('button', { name: 'Save support update' }).click();
  await panel.getByRole('status').waitFor();
  assert.equal(events[0].text, 'Customer asked about delivery.');
  await panel.getByLabel('Action', { exact: true }).selectOption('TAGS');
  await panel.getByLabel('Issue tags (comma separated; replaces current tags)').fill('delivery-delay, callback');
  await panel.getByRole('button', { name: 'Save support update' }).click();
  await page.waitForFunction(() => document.body.textContent.includes('delivery-delay, callback'));
  await panel.getByLabel('Action', { exact: true }).selectOption('FOLLOW_UP');
  await panel.getByLabel('Details', { exact: true }).fill('Call customer tomorrow.');
  await panel.getByLabel('Follow-up date and time').fill('2026-10-20T12:00');
  await panel.getByRole('button', { name: 'Save support update' }).click();
  await page.waitForFunction(() => document.body.textContent.includes('Follow-up:'));
  await panel.getByLabel('Action', { exact: true }).selectOption('APPROVAL_REQUEST');
  await panel.getByLabel('Exact action requested and reason').fill('Refund ₹100 after Owner review.');
  await panel.getByLabel('Amount in ₹ (if applicable)').fill('100');
  await panel.getByRole('button', { name: 'Submit for Owner approval' }).click();
  await panel.getByText('PENDING OWNER APPROVAL', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Mark as PACKED', exact: true }).count(), 0);
  const historyWidth = await panel.locator('article').first().locator('div').first().evaluate(element => element.getBoundingClientRect().width);
  assert(historyWidth > 200, 'Support history uses the available card width');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: fileURLToPath(new URL('support-order.png', output)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Support order has no horizontal overflow on mobile');
  await page.screenshot({ path: fileURLToPath(new URL('support-mobile.png', output)), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/admin/support`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Pending Owner approval · REFUND', { exact: true }).waitFor();
  await page.getByText('Call customer tomorrow.', { exact: true }).waitFor();
  await support.close();

  const owner = await session('OWNER'); const ownerPage = await owner.newPage();
  await ownerPage.goto(`${base}/admin/orders/HIDI-FIXTURE`, { waitUntil: 'domcontentloaded' });
  await ownerPage.getByLabel('Decision reason').fill('Reviewed customer evidence; approve ₹100.');
  await ownerPage.getByRole('button', { name: 'Approve', exact: true }).click();
  await ownerPage.getByRole('status').waitFor();
  assert.equal(events.at(-1).decision, 'APPROVED');
  assert.equal(await ownerPage.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
  await ownerPage.evaluate(() => window.scrollTo(0, 0));
  await ownerPage.screenshot({ path: fileURLToPath(new URL('owner-approved.png', output)), fullPage: true });
  await ownerPage.goto(`${base}/admin/support`, { waitUntil: 'domcontentloaded' });
  await ownerPage.getByText('Call customer tomorrow.', { exact: true }).waitFor();
  assert.equal(await ownerPage.getByText('Pending Owner approval · REFUND', { exact: true }).count(), 0);
  await owner.close();
  console.log('PASS: Support notes, tags, follow-ups, approval requests, role controls, Owner decisions and queue.');
} finally { await browser.close(); }
