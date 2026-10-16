const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('../apps/web/node_modules/typescript');

function apiUrl(env, browser = true) {
  const source = fs.readFileSync(path.join(__dirname, '../apps/web/lib/api.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const context = { exports, process: { env } };
  if (browser) context.window = { location: { origin: 'https://validation.test.invalid' } };
  vm.runInNewContext(output, context);
  return exports.API_URL;
}

test('store proxy calls remain on the current browser origin', () => {
  assert.equal(apiUrl({ NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://production.test.invalid/api/store/' }), 'https://validation.test.invalid/api/store');
});
test('explicit direct API endpoints remain supported', () => {
  assert.equal(apiUrl({ NEXT_PUBLIC_API_URL: 'https://api.test.invalid/v1/' }), 'https://api.test.invalid/v1');
});
test('server-side rendering retains its internal API configuration', () => {
  assert.equal(apiUrl({ NODE_ENV: 'production', API_URL: 'http://internal-api/v1', NEXT_PUBLIC_API_URL: 'https://production.test.invalid/api/store' }, false), 'http://internal-api/v1');
});
test('development defaults and production fail-closed behavior are preserved', () => {
  assert.equal(apiUrl({}, false), 'http://localhost:4000/v1');
  assert.throws(() => apiUrl({ NODE_ENV: 'production' }, false), /production API URL is not configured/);
});
