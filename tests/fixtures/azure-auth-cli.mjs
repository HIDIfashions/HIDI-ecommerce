#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const command = args.slice(0, args.indexOf('-g') < 0 ? 3 : args.indexOf('-g')).join(' ');
const flag = name => args[args.indexOf(name) + 1];
const mode = process.env.AUTH_SETUP_TEST_MODE;
appendFileSync(process.env.AUTH_SETUP_TEST_LOG, JSON.stringify({ command, name: args.includes('-n') ? flag('-n') : undefined,
  envNames: args.filter(a => a.includes('=')).map(a => a.split('=')[0]) }) + '\n');
const output = value => process.stdout.write(JSON.stringify(value));
if (command === 'containerapp show') {
  output({ properties: { latestReadyRevisionName: 'ready', latestRevisionName: 'ready', configuration: { secrets: [] }, template: { containers: [{
    image: 'acrhidiprod0927.azurecr.io/hidi-api:feaf388bdc2d434d0133412073379e50efd6c337',
    env: [
      { name: 'AZURE_SQL_DATABASE', value: mode === 'production' ? 'hidi-sql' : 'hidi-sql-validation' },
      { name: 'AZURE_SQL_SERVER', value: 'sql-hidi-prod-0927.database.windows.net' },
      { name: 'MIGRATION_READ_ONLY', value: 'true' }, { name: 'MIGRATION_CUSTOMER_TESTING', value: 'true' },
      ...(mode === 'preserve' ? [{ name: 'HIDI_AUTH_SECRET', secretRef: 'existing-secret' }] : []),
    ],
  }] } } });
} else if (command === 'containerapp job show') {
  output({ identity: { userAssignedIdentities: { '/migration-identity': {} } }, properties: {
    configuration: { triggerType: 'Manual' }, template: { containers: [{ name: 'migration', env: [] }] },
  } });
} else if (command === 'containerapp job execution list') {
  const log = readFileSync(process.env.AUTH_SETUP_TEST_LOG, 'utf8');
  output(log.includes('"command":"containerapp job start"') ? [{ name: 'auth-execution', properties: { status: mode === 'migration-failed' ? 'Failed' : 'Succeeded' } }] : []);
} else if (command === 'identity show') {
  output({ id: '/migration-identity', clientId: 'migration-client', principalId: 'migration-principal', name: 'id-hidi-migration' });
} else if (command === 'sql server ad-admin show') {
  output({ login: 'Original administrator', sid: 'original-principal' });
} else if (command === 'containerapp job start') {
  const template = JSON.parse(readFileSync(flag('--yaml'), 'utf8'));
  if (template.containers[0].command[0] !== 'node' || !template.containers[0].args[2].includes('customer_whatsapp_auth')) process.exit(2);
  output({ name: 'auth-execution' });
} else if (command === 'containerapp job stop' && mode === 'migration-failed') {
  process.exit(1);
} else if (!['sql server ad-admin update', 'containerapp secret set', 'containerapp update', 'containerapp job stop'].includes(command)) {
  process.exit(2);
}
