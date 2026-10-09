import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const group = 'rg-hidi-prod';
const checkOnly = process.argv.includes('--check');
assert(process.argv.slice(2).every(arg => arg === '--check'), 'Only --check is supported');

function az(args, json = true) {
  try {
    const output = execFileSync('az', [...args, '--only-show-errors', '-o', json ? 'json' : 'none'], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return json ? JSON.parse(output) : undefined;
  } catch {
    // Azure responses can include configuration values; never echo them.
    throw new Error(`Azure operation failed: ${args.slice(0, 3).join(' ')}`);
  }
}

const app = name => az(['containerapp', 'show', '-g', group, '-n', name]);
const container = resource => resource.properties.template.containers[0];
const envValue = (resource, name) => container(resource).env?.find(e => e.name === name);
const secretExists = (resource, name) => resource.properties.configuration.secrets?.some(s => s.name === name);

function configuredValue(resource, name, fallback = '') {
  return String(process.env[name] ?? envValue(resource, name)?.value ?? fallback).trim();
}

async function waitReady(name) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const resource = app(name);
    if (resource.properties.latestRevisionName && resource.properties.latestReadyRevisionName === resource.properties.latestRevisionName) return;
    await sleep(10000);
  }
  throw new Error(`Readiness timeout for ${name}`);
}

const api = app('hidi-api');
const web = app('hidi-web');
for (const resource of [api, web]) {
  assert.equal(resource.properties.template.containers.length, 1, 'Expected one application container');
  assert(resource.properties.latestReadyRevisionName && resource.properties.latestReadyRevisionName === resource.properties.latestRevisionName, 'Existing app is not ready');
  assert.equal(resource.properties.configuration.activeRevisionsMode, 'Single', 'Multiple-revision traffic requires a dedicated rollout');
}
assert.equal(envValue(api, 'MIGRATION_READ_ONLY')?.value, 'true', 'This helper is restricted to guarded validation; production cutover needs a separate rollout');
assert.equal(envValue(api, 'MIGRATION_CUSTOMER_TESTING')?.value, 'true', 'Validation OTP endpoints are disabled');
assert.equal(envValue(api, 'AZURE_SQL_DATABASE')?.value, 'hidi-sql-validation', 'Validation must use its isolated database');

const templateId = configuredValue(api, 'MSG91_SMS_OTP_TEMPLATE_ID');
assert(templateId && /^[a-zA-Z0-9_-]+$/.test(templateId), 'Missing or invalid MSG91 SMS OTP template ID; use the ID created in SendOTP, not the DLT content ID');
const endpoint = configuredValue(api, 'MSG91_SMS_OTP_ENDPOINT') || 'https://control.msg91.com/api/v5/otp';
let url;
try { url = new URL(endpoint); } catch { throw new Error('Invalid MSG91 SMS OTP endpoint'); }
assert(url.protocol === 'https:' && ['control.msg91.com', 'api.msg91.com'].includes(url.hostname) &&
  (!url.port || url.port === '443') && !url.username && !url.password && !url.search && !url.hash &&
  /^\/api\/v5\/otp\/?$/.test(url.pathname), 'MSG91 SMS OTP endpoint must use the official HTTPS SendOTP API');

const signing = envValue(api, 'HIDI_AUTH_SECRET') ?? envValue(api, 'AUTH_TOKEN_SECRET');
if (signing) {
  assert(signing.secretRef || signing.value?.length >= 32, 'Existing signing secret is invalid; refusing rotation');
  if (signing.secretRef) assert(secretExists(api, signing.secretRef), 'Existing signing secret reference is missing');
}
const apiEnv = [
  'CUSTOMER_OTP_PROVIDER=msg91',
  `MSG91_SMS_OTP_TEMPLATE_ID=${templateId}`,
  `MSG91_SMS_OTP_ENDPOINT=${endpoint}`,
];
// Keep the existing Firebase project as a fallback. No Firebase keys are
// replaced, and only the server can authorise fallback for a failed send.
const fallback = (configuredValue(api, 'CUSTOMER_OTP_FALLBACK_PROVIDER') || 'firebase').toLowerCase();
assert(['firebase', 'none'].includes(fallback), 'CUSTOMER_OTP_FALLBACK_PROVIDER must be firebase or none');
if (fallback === 'firebase') {
  const firebaseProject = configuredValue(api, 'FIREBASE_PROJECT_ID');
  assert(firebaseProject, 'Firebase fallback requires the existing FIREBASE_PROJECT_ID');
  const publicAuth = JSON.parse(readFileSync(new URL('./public-auth.json', import.meta.url), 'utf8'));
  assert.equal(firebaseProject, publicAuth.FIREBASE_PROJECT_ID, 'Firebase fallback must match the project compiled into the storefront');
  assert(['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_APP_ID'].every(key => publicAuth[key]), 'Firebase fallback browser configuration is incomplete');
  apiEnv.push(`FIREBASE_PROJECT_ID=${firebaseProject}`);
}
apiEnv.push(`CUSTOMER_OTP_FALLBACK_PROVIDER=${fallback}`);
const secretsToSet = [];

const authkey = process.env.MSG91_AUTHKEY?.trim();
const existingKey = envValue(api, 'MSG91_AUTHKEY');
if (authkey) {
  secretsToSet.push(`msg91-authkey=${authkey}`);
  apiEnv.push('MSG91_AUTHKEY=secretref:msg91-authkey');
} else if (existingKey?.secretRef) {
  assert(secretExists(api, existingKey.secretRef), 'Missing secret referenced by MSG91_AUTHKEY');
  apiEnv.push(`MSG91_AUTHKEY=secretref:${existingKey.secretRef}`);
} else if (secretExists(api, 'msg91-authkey')) {
  apiEnv.push('MSG91_AUTHKEY=secretref:msg91-authkey');
} else if (existingKey?.value?.trim()) {
  secretsToSet.push(`msg91-authkey=${existingKey.value.trim()}`);
  apiEnv.push('MSG91_AUTHKEY=secretref:msg91-authkey');
} else {
  throw new Error('Missing MSG91_AUTHKEY or existing msg91-authkey secret');
}

if (!signing) {
  const secretName = 'hidi-auth-secret';
  if (!secretExists(api, secretName)) {
    const secret = randomBytes(48).toString('base64url');
    secretsToSet.push(`${secretName}=${secret}`);
  }
  apiEnv.push(`HIDI_AUTH_SECRET=secretref:${secretName}`);
}

if (checkOnly) {
  console.log('MSG91 SMS OTP configuration preflight passed; no Azure settings were changed. DLT mapping and delivery still require verification.');
  process.exit(0);
}

if (secretsToSet.length) {
  az(['containerapp', 'secret', 'set', '-g', group, '-n', 'hidi-api', '--secrets', ...secretsToSet], false);
}
az(['containerapp', 'update', '-g', group, '-n', 'hidi-api', '--set-env-vars', ...apiEnv], false);
await waitReady('hidi-api');

az(['containerapp', 'update', '-g', group, '-n', 'hidi-web', '--set-env-vars', 'NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER=hidi', 'NEXT_PUBLIC_CUSTOMER_OTP_CHANNEL=sms'], false);
await waitReady('hidi-web');

console.log('MSG91 SMS OTP environment configured; hidi-api and hidi-web are ready. Confirm SMS delivery and customer login before declaring activation complete.');
