const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../apps/web/node_modules/typescript');

function fixture(response = { ok: true, body: {} }) {
  const calls = [];
  const exports = {};
  const source = fs.readFileSync(require.resolve('../apps/web/lib/admin-supabase-auth.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, process: { env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://email-service.example.test',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
  } }, fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: response.ok, json: async () => response.body };
  } });
  return { auth: exports, calls };
}

test('admin code requests use the HIDI staff gate, with no direct provider signup request', async () => {
  const f = fixture();
  assert.equal(await f.auth.sendAdminEmailOtp(' STAFF@EXAMPLE.TEST '), 'staff@example.test');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, '/api/store/auth/admin/otp/request');
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { email: 'staff@example.test' });
  assert.equal(f.calls[0].options.headers.apikey, undefined);
  assert.equal(f.calls[0].options.cache, 'no-store');
});

test('an unlisted email denial is displayed and never falls back to direct OTP delivery', async () => {
  const f = fixture({ ok: false, body: { message: 'This email is not authorised for HIDI Admin' } });
  await assert.rejects(() => f.auth.sendAdminEmailOtp('unknown@example.test'), /not authorised/);
  assert.equal(f.calls.length, 1);
});

test('malformed emails are rejected before the network request', async () => {
  const f = fixture();
  await assert.rejects(() => f.auth.sendAdminEmailOtp('a@@b.test'), /valid admin email/);
  assert.equal(f.calls.length, 0);
});
