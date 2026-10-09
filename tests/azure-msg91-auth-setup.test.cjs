const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

for (const mode of ['sms', 'check', 'existing-key', 'missing-key', 'missing-template', 'invalid-signing',
  'missing-signing-ref', 'missing-key-ref', 'multiple', 'disabled', 'production', 'unguarded', 'web-unready', 'unsafe-endpoint', 'missing-firebase', 'mismatched-firebase']) {
  test(`Azure MSG91 SMS setup: ${mode}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hidi-msg91-test-'));
    try {
      const cli = path.join(dir, 'az');
      copyFileSync(path.join(__dirname, 'fixtures/azure-msg91-auth-cli.mjs'), cli);
      chmodSync(cli, 0o700);
      const log = path.join(dir, 'calls.jsonl');
      const result = spawnSync(process.execPath, ['deploy/configure-msg91-auth.mjs', ...(mode === 'check' ? ['--check'] : [])], {
        cwd: path.join(__dirname, '..'), encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, AUTH_SETUP_TEST_MODE: mode, AUTH_SETUP_TEST_LOG: log,
          MSG91_AUTHKEY: ['existing-key', 'missing-key', 'missing-key-ref'].includes(mode) ? '' : 'private-test-msg91-key',
          MSG91_SMS_OTP_TEMPLATE_ID: mode === 'missing-template' ? '' : 'test-template-id',
          MSG91_SMS_OTP_ENDPOINT: mode === 'unsafe-endpoint' ? 'https://other.test/api/v5/otp' : '',
          CUSTOMER_OTP_FALLBACK_PROVIDER: 'firebase', FIREBASE_PROJECT_ID: mode === 'missing-firebase' ? '' : mode === 'mismatched-firebase' ? 'wrong-project' : 'hidi-dee0f',
        },
      });
      const calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      const writes = calls.filter(call => call.command !== 'containerapp show');
      if (!['sms', 'check', 'existing-key'].includes(mode)) {
        assert.notEqual(result.status, 0);
        assert.equal(writes.length, 0, 'Preflight failures must not write secrets or switch providers');
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(writes.length, mode === 'check' ? 0 : mode === 'existing-key' ? 2 : 3);
        if (mode !== 'check') {
          const updates = writes.filter(call => call.command === 'containerapp update');
          assert.equal(updates.length, 2);
          assert(updates[0].env.includes('CUSTOMER_OTP_PROVIDER'));
          assert(updates[0].env.includes('CUSTOMER_OTP_FALLBACK_PROVIDER'));
          assert(updates[1].env.includes('NEXT_PUBLIC_CUSTOMER_OTP_CHANNEL'));
          if (mode === 'existing-key') assert(updates[0].env.includes('MSG91_AUTHKEY=secretref:custom-msg91-key'));
          assert(!updates[0].env.some(name => name.startsWith('HIDI_AUTH_SECRET')));
        }
      }
      assert(!result.stdout.includes('private-test-'));
      assert(!result.stderr.includes('private-test-'));
      assert(!JSON.stringify(calls).includes('private-test-'));
      assert(!calls.some(call => /create|grant|delete/.test(call.command)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
