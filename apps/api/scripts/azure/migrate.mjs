// Run inside the private Container Apps environment with the migration identity.
// No connection strings, customer rows, or provider secrets are logged.
import sql from 'mssql';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';

const config = JSON.parse(await readFile(new URL('./source-tables.json', import.meta.url), 'utf8'));
const quote = value => {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error('Invalid SQL identifier');
  return `[${value}]`;
};
const pool = await new sql.ConnectionPool({
  server: process.env.AZURE_SQL_SERVER, database: process.env.AZURE_SQL_DATABASE,
  authentication: { type: 'azure-active-directory-default', options: { clientId: process.env.AZURE_CLIENT_ID } },
  options: { encrypt: true, trustServerCertificate: false }, pool: { max: 3, min: 0 },
  requestTimeout: 120000, connectionTimeout: 30000,
}).connect();
const storage = new BlobServiceClient(`https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`, new DefaultAzureCredential());
const hash = text => createHash('sha256').update(text).digest('hex');
const migrationName = '20260927153000_azure_sql_baseline';
async function snapshot() {
  const name = process.env.MIGRATION_SNAPSHOT_BLOB;
  if (!name || !/^[a-zA-Z0-9_.-]+\.json$/.test(name)) throw new Error('MIGRATION_SNAPSHOT_BLOB is required');
  const text = (await storage.getContainerClient('migration-private').getBlobClient(name).downloadToBuffer()).toString('utf8');
  if (process.env.MIGRATION_SNAPSHOT_SHA256 && hash(text) !== process.env.MIGRATION_SNAPSHOT_SHA256) throw new Error('Snapshot checksum mismatch');
  const data = JSON.parse(text);
  if (data.sourceProject !== 'cxncbuducljauadcuvnu' || Object.keys(data.tables).sort().join() !== Object.keys(config).sort().join()) throw new Error('Unexpected source snapshot');
  return data;
}
async function columns() {
  const result = await pool.request().query(`SELECT t.name AS tableName, c.name, ty.name AS type, c.max_length AS maxLength, c.is_nullable AS nullable
    FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    WHERE SCHEMA_NAME(t.schema_id)='dbo'`);
  return Object.fromEntries(Object.keys(config).map(table => [table, result.recordset.filter(c=>c.tableName===table)]));
}
function normalized(table, row, cols, fromPostgres) {
  const out = {};
  for (const c of cols) {
    let value = row[c.name];
    if (value === undefined) throw new Error(`Missing column ${table}.${c.name}`);
    if (config[table].json.includes(c.name)) {
      if (value !== null) value = fromPostgres ? JSON.stringify(value) : value;
    }
    if (value !== null && /date|time/.test(c.type)) value = new Date(value);
    if (value !== null && /char/.test(c.type)) {
      if (typeof value !== 'string') throw new Error(`Invalid text ${table}.${c.name}`);
      if(c.maxLength>0 && value.length>c.maxLength/2) throw new Error(`Oversized source value ${table}.${c.name}`);
    }
    if(value===null && !c.nullable) throw new Error(`Null in required column ${table}.${c.name}`);
    out[c.name]=value;
  }
  for(const name of Object.keys(row)) if(!cols.some(c=>c.name===name)) throw new Error(`Unknown source column ${table}.${name}`);
  return out;
}
const canon = v => {
  if(v instanceof Date) return v.toISOString();
  if(Array.isArray(v)) return v.map(canon);
  if(v && typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])]));
  return v;
};
function rowHash(table,row,cols,fromPostgres) {
  const result=normalized(table,row,cols,fromPostgres);
  for(const field of config[table].json) if(result[field]!==null) result[field]=JSON.parse(result[field]);
  return hash(JSON.stringify(canon(result)));
}
async function verify(data, cols, connection=pool) {
  let total=0;
  for(const table of Object.keys(config)) {
    const rows=(await new sql.Request(connection).query(`SELECT * FROM [dbo].${quote(table)}`)).recordset;
    const expected=data.tables[table].map(r=>rowHash(table,r,cols[table],true)).sort();
    const actual=rows.map(r=>rowHash(table,r,cols[table],false)).sort();
    if(JSON.stringify(expected)!==JSON.stringify(actual)) throw new Error(`Row verification failed: ${table}`);
    total+=rows.length;
  }
  console.log(JSON.stringify({verifiedTables:Object.keys(config).length,verifiedRows:total}));
}
async function bootstrap() {
  const text=await readFile(new URL(`../../prisma/migrations-sqlserver/${migrationName}/migration.sql`,import.meta.url),'utf8');
  const tableCount=(await pool.request().query('SELECT COUNT(*) AS n FROM sys.tables')).recordset[0].n;
  if(tableCount) throw new Error('Bootstrap requires an empty database');
  await pool.request().batch(text);
  await pool.request().batch(`CREATE TABLE [dbo].[_prisma_migrations] (
    [id] NVARCHAR(36) NOT NULL PRIMARY KEY, [checksum] NVARCHAR(64) NOT NULL,
    [finished_at] DATETIMEOFFSET, [migration_name] NVARCHAR(250) NOT NULL,
    [logs] NVARCHAR(MAX), [rolled_back_at] DATETIMEOFFSET,
    [started_at] DATETIMEOFFSET NOT NULL DEFAULT CURRENT_TIMESTAMP,
    [applied_steps_count] INT NOT NULL DEFAULT 0);`);
  await pool.request().input('id',randomUUID()).input('checksum',hash(text)).input('name',migrationName)
    .query('INSERT INTO [_prisma_migrations] ([id],[checksum],[migration_name],[finished_at],[applied_steps_count]) VALUES (@id,@checksum,@name,SYSDATETIMEOFFSET(),1)');
  console.log('SQL baseline installed');
}
async function importData() {
  const data=await snapshot(); const cols=await columns();
  for(const table of Object.keys(config)) for(const row of data.tables[table]) normalized(table,row,cols[table],true);
  const fks=(await pool.request().query('SELECT OBJECT_NAME(parent_object_id) AS child,OBJECT_NAME(referenced_object_id) AS parent FROM sys.foreign_keys')).recordset;
  const pending=new Set(Object.keys(config)),ordered=[];
  while(pending.size) {
    const ready=[...pending].filter(t=>!fks.some(f=>f.child===t&&pending.has(f.parent)&&f.parent!==t));
    if(!ready.length) throw new Error('Cyclic foreign keys require reviewed migration order');
    for(const t of ready){pending.delete(t);ordered.push(t);}
  }
  const tx=new sql.Transaction(pool); await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    for(const table of ordered) {
      const count=(await new sql.Request(tx).query(`SELECT COUNT(*) AS n FROM [dbo].${quote(table)} WITH (UPDLOCK,HOLDLOCK)`)).recordset[0].n;
      if(count) throw new Error(`Import requires empty target table ${table}`);
      for(const row of data.tables[table]) {
        const values=normalized(table,row,cols[table],true),req=new sql.Request(tx),names=Object.keys(values);
        for(let i=0;i<names.length;i++) {
          const c=cols[table].find(c=>c.name===names[i]); const v=values[names[i]];
          const type=/char/.test(c.type)?sql.NVarChar(sql.MAX):c.type==='bit'?sql.Bit:/date|time/.test(c.type)?sql.DateTime2:c.type==='int'?sql.Int:undefined;
          if(!type) throw new Error(`Unsupported import type ${c.type}`);
          req.input(`p${i}`,type,v);
        }
        await req.query(`INSERT INTO [dbo].${quote(table)} (${names.map(quote).join(',')}) VALUES (${names.map((_,i)=>`@p${i}`).join(',')})`);
      }
    }
    await verify(data,cols,tx); await tx.commit(); console.log('Import committed after exact row verification');
  } catch(error){await tx.rollback();throw error;}
}
async function grantRuntime() {
  const principal=process.env.API_PRINCIPAL_ID;
  if(!/^[0-9a-f-]{36}$/i.test(principal??'')) throw new Error('API_PRINCIPAL_ID required');
  await pool.request().input('principal',sql.UniqueIdentifier,principal).batch(`
    DECLARE @sid NVARCHAR(34)=CONVERT(NVARCHAR(34),CONVERT(VARBINARY(16),@principal),1);
    IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name='id-hidi-api')
      EXEC('CREATE USER [id-hidi-api] WITH SID = '+@sid+', TYPE = E');
    GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [id-hidi-api];
    DENY SELECT, INSERT, UPDATE, DELETE ON [dbo].[_prisma_migrations] TO [id-hidi-api];
    DENY UPDATE, DELETE ON [dbo].[WalletLedger] TO [id-hidi-api];
    DENY UPDATE, DELETE ON [dbo].[OrderAuditEvent] TO [id-hidi-api];`);
  console.log('Runtime database permissions configured; no DDL permission granted');
}
try {
  const command=process.argv[2];
  if(command==='bootstrap') await bootstrap();
  else if(command==='import') await importData();
  else if(command==='verify') await verify(await snapshot(),await columns());
  else if(command==='grant-runtime') await grantRuntime();
  else if(command==='check') console.log(JSON.stringify((await pool.request().query('SELECT DB_NAME() AS databaseName,COUNT(*) AS tableCount FROM sys.tables')).recordset[0]));
  else throw new Error('Expected bootstrap, import, verify, grant-runtime, or check');
} catch(error) {
  // Driver errors can contain row values: log only code and our own safe validation messages.
  console.error(JSON.stringify({failed:true,code:error.code??'VALIDATION',message:error.code?'Database operation failed':error.message}));
  process.exitCode=1;
} finally {await pool.close();}
