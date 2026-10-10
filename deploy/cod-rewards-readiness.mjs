import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {AzureCliCredential} from '../apps/api/node_modules/@azure/identity/dist/esm/index.js';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),sql=require('mssql');
const data=JSON.parse(await readFile(process.env.RUNNER_TEMP+'/hidi-cod-private/hidi-api.json','utf8'));
const env=Object.fromEntries(data.properties.template.containers[0].env.map(e=>[e.name,e.value]));
assert(env.AZURE_SQL_SERVER&&env.AZURE_SQL_DATABASE);
const token=await new AzureCliCredential().getToken('https://database.windows.net/.default');
const pool=await new sql.ConnectionPool({server:env.AZURE_SQL_SERVER,database:env.AZURE_SQL_DATABASE,authentication:{type:'azure-active-directory-access-token',options:{token:token.token}},options:{encrypt:true,trustServerCertificate:false},connectionTimeout:20000,requestTimeout:20000}).connect();
try{
 const tables=(await pool.request().query("SELECT name FROM sys.tables WHERE name IN ('WalletAccount','WalletLedger','WalletHold','RewardAccrual','PaymentRefund','OrderAuditEvent')")).recordset;assert.equal(tables.length,6);
 const trigger=(await pool.request().query("SELECT name FROM sys.triggers WHERE name='WalletLedger_immutable' AND is_disabled=0")).recordset;assert.equal(trigger.length,1);
 const invalid=(await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.WalletAccount w WHERE w.reservedPaise<0 OR w.reservedPaise<>COALESCE((SELECT SUM(h.amountPaise) FROM dbo.WalletHold h WHERE h.walletId=w.id AND h.status='ACTIVE'),0) OR w.balancePaise<>COALESCE((SELECT SUM(CAST(l.deltaPaise AS bigint)) FROM dbo.WalletLedger l WHERE l.walletId=w.id),0)`)).recordset[0].n;assert.equal(invalid,0,'Existing wallet accounts require reconciliation before activation');
 await writeFile('evidence/cod-rewards/sql-readiness.json',JSON.stringify({passed:true,database:env.AZURE_SQL_DATABASE,walletTables:tables.length,appendOnlyLedger:true,existingBalancesReconciled:true,readOnly:true},null,2));
 console.log('PASS: live wallet schema, append-only ledger and current balance/hold invariants verified read-only');
}finally{await pool.close();}
