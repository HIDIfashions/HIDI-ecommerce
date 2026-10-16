// Re-run the transactional deletion fixtures against the actual composed API.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const runtime = resolve(process.env.RUNNER_TEMP, 'hidi-admin-delete-private/api/candidate-app');
const source = await readFile('tests/admin-product-deletion.test.ts', 'utf8');
assert.ok(source.includes('../apps/api/src/'), 'Expected source deletion fixture imports');
const compiled = source.replaceAll('../apps/api/src/', runtime + '/apps/api/dist/');
assert.equal(compiled.includes('../apps/api/src/'), false, 'Source import remained in candidate fixture');
const testFile = resolve('tests/admin-product-deletion-compiled-candidate.test.ts');
try {
  await writeFile(testFile, compiled);
  execFileSync(process.execPath, ['--import', 'tsx', '--test', '../../tests/admin-product-deletion-compiled-candidate.test.ts'], { cwd: resolve('apps/api'), stdio: 'inherit' });
} finally {
  await unlink(testFile).catch(() => {});
}
