import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const group = 'rg-hidi-prod';
const jobName = 'job-hidi-validation';
const server = 'sql-hidi-prod-0927';
const work = await mkdtemp(join(tmpdir(), 'hidi-auth-'));
const recoveryPath = join(process.env.RUNNER_TEMP ?? work, 'hidi-auth-admin.json');
function az(args, json = true) {
  try {
    const output = execFileSync('az', [...args, '--only-show-errors', '-o', json ? 'json' : 'none'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    return json ? JSON.parse(output) : undefined;
  } catch {
    // Azure responses can include configuration values; never echo them.
    throw new Error(`Azure operation failed: ${args.slice(0, 3).join(' ')}`);
  }
}
const app = name => az(['containerapp', 'show', '-g', group, '-n', name]);
const envValue = (resource, name) => resource.properties.template.containers[0].env.find(e => e.name === name);
async function waitReady(name) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const resource = app(name);
    if (resource.properties.latestReadyRevisionName === resource.properties.latestRevisionName) return;
    await sleep(10000);
  }
  throw new Error(`Readiness timeout for ${name}`);
}
let originalAdmin;
let restoreRequired = false;
let execution;
try {
  const api = app('hidi-api');
  assert.equal(envValue(api, 'AZURE_SQL_DATABASE')?.value, 'hidi-sql-validation', 'Refusing production database changes');
  assert.equal(envValue(api, 'MIGRATION_READ_ONLY')?.value, 'true');
  assert.equal(envValue(api, 'MIGRATION_CUSTOMER_TESTING')?.value, 'true');
  const image = api.properties.template.containers[0].image;
  assert(/^acrhidiprod0927\.azurecr\.io\/hidi-api:[a-f0-9]{40}$/.test(image));
  const job = az(['containerapp', 'job', 'show', '-g', group, '-n', jobName]);
  assert.equal(job.properties.configuration.triggerType, 'Manual');
  assert.equal(job.properties.template.containers.length, 1);
  const running = az(['containerapp', 'job', 'execution', 'list', '-g', group, '-n', jobName]);
  assert(!running.some(e => e.properties.status === 'Running'), 'Existing migration execution is running');
  const identity = az(['identity', 'show', '-g', group, '-n', 'id-hidi-migration']);
  assert(job.identity.userAssignedIdentities[identity.id], 'Existing job must use the migration identity');
  originalAdmin = az(['sql', 'server', 'ad-admin', 'show', '-g', group, '-s', server]);
  assert(originalAdmin.login && originalAdmin.sid, 'Existing SQL administrator must be restorable');

  const source = await readFile('deploy/customer-auth-db.mjs', 'utf8');
  const template = structuredClone(job.properties.template);
  const container = template.containers[0];
  container.image = image;
  container.command = ['node'];
  container.args = ['--input-type=module', '--eval', source];
  for (const [name, value] of Object.entries({
    AZURE_CLIENT_ID: identity.clientId,
    AZURE_SQL_SERVER: envValue(api, 'AZURE_SQL_SERVER')?.value,
    AZURE_SQL_DATABASE: 'hidi-sql-validation',
  })) {
    assert(value, `Missing ${name}`);
    container.env = container.env.filter(e => e.name !== name);
    container.env.push({ name, value });
  }
  const templatePath = join(work, 'execution.json');
  await writeFile(templatePath, JSON.stringify(template), { mode: 0o600 });
  // The existing private job uses a short-lived migration administrator; restore it in finally.
  await writeFile(recoveryPath, JSON.stringify({ ...originalAdmin, migrationSid: identity.principalId }), { mode: 0o600 });
  restoreRequired = true;
  az(['sql', 'server', 'ad-admin', 'update', '-g', group, '-s', server,
    '--display-name', identity.name, '--object-id', identity.principalId], false);
  execution = az(['containerapp', 'job', 'start', '-g', group, '-n', jobName, '--yaml', templatePath]).name;
  assert(execution, 'Migration execution did not start');
  await writeFile(recoveryPath, JSON.stringify({ ...originalAdmin, migrationSid: identity.principalId, execution }), { mode: 0o600 });
  console.log(`Auth migration execution: ${execution}`);
  let status;
  for (let attempt = 0; attempt < 100; attempt++) {
    const runs = az(['containerapp', 'job', 'execution', 'list', '-g', group, '-n', jobName]);
    status = runs.find(e => e.name === execution)?.properties.status;
    if (['Succeeded', 'Failed', 'Stopped'].includes(status)) break;
    await sleep(10000);
  }
  assert.equal(status, 'Succeeded', 'Auth-only migration did not succeed');
  az(['sql', 'server', 'ad-admin', 'update', '-g', group, '-s', server,
    '--display-name', originalAdmin.login, '--object-id', originalAdmin.sid], false);
  restoreRequired = false;
  await rm(recoveryPath, { force: true });
  console.log('Auth tables verified; original SQL administrator restored. No customer data imported.');

  const signing = envValue(api, 'HIDI_AUTH_SECRET') ?? envValue(api, 'AUTH_TOKEN_SECRET');
  const envArgs = ['CUSTOMER_OTP_PROVIDER=firebase', 'FIREBASE_PROJECT_ID=hidi-dee0f'];
  if (signing) {
    assert(signing.secretRef || signing.value?.length >= 32, 'Existing signing secret is invalid; refusing rotation');
    console.log('Preserving existing server signing secret.');
  } else {
    const secretName = 'hidi-auth-secret';
    const existing = api.properties.configuration.secrets?.some(s => s.name === secretName);
    if (!existing) {
      const secret = randomBytes(48).toString('base64url');
      az(['containerapp', 'secret', 'set', '-g', group, '-n', 'hidi-api', '--secrets', `${secretName}=${secret}`], false);
    }
    envArgs.push(`HIDI_AUTH_SECRET=secretref:${secretName}`);
    console.log(existing ? 'Referencing existing server signing secret.' : 'Created server-only signing secret in Azure Container Apps.');
  }
  az(['containerapp', 'update', '-g', group, '-n', 'hidi-api', '--set-env-vars', ...envArgs], false);
  await waitReady('hidi-api');
  const publicAuth = JSON.parse(await readFile('deploy/public-auth.json', 'utf8'));
  const webEnv = ['NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER=firebase'];
  for (const name of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID', 'MESSAGING_SENDER_ID', 'STORAGE_BUCKET']) {
    const value = publicAuth[`FIREBASE_${name}`] ?? publicAuth[`NEXT_PUBLIC_FIREBASE_${name}`];
    assert(typeof value === 'string' && value, `Missing Firebase ${name}`);
    webEnv.push(`NEXT_PUBLIC_FIREBASE_${name}=${value}`);
  }
  az(['containerapp', 'update', '-g', group, '-n', 'hidi-web', '--set-env-vars', ...webEnv], false);
  await waitReady('hidi-web');
  console.log('Firebase API and web environment configured; both apps ready.');
} finally {
  if (restoreRequired) {
    try {
      if (execution) az(['containerapp', 'job', 'stop', '-g', group, '-n', jobName, '--job-execution-name', execution], false);
    } catch {
      console.error('Could not stop auth migration execution; restoring SQL administrator independently.');
    }
    az(['sql', 'server', 'ad-admin', 'update', '-g', group, '-s', server,
      '--display-name', originalAdmin.login, '--object-id', originalAdmin.sid], false);
    console.log('Original SQL administrator restored after setup failure.');
    await rm(recoveryPath, { force: true });
  }
  await rm(work, { recursive: true, force: true });
}
