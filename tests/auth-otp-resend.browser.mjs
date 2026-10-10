/** Actual Next account UI with loopback auth fixtures. No provider, database or real OTP is contacted.
 * Run after the normal production Web build:
 * HIDI_BROWSER_ENGINES=chromium,firefox,webkit node tests/auth-otp-resend.browser.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const engines = (process.env.HIDI_BROWSER_ENGINES || 'chromium').split(',').filter(Boolean);
const port = 3116, apiPort = 4116;
const suppliedBase = process.env.HIDI_OTP_FIXTURE_BASE_URL;
const parsedBase = new URL(suppliedBase || `http://127.0.0.1:${port}`);
assert(parsedBase.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsedBase.hostname) &&
  !parsedBase.username && !parsedBase.password && parsedBase.pathname === '/' && !parsedBase.search && !parsedBase.hash,
  'OTP fixtures accept only a loopback HTTP origin');
const base = parsedBase.origin;
const output = resolve('test-results/auth-otp-resend');
const phone = '+919999999999'; // Synthetic fixture; never forwarded outside loopback.
const calls = [], results = [];
let requestMode = 'success', releaseHeld, server, browser, serverLog = '';
const delay = ms => new Promise(done => setTimeout(done, ms));

const upstream = createServer(async (req, res) => {
  const path = new URL(req.url, `http://127.0.0.1:${apiPort}`).pathname.replace(/^\/v1/, '');
  const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  try {
    let text = ''; for await (const part of req) text += part;
    const body = text ? JSON.parse(text) : {};
    if (path === '/auth/config') return reply(200, { phoneOtp: true, channel: 'SMS', provider: 'msg91', fallbackProvider: 'firebase', fixture: 'loopback-auth-otp-resend' });
    if (path === '/auth/otp/request') {
      assert.equal(req.method, 'POST');
      assert.match(body.phone, /^\+91[89]\d{9}$/);
      assert.deepEqual(Object.keys(body), ['phone']);
      calls.push({ kind: 'request', phone: body.phone });
      const mode = requestMode; requestMode = 'success';
      if (mode === 'hold') await new Promise(done => { releaseHeld = done; });
      if (mode === 'failure') return reply(503, { message: 'Fixture resend unavailable' });
      if (mode === 'cooldown') return reply(429, { message: 'Fixture wait before requesting another OTP', retryAfterSeconds: 90 });
      return reply(200, { phone: body.phone, channel: 'SMS', expiresInSeconds: 300, retryAfterSeconds: 60 });
    }
    if (path === '/auth/otp/verify') {
      assert.equal(req.method, 'POST');
      calls.push({ kind: 'verify', phone: body.phone, otp: body.otp });
      return reply(401, { message: 'Fixture code is invalid' });
    }
    if (path.startsWith('/admin/')) return reply(401, { message: 'Authentication required' });
    if (req.method !== 'GET') return reply(400, { message: 'Unexpected fixture write' });
    return reply(200, path === '/health' ? { status: 'ok' } : []);
  } catch { reply(500, { message: 'Invalid isolated fixture request' }); }
});

async function until(check, label, timeout = 10000) {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${label}`);
    await delay(40);
  }
}
const resend = page => page.getByRole('button', { name: /resend/i });
const requests = () => calls.filter(call => call.kind === 'request');
async function advance(page, seconds) {
  await page.evaluate(seconds => { window.__otpFixtureNow += seconds * 1000; }, seconds);
  // The real interval must recompute from elapsed wall time after a background-tab-like jump.
  await delay(1100);
}
async function enterPhone(page) {
  await page.getByLabel('Mobile number', { exact: true }).fill('9999999999');
  for (const checkbox of await page.locator('form:has(#account-phone) input[type="checkbox"]').all()) await checkbox.check();
}
async function sendInitial(page) {
  await enterPhone(page);
  await page.getByRole('button', { name: 'Send SMS OTP', exact: true }).click();
  await page.getByLabel('6-digit OTP', { exact: true }).waitFor();
  await until(() => resend(page).isDisabled(), 'initial resend cooldown');
}

async function scenario(engine, name, work) {
  calls.length = 0; requestMode = 'success'; releaseHeld = undefined;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.addInitScript(() => {
    window.__otpFixtureNow = 1800000000000;
    Date.now = () => window.__otpFixtureNow;
    const originalSet = window.setInterval.bind(window), originalClear = window.clearInterval.bind(window);
    window.__otpFixtureIntervals = new Set();
    window.setInterval = (callback, milliseconds, ...args) => {
      const id = originalSet(callback, milliseconds, ...args);
      if (milliseconds === 1000) window.__otpFixtureIntervals.add(id);
      return id;
    };
    window.clearInterval = id => { window.__otpFixtureIntervals.delete(id); return originalClear(id); };
  });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    const response = await page.goto(base + '/account', { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), 'Actual account route must load');
    await page.getByRole('heading', { name: 'Your HIDI account.', exact: true }).waitFor();
    await work(page);
    assert.deepEqual(errors, [], 'Account must not have browser runtime errors');
    results.push({ engine, name, passed: true });
    console.log(`PASS ${engine}: ${name}`);
  } finally {
    releaseHeld?.();
    await context.close();
  }
}

try {
  await mkdir(output, { recursive: true });
  await new Promise((done, reject) => { upstream.once('error', reject); upstream.listen(apiPort, '127.0.0.1', done); });
  // An already-booted candidate can be supplied only on loopback. Its upstream must be
  // configured to this synthetic API (127.0.0.1:4116/v1), never to a live backend.
  if (!suppliedBase) {
    server = spawn(process.execPath, [resolve('apps/web/node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: resolve('apps/web'), env: { ...process.env, NODE_ENV: 'production', API_URL: `http://127.0.0.1:${apiPort}/v1`, INTERNAL_API_URL: `http://127.0.0.1:${apiPort}/v1` }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', data => { serverLog += data; }); server.stderr.on('data', data => { serverLog += data; });
  }
  await until(async () => { if (server && server.exitCode !== null) throw new Error('Fixture Next server exited'); try { return (await fetch(base + '/account')).ok; } catch { return false; } }, 'fixture Next startup', 30000);
  const configProbe = await fetch(base + '/api/store/auth/config');
  assert(configProbe.ok && (await configProbe.json()).fixture === 'loopback-auth-otp-resend',
    'Refusing OTP interactions: target must proxy this loopback fixture API');

  for (const engine of engines) {
    assert(['chromium', 'firefox', 'webkit'].includes(engine), 'Known isolated browser engine required');
    browser = await pw[engine].launch({ headless: true });
    await scenario(engine, 'single request, elapsed-time cooldown and successful replacement', async page => {
      assert.equal(await page.locator('footer.footer a[href="/privacy"]').count(), 1,
        'Privacy link must be rendered by Next without an external DOM mutation');
      await enterPhone(page);
      for (const [name, anchor] of [['Account terms', 'terms'], ['Privacy notice', 'privacy']]) {
        const link = page.getByRole('link', { name, exact: true });
        assert.equal(await link.getAttribute('href'), `/account/policy#${anchor}`);
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.match(await link.getAttribute('rel'), /(?:^|\s)noopener(?:\s|$)/);
        assert.match(await link.getAttribute('rel'), /(?:^|\s)noreferrer(?:\s|$)/);
      }
      const policyOpened = page.waitForEvent('popup');
      await page.getByRole('link', { name: 'Account terms', exact: true }).click();
      const policy = await policyOpened;
      await policy.getByRole('heading', { name: 'Account terms & privacy notice', exact: true }).waitFor();
      await policy.close();
      assert.equal(await page.getByLabel('Mobile number', { exact: true }).inputValue(), '9999999999');
      assert.equal(requests().length, 0, 'Reading policies must not request an OTP');
      requestMode = 'hold';
      await page.locator('form:has(#account-phone)').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
      await until(() => requests().length === 1 && Boolean(releaseHeld), 'one held request');
      await delay(150); assert.equal(requests().length, 1, 'Repeated submission must not send twice');
      assert(await page.getByRole('button', { name: /sending OTP/i }).isDisabled());
      releaseHeld(); releaseHeld = undefined;
      await page.getByLabel('6-digit OTP', { exact: true }).waitFor();
      assert(await resend(page).isDisabled());
      await page.getByLabel('6-digit OTP', { exact: true }).fill('654321');
      await advance(page, 59); assert(await resend(page).isDisabled(), '59 seconds is too early');
      assert.equal(requests().length, 1, 'Countdown must not issue requests');
      await advance(page, 1); await until(() => resend(page).isEnabled(), '60-second background jump');
      requestMode = 'hold';
      await resend(page).evaluate(button => { button.click(); button.click(); });
      await until(() => requests().length === 2 && Boolean(releaseHeld), 'one held resend');
      await delay(150); assert.equal(requests().length, 2, 'Repeated resend must not send twice');
      assert(await page.getByRole('button', { name: /verify.*sign in|signing in/i }).isDisabled(), 'Verification must not race resend');
      assert(await page.getByRole('button', { name: /different mobile number/i }).isDisabled(), 'Changing number must not race resend');
      releaseHeld(); releaseHeld = undefined;
      await until(async () => (await page.getByLabel('6-digit OTP', { exact: true }).inputValue()) === '', 'successful resend clears prior input');
      assert.equal(requests()[1].phone, phone, 'Resend must use the active normalized phone');
      assert(await resend(page).isDisabled(), 'Successful replacement starts a new cooldown');
      await page.screenshot({ path: resolve(output, `${engine}-resend-cooldown.png`) });
    });
    await scenario(engine, 'failed resend retains input and previous verification path', async page => {
      await sendInitial(page); await page.getByLabel('6-digit OTP', { exact: true }).fill('654321');
      await advance(page, 60); await until(() => resend(page).isEnabled(), 'resend enabled');
      requestMode = 'failure'; await resend(page).click();
      await page.getByText('Fixture resend unavailable', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('6-digit OTP', { exact: true }).inputValue(), '654321');
      await page.getByRole('button', { name: 'Verify & sign in', exact: true }).click();
      await until(() => calls.some(call => call.kind === 'verify'), 'existing verification path');
      assert.deepEqual(calls.find(call => call.kind === 'verify'), { kind: 'verify', phone, otp: '654321' });
      await page.getByText('Fixture code is invalid', { exact: true }).waitFor();
    });
    await scenario(engine, 'server cooldown extends the timer without a fallback send', async page => {
      await sendInitial(page); await page.getByLabel('6-digit OTP', { exact: true }).fill('654321');
      await advance(page, 60); await until(() => resend(page).isEnabled(), 'resend enabled');
      requestMode = 'cooldown'; await resend(page).click();
      await page.getByText('Fixture wait before requesting another OTP', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('6-digit OTP', { exact: true }).inputValue(), '654321');
      assert(await resend(page).isDisabled());
      await advance(page, 89); assert(await resend(page).isDisabled(), 'Server retry delay remains authoritative');
      assert.equal(requests().length, 2, '429 must not trigger a hidden fallback or retry');
      await advance(page, 1); await until(() => resend(page).isEnabled(), 'server retry delay expires');
    });
    await scenario(engine, 'different-number transition clears OTP and unmount clears timer', async page => {
      const baseline = await page.evaluate(() => window.__otpFixtureIntervals.size);
      await sendInitial(page); await page.getByLabel('6-digit OTP', { exact: true }).fill('654321');
      await page.getByRole('button', { name: /different mobile number/i }).click();
      await page.getByLabel('Mobile number', { exact: true }).waitFor();
      assert(await page.getByRole('button', { name: /Send OTP in \d+s/i }).isDisabled(),
        'Changing the form must not bypass the same-number cooldown');
      await page.getByLabel('Mobile number', { exact: true }).fill('8888888888');
      assert(await page.getByRole('button', { name: 'Send SMS OTP', exact: true }).isEnabled(),
        'A different number has its own cooldown');
      await page.getByRole('button', { name: 'Send SMS OTP', exact: true }).click();
      await page.getByLabel('6-digit OTP', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('6-digit OTP', { exact: true }).inputValue(), '');
      assert.equal(requests()[1].phone, '+918888888888');
      await page.locator('a[href="/account/preferences"]:visible').first().click();
      await page.waitForURL('**/account/preferences');
      assert.equal(await page.locator('footer.footer a[href="/privacy"]').count(), 1,
        'Privacy link must survive client navigation without an external observer');
      await until(() => page.evaluate(baseline => !window.__otpFixtureIntervals || window.__otpFixtureIntervals.size <= baseline, baseline), 'timer cleanup after account unmount');
    });
    await browser.close(); browser = undefined;
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ passed: true, providerRequestsSent: 0, fixturesOnly: true, results }, null, 2));
} finally {
  releaseHeld?.(); await browser?.close(); server?.kill('SIGTERM');
  await new Promise(done => upstream.close(done));
  await writeFile(resolve(output, 'next.log'), serverLog);
}
