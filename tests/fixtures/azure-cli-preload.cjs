// Isolated Azure CLI transport for setup tests; no Azure executable can run.
const cp = require('node:child_process');
const {syncBuiltinESMExports} = require('node:module');
const path = require('node:path');
const original = cp.execFileSync;
const fixture = process.env.AUTH_SETUP_TEST_FIXTURE;
if (!['azure-auth-cli.mjs', 'azure-msg91-auth-cli.mjs'].includes(path.basename(fixture || '')) || path.dirname(path.resolve(fixture)) !== __dirname) throw Error('Invalid Azure test fixture');
cp.execFileSync = (file, args, options) => {
  if (file !== 'az') throw Error('Unexpected external command in isolated Azure test: ' + file);
  return original(process.execPath, [fixture, ...args], options);
};
syncBuiltinESMExports();
