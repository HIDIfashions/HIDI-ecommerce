#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const command = args.slice(0, args.indexOf('-g')).join(' ');
const mode = process.env.AUTH_SETUP_TEST_MODE;
const appName = args[args.indexOf('-n') + 1];
// Record names and references only; tests must not log secret values.
appendFileSync(process.env.AUTH_SETUP_TEST_LOG, JSON.stringify({ command, appName,
  env: args.filter(arg => arg.includes('=')).map(arg => arg.includes('=secretref:') ? arg : arg.split('=')[0]),
}) + '\n');

if (command === 'containerapp show') {
  process.stdout.write(JSON.stringify({ properties: {
    latestRevisionName: 'ready', latestReadyRevisionName: mode === 'web-unready' && appName === 'hidi-web' ? 'old' : 'ready',
    configuration: {
      activeRevisionsMode: mode === 'multiple' ? 'Multiple' : 'Single',
      secrets: [{ name: 'existing-signing' }, ...(mode === 'existing-key' ? [{ name: 'custom-msg91-key' }] : [])],
    },
    template: { containers: [{ env: [
      { name: 'MIGRATION_READ_ONLY', value: mode === 'unguarded' ? 'false' : 'true' },
      { name: 'MIGRATION_CUSTOMER_TESTING', value: mode === 'disabled' ? 'false' : 'true' },
      { name: 'AZURE_SQL_DATABASE', value: mode === 'production' ? 'hidi-sql' : 'hidi-sql-validation' },
      ...(mode === 'missing-firebase' ? [] : [{ name: 'FIREBASE_PROJECT_ID', value: 'hidi-dee0f' }]),
      mode === 'invalid-signing' ? { name: 'HIDI_AUTH_SECRET', value: 'short' }
        : { name: 'HIDI_AUTH_SECRET', secretRef: mode === 'missing-signing-ref' ? 'missing-signing' : 'existing-signing' },
      ...(['existing-key', 'missing-key-ref'].includes(mode)
        ? [{ name: 'MSG91_AUTHKEY', secretRef: 'custom-msg91-key' }] : []),
    ] }] },
  } }));
} else if (!['containerapp secret set', 'containerapp update'].includes(command)) {
  process.exit(2);
}
