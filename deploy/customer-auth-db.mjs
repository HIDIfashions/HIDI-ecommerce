import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sql from 'mssql';

const name = '20260929200000_customer_whatsapp_auth';
assert.equal(process.env.AZURE_SQL_DATABASE, 'hidi-sql-validation', 'Auth setup must target the isolated validation database');
const text = await readFile(`prisma/migrations-sqlserver/${name}/migration.sql`, 'utf8');
const checksum = createHash('sha256').update(text).digest('hex');
const pool = await new sql.ConnectionPool({
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  authentication: { type: 'azure-active-directory-default', options: { clientId: process.env.AZURE_CLIENT_ID } },
  options: { encrypt: true, trustServerCertificate: false },
  connectionTimeout: 30000,
  requestTimeout: 120000,
}).connect();
const tx = new sql.Transaction(pool);
let active = false;
try {
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  active = true;
  const request = () => new sql.Request(tx);
  await request().batch(`
    DECLARE @result INT;
    EXEC @result = sys.sp_getapplock @Resource=N'hidi-customer-auth-migration',
      @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=30000;
    IF @result < 0 THROW 50001, 'Auth migration lock unavailable', 1;`);
  const state = (await request().query(`SELECT
    CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS NVARCHAR(128)) AS collation,
    OBJECT_ID('dbo.User', 'U') AS users,
    OBJECT_ID('dbo._prisma_migrations', 'U') AS history,
    OBJECT_ID('dbo.CustomerAuthOtp', 'U') AS otp,
    OBJECT_ID('dbo.CustomerAuthSession', 'U') AS sessions;`)).recordset[0];
  assert.equal(state.collation, 'Latin1_General_100_BIN2');
  assert(state.users && state.history, 'Existing Azure SQL baseline is required');
  assert.equal(Boolean(state.otp), Boolean(state.sessions), 'Partial auth schema needs manual review');
  const applied = (await request().input('name', sql.NVarChar(250), name).query(
    'SELECT checksum, finished_at, rolled_back_at FROM dbo._prisma_migrations WHERE migration_name=@name',
  )).recordset;
  assert(applied.length <= 1, 'Duplicate auth migration history needs review');
  if (applied.length) {
    assert.equal(applied[0].checksum, checksum, 'Auth migration checksum differs');
    assert(applied[0].finished_at && !applied[0].rolled_back_at, 'Auth migration is not complete');
    assert(state.otp && state.sessions, 'Auth migration history and schema disagree');
  }
  if (!state.otp) await request().batch(text);

  const definitions = {
    CustomerAuthOtp: [
      ['id', 'nvarchar', 128, false], ['phone', 'nvarchar', 382, false],
      ['codeHash', 'nvarchar', 256, false], ['purpose', 'nvarchar', 80, false],
      ['channel', 'nvarchar', 80, false], ['attempts', 'int', 4, false],
      ['expiresAt', 'datetime2', 8, false], ['consumedAt', 'datetime2', 8, true],
      ['createdAt', 'datetime2', 8, false],
    ],
    CustomerAuthSession: [
      ['id', 'nvarchar', 128, false], ['userId', 'nvarchar', 128, false],
      ['authSubject', 'nvarchar', 382, false], ['tokenHash', 'nvarchar', 256, false],
      ['expiresAt', 'datetime2', 8, false], ['revokedAt', 'datetime2', 8, true],
      ['lastUsedAt', 'datetime2', 8, true], ['createdAt', 'datetime2', 8, false],
    ],
  };
  const columns = (await request().query(`
    SELECT t.name AS tableName, c.name, ty.name AS type, c.max_length AS length,
      c.is_nullable AS nullable, c.collation_name AS collation
    FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
    JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN ('CustomerAuthOtp','CustomerAuthSession');`)).recordset;
  for (const [table, expected] of Object.entries(definitions)) {
    const actual = columns.filter(c => c.tableName === table);
    assert.equal(actual.length, expected.length, `Unexpected ${table} columns`);
    for (const [column, type, length, nullable] of expected) {
      const c = actual.find(c => c.name === column);
      assert(c, `Missing ${table}.${column}`);
      assert.deepEqual([c.type, c.length, Boolean(c.nullable)], [type, length, nullable], `Invalid ${table}.${column}`);
      if (type === 'nvarchar') assert.equal(c.collation, 'Latin1_General_100_BIN2');
    }
  }
  const indexes = (await request().query(`
    SELECT t.name AS tableName, i.name, i.is_unique AS uniqueIndex, c.name AS columnName, ic.key_ordinal AS ordinal
    FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id
    JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
    JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
    WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN ('CustomerAuthOtp','CustomerAuthSession')
      AND ic.key_ordinal > 0 ORDER BY ic.key_ordinal;`)).recordset;
  for (const [index, unique, fields] of [
    ['CustomerAuthOtp_pkey', true, ['id']],
    ['CustomerAuthSession_pkey', true, ['id']],
    ['CustomerAuthOtp_phone_purpose_expiresAt_idx', false, ['phone','purpose','expiresAt']],
    ['CustomerAuthOtp_expiresAt_consumedAt_idx', false, ['expiresAt','consumedAt']],
    ['CustomerAuthSession_tokenHash_key', true, ['tokenHash']],
    ['CustomerAuthSession_userId_expiresAt_idx', false, ['userId','expiresAt']],
    ['CustomerAuthSession_authSubject_idx', false, ['authSubject']],
    ['CustomerAuthSession_expiresAt_revokedAt_idx', false, ['expiresAt','revokedAt']],
  ]) {
    const rows = indexes.filter(i => i.name === index);
    assert.deepEqual(rows.map(i => i.columnName), fields, `Invalid ${index}`);
    assert(rows.every(i => Boolean(i.uniqueIndex) === unique), `Invalid uniqueness for ${index}`);
  }
  const fks = (await request().query(`
    SELECT f.name FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id
    WHERE f.parent_object_id=OBJECT_ID('dbo.CustomerAuthSession')
      AND f.referenced_object_id=OBJECT_ID('dbo.User') AND f.is_disabled=0 AND f.is_not_trusted=0
      AND f.delete_referential_action=0 AND f.update_referential_action=0
      AND COL_NAME(fc.parent_object_id,fc.parent_column_id)='userId'
      AND COL_NAME(fc.referenced_object_id,fc.referenced_column_id)='id';`)).recordset;
  assert.equal(fks.length, 1, 'Session user foreign key is required');
  const permissions = (await request().batch(`
    EXECUTE AS USER = 'id-hidi-api';
    SELECT HAS_PERMS_BY_NAME('dbo.CustomerAuthSession','OBJECT','SELECT') AS canRead,
      HAS_PERMS_BY_NAME('dbo.CustomerAuthSession','OBJECT','INSERT') AS canInsert,
      HAS_PERMS_BY_NAME('dbo.CustomerAuthSession','OBJECT','UPDATE') AS canUpdate,
      HAS_PERMS_BY_NAME('dbo.CustomerAuthSession','OBJECT','DELETE') AS canDelete,
      HAS_PERMS_BY_NAME('dbo','SCHEMA','ALTER') AS canAlter;
    REVERT;`)).recordset[0];
  assert.deepEqual(permissions, { canRead: 1, canInsert: 1, canUpdate: 1, canDelete: 1, canAlter: 0 }, 'Runtime permissions need review');
  if (!applied.length) {
    await request().input('id', sql.NVarChar(36), randomUUID()).input('checksum', sql.NVarChar(64), checksum)
      .input('name', sql.NVarChar(250), name).query(`INSERT INTO dbo._prisma_migrations
        (id,checksum,migration_name,finished_at,applied_steps_count)
        VALUES (@id,@checksum,@name,SYSDATETIMEOFFSET(),1);`);
  }
  await tx.commit();
  active = false;
  console.log(JSON.stringify({ database: process.env.AZURE_SQL_DATABASE, authTablesVerified: 2, migration: name, runtimeDmlOnly: true }));
} catch (error) {
  if (active) await tx.rollback().catch(() => {});
  console.error(JSON.stringify({ failed: true, code: error.code ?? 'VALIDATION', message: error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : 'Auth database setup failed' }));
  process.exitCode = 1;
} finally {
  await pool.close();
}
