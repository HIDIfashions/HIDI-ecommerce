/** Execute the known deployed customer regression without adopting unrelated SEO work. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const baseline = 'e6d8ab4e824b6f28d80f82b2e9c6e5081670dcf4';
const files = ['deploy/seo-discovery/candidate.mjs', 'deploy/seo-discovery/probes.mjs', 'deploy/button-states/request-policy.mjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = resolve('evidence/product-upload');
assert(process.env.HIDI_CANDIDATE_RUNTIME, 'Actual candidate runtime is required');
assert(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || ''), 'Reviewed execution source SHA is required');
const isolated = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'hidi-upload-retained-commerce-'));
const sourceHashes = {};
try {
  for (const name of files) {
    const bytes = execFileSync('git', ['show', baseline + ':' + name]);
    sourceHashes[name] = hash(bytes);
    const target = join(isolated, name);
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, bytes, {mode: 0o600});
    assert.equal(hash(await readFile(target)), sourceHashes[name], 'Pinned retained suite bytes differ');
  }
  execFileSync(process.execPath, [join(isolated, 'deploy/seo-discovery/candidate.mjs')], {
    cwd: process.cwd(), env: process.env, stdio: 'inherit', timeout: 1000_000,
  });
  const bytes = await readFile('evidence/seo-discovery/candidate/report.json');
  const report = JSON.parse(bytes);
  assert.equal(report.passed, true);
  assert.equal(report.liveWrites, 0);
  assert.equal(report.results.length, 12);
  assert.deepEqual([...report.engines].sort(), ['chromium', 'firefox', 'webkit']);
  await mkdir(evidence, {recursive: true});
  await writeFile(join(evidence, 'retained-commerce.json'), bytes);
  await writeFile(join(evidence, 'retained-commerce-provenance.json'), JSON.stringify({
    passed: true, baselineSourceSha: baseline, executionSourceSha: process.env.GITHUB_SHA,
    sourceHashes, helperSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    reportSha256: hash(bytes), liveWrites: 0,
  }, null, 2));
  console.log('PASS: deployed canonical/header/footer/customer regression verified with its pinned source and unchanged current runtime');
} finally {
  await rm(isolated, {recursive: true, force: true});
}
