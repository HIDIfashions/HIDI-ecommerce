const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

for (const mode of ['preserve', 'new-secret', 'production', 'migration-failed']) {
  test(`Azure Firebase setup ${mode}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hidi-auth-test-'));
    try {
      const cli = path.join(dir, 'az');
      copyFileSync(path.join(__dirname, 'fixtures/azure-auth-cli.mjs'), cli);
      chmodSync(cli, 0o700);
      const log = path.join(dir, 'calls.jsonl');
      const result = spawnSync(process.execPath, ['deploy/configure-firebase-auth.mjs'], {
        cwd: path.join(__dirname, '..'), encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir,
          AUTH_SETUP_TEST_MODE: mode, AUTH_SETUP_TEST_LOG: log },
      });
      const calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      const commands = calls.map(c => c.command);
      if (mode === 'production') {
        assert.notEqual(result.status, 0);
        assert.deepEqual(commands, ['containerapp show']);
      } else if (mode === 'migration-failed') {
        assert.notEqual(result.status, 0);
        assert.equal(commands.filter(c => c === 'sql server ad-admin update').length, 2, 'Restoration must run even if stopping the job fails');
        assert(!commands.includes('containerapp secret set'));
        assert(!commands.includes('containerapp update'));
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(commands.includes('containerapp secret set'), mode === 'new-secret');
        assert.equal(commands.filter(c => c === 'sql server ad-admin update').length, 2);
        assert.equal(commands.filter(c => c === 'containerapp update').length, 2);
        assert(!commands.some(c => /create|grant/.test(c)), 'Setup must not create resources or grant roles');
        assert(!result.stdout.includes('secretref:'));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
