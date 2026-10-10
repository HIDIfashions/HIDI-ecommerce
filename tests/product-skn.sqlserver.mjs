// Fresh loopback CI databases only: refuses Azure/other hosts and drops fixtures.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaMssql } from '../apps/api/node_modules/@prisma/adapter-mssql/dist/index.mjs';
import { PrismaClient } from '../apps/api/dist/generated/prisma/client.js';
import { AdminProductsService } from '../apps/api/dist/admin/products/admin-products.service.js';
import { inspectSchema, DEFAULT_DEFINITION, SKN_CHECK_DEFINITION, verifyOwnerProof, applyOwnerMigration, SCHEMA_CONTRACT_HASH } from '../deploy/product-skn/schema-check.mjs';

assert.equal(process.env.SKN_TEST_SQL_HOST, '127.0.0.1', 'Product SKN regression accepts loopback only');
assert.ok(process.env.SKN_TEST_SQL_PASSWORD, 'Disposable SQL Server password is required');
const require = createRequire(new URL('../apps/api/package.json', import.meta.url)), sql = require('mssql');
const config = { server: '127.0.0.1', port: 1433, user: 'sa', password: process.env.SKN_TEST_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }, pool: { max: 15 }, connectionTimeout: 3000, requestTimeout: 30000 };
const database = 'product_skn_' + randomUUID().replaceAll('-', '').slice(0, 12), failureDatabase = database + '_failed';
const migration = await readFile(new URL('../deploy/product-skn/migration.sql', import.meta.url), 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
function ownerProof(target) {
  const apiImage = 'acrhidiprod0927.azurecr.io/hidi-api@sha256:' + 'a'.repeat(64), apiSettingsHash = 'b'.repeat(64);
  return { apiImage, apiSettingsHash, migrationSha256: digest(migration), checkpoint: { passed: true, readOnly: true,
    databaseOnline: true, databaseHash: digest(target), apiImage, apiSettingsHash, pitrRetentionDays: 7,
    earliestRestoreDateUtc: new Date(Date.now() - 7 * 86400000).toISOString(), capturedAtUtc: new Date().toISOString() } };
}

async function metadataRegression() {
  const fixture = {
    identity: [{ databaseName: 'unit_database', collation: 'Latin1_General_100_CI_AS_SC', createTable: 0, createSequence: 0, alterSchema: 0, controlDatabase: 0 }],
    productColumns: [{ name: 'id', typeName: 'nvarchar', max_length: 128, is_nullable: 0 }, { name: 'createdAt', typeName: 'datetime2', is_nullable: 0 }],
    mappingColumns: [{ name: 'productId', typeName: 'nvarchar', max_length: 128, is_nullable: 0, collation_name: 'Latin1_General_100_CI_AS_SC' },
      { name: 'skn', typeName: 'char', max_length: 5, is_nullable: 0, collation_name: 'Latin1_General_100_BIN2' }],
    indexes: [{ name: 'HidiProductSKN_pkey', columnName: 'productId', key_ordinal: 1, is_unique: 1, is_primary_key: 1, is_disabled: 0, has_filter: 0 },
      { name: 'HidiProductSKN_skn_key', columnName: 'skn', key_ordinal: 1, is_unique: 1, is_primary_key: 0, is_disabled: 0, has_filter: 0 }],
    checks: [{ name: 'HidiProductSKN_skn_values', definition: SKN_CHECK_DEFINITION, is_disabled: 0, is_not_trusted: 0 }],
    defaults: [{ name: 'HidiProductSKN_skn_df', columnName: 'skn', definition: DEFAULT_DEFINITION }],
    foreignKeys: [{ n: 0 }],
    sequences: [{ typeName: 'int', startValue: 10000, incrementValue: 1, minimumValue: 10000, maximumValue: 99999, currentValue: 10002, is_cycling: 0, is_cached: 0, is_exhausted: 0 }],
    permissions: [{ productRead: 1, mappingRead: 1, mappingInsert: 1, mappingUpdate: 1, mappingDelete: 1, sequenceUse: 1 }],
    productCounts: [{ n: 3 }], coverage: [{ mappingCount: 3, unmappedProductCount: 0, invalidSknCount: 0, reservedDeletedProductCount: 0, sequenceNotBehindReservations: 1 }],
  };
  const queryFixture = state => ({ $queryRawUnsafe: async text => {
    if (text.includes('SELECT DB_NAME()')) return state.identity;
    if (text.includes('FROM sys.columns') && text.includes("OBJECT_ID(N'dbo.Product'")) return state.productColumns;
    if (text.includes('FROM sys.columns')) return state.mappingColumns;
    if (text.includes('FROM sys.indexes')) return state.indexes;
    if (text.includes('FROM sys.check_constraints')) return state.checks;
    if (text.includes('FROM sys.default_constraints')) return state.defaults;
    if (text.includes('FROM sys.foreign_keys')) return state.foreignKeys;
    if (text.includes('AS mappingCount')) return state.coverage;
    if (text.includes('FROM sys.sequences')) return state.sequences;
    if (text.includes('AS productRead')) return state.permissions;
    if (text === 'SELECT COUNT_BIG(*) AS n FROM dbo.Product') return state.productCounts;
    throw new Error('Unexpected fixture metadata query');
  } });
  const ready = await inspectSchema(queryFixture(fixture), 'unit_database');
  assert.equal(ready.featureReady, true); assert.equal(ready.ddlAuthorized, false); assert.equal(ready.readOnly, true);
  const hidden = structuredClone(fixture); hidden.checks[0].definition = null; hidden.defaults[0].definition = null;
  const restricted = await inspectSchema(queryFixture(hidden), 'unit_database');
  assert.equal(restricted.featureReady, true); assert.equal(restricted.ownerDefinitionVerificationRequired, true);
  for (const [mutate, expected] of [
    [state => { state.mappingColumns[1].max_length = 6; }, 'MAPPING_COLUMNS'],
    [state => { state.indexes[1].has_filter = 1; }, 'MAPPING_UNIQUE_INDEXES'],
    [state => { state.checks[0].definition = 'skn IS NOT NULL'; }, 'CHECK_DEFINITION'],
    [state => { state.checks[0].is_not_trusted = 1; }, 'MAPPING_TRUSTED_CHECK'],
    [state => { state.defaults[0].definition = "'12345'"; }, 'SEQUENCE_DEFAULT_DEFINITION'],
    [state => { state.foreignKeys[0].n = 1; }, 'HISTORICAL_RESERVATIONS_INDEPENDENT'],
    [state => { state.sequences[0].is_cycling = 1; }, 'NONCYCLING_SEQUENCE_BOUNDS'],
    [state => { state.sequences[0].is_exhausted = 1; }, 'SKN_CAPACITY_AVAILABLE'],
    [state => { state.permissions[0].mappingInsert = 0; }, 'RUNTIME_MAPPING_ACCESS'],
    [state => { state.coverage[0].unmappedProductCount = 1; }, 'EXISTING_PRODUCTS_MAPPED'],
    [state => { state.coverage[0].invalidSknCount = 1; }, 'ALL_SKNS_VALID'],
    [state => { state.coverage[0].sequenceNotBehindReservations = 0; }, 'SEQUENCE_RESERVATION_HISTORY'],
  ]) {
    const broken = structuredClone(fixture); mutate(broken); const report = await inspectSchema(queryFixture(broken), 'unit_database');
    assert.equal(report.featureReady, false); assert.ok(report.missingRequirements.includes(expected));
    assert.equal(report.schemaChanged, false); assert.equal(report.applicationRowsModified, false);
  }
  await assert.rejects(() => inspectSchema(queryFixture(fixture), 'wrong_database'), { code: 'DATABASE_TARGET_CHANGED' });
  const proof = ownerProof('unit_database');
  assert.ok(verifyOwnerProof(migration, proof, 'unit_database').checkpointHash);
  for (const [mutate, code] of [
    [value => { value.migrationSha256 = '0'.repeat(64); }, 'OWNER_MIGRATION_CHECKSUM_MISMATCH'],
    [value => { value.checkpoint.passed = false; }, 'FRESH_SQL_PITR_CHECKPOINT_REQUIRED'],
    [value => { value.checkpoint.databaseHash = '0'.repeat(64); }, 'SQL_PITR_CHECKPOINT_TARGET_MISMATCH'],
    [value => { value.checkpoint.pitrRetentionDays = 0; }, 'SQL_PITR_RETENTION_REQUIRED'],
    [value => { value.checkpoint.capturedAtUtc = new Date(Date.now() - 20 * 60000).toISOString(); }, 'SQL_PITR_CHECKPOINT_NOT_FRESH'],
  ]) { const invalid = structuredClone(proof); mutate(invalid); assert.throws(() => verifyOwnerProof(migration, invalid, 'unit_database'), { code }); }
  await assert.rejects(() => applyOwnerMigration(queryFixture(fixture), 'unit_database', migration, proof), { code: 'EXISTING_PRIVATE_IDENTITY_HAS_NO_DDL_PERMISSION' });
  console.log('PASS: readonly metadata detects missing default/constraint/index/permission/coverage/capacity, supports actual default collation and hidden-definition owner evidence');
}
await metadataRegression();
if (process.argv.includes('--metadata-only')) process.exit(0);

let pool, db, created = false, failureCreated = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try { pool = await new sql.ConnectionPool(config).connect(); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
}
assert(pool, 'Disposable loopback SQL Server did not become ready');
const adapter = client => ({ $queryRawUnsafe: async text => (await client.request().query(text)).recordset });
const reservations = async () => (await pool.request().query('SELECT productId,skn FROM dbo.HidiProductSKN ORDER BY productId')).recordset;
const sequenceState = async () => (await pool.request().query("SELECT CAST(current_value AS INT) AS n,is_exhausted FROM sys.sequences WHERE name=N'HidiProductSknSequence'")).recordset[0];
const columns = async () => (await pool.request().query('SELECT column_id,name,user_type_id,max_length,is_nullable,collation_name FROM sys.columns WHERE object_id=OBJECT_ID(N\'dbo.Product\') ORDER BY column_id')).recordset;
async function rawInsert(ids, client = pool) {
  const request = client instanceof sql.Transaction ? new sql.Request(client) : client.request();
  const values = ids.map((id, index) => {
    request.input('id' + index, sql.NVarChar(64), id).input('slug' + index, sql.NVarChar(191), 'slug-' + id);
    return `(@id${index},N'Disposable',@slug${index},N'DRAFT',CAST('2026-01-01' AS DATETIME2),CAST('2026-01-01' AS DATETIME2))`;
  });
  await request.query(`INSERT INTO dbo.Product(id,name,slug,status,createdAt,updatedAt) VALUES ${values.join(',')}`);
}
async function hasRow(table, id) {
  assert.ok(['Product', 'HidiProductSKN'].includes(table));
  return (await pool.request().input('id', sql.NVarChar(64), id).query(`SELECT COUNT(*) AS n FROM dbo.${table} WHERE ${table === 'Product' ? 'id' : 'productId'}=@id`)).recordset[0].n;
}
try {
  await pool.request().batch(`CREATE DATABASE [${database}] COLLATE Latin1_General_100_BIN2; ALTER DATABASE [${database}] SET READ_COMMITTED_SNAPSHOT ON;`);
  created = true; await pool.close(); pool = await new sql.ConnectionPool({ ...config, database }).connect();
  const root = new URL('../apps/api/prisma/migrations-sqlserver/', import.meta.url);
  for (const folder of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    let text; try { text = await readFile(new URL(folder + '/migration.sql', root), 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await pool.request().batch(text);
  }
  await rawInsert(['old-b', 'old-a', 'old-c']);
  const originalColumns = await columns(), originalProducts = (await pool.request().query('SELECT * FROM dbo.Product ORDER BY id')).recordset;
  const preflight = await inspectSchema(adapter(pool), database);
  assert.equal(preflight.ddlAuthorized, true); assert.equal(preflight.featureReady, false); assert.equal(preflight.productCount, 3);
  db = new PrismaClient({ adapter: new PrismaMssql({ ...config, database }, { schema: 'dbo' }) }); await db.$connect();
  const ownerResult = await applyOwnerMigration(db, database, migration, ownerProof(database));
  assert.equal(ownerResult.ownerSchemaHash, SCHEMA_CONTRACT_HASH); assert.equal(ownerResult.definitionsVerified, true);
  assert.equal(ownerResult.pitrCheckpointVerified, true); assert.equal(ownerResult.existingProductRowsModified, false);
  assert.deepEqual(await columns(), originalColumns); assert.deepEqual((await pool.request().query('SELECT * FROM dbo.Product ORDER BY id')).recordset, originalProducts);
  assert.deepEqual(await reservations(), [{ productId: 'old-a', skn: '10000' }, { productId: 'old-b', skn: '10001' }, { productId: 'old-c', skn: '10002' }]);
  const ready = await inspectSchema(adapter(pool), database);
  assert.equal(ready.featureReady, true); assert.equal(ready.constraintDefinitionVerified, true); assert.equal(ready.defaultDefinitionVerified, true);
  assert.equal(ready.ownerDefinitionVerificationRequired, false);
  const beforeReinstall = await reservations(), sequenceBefore = await sequenceState();
  await pool.request().batch(migration); assert.deepEqual(await reservations(), beforeReinstall); assert.deepEqual(await sequenceState(), sequenceBefore);
  console.log('PASS: ordered backfill, CHAR(5) sequence default, unique/check metadata and reinstall preserve all Product rows/columns');

  const { ensureProductSkn } = await import('../apps/api/dist/admin/products/product-skn.js');
  const actual = await db.product.create({ data: { name: 'Actual Prisma', slug: 'actual-prisma', status: 'DRAFT' } });
  assert.equal(await hasRow('HidiProductSKN', actual.id), 0);
  const same = await Promise.all(Array.from({ length: 8 }, () => ensureProductSkn(db, actual.id)));
  assert.equal(new Set(same).size, 1); assert.match(same[0], /^[1-9][0-9]{4}$/);
  const differentIds = Array.from({ length: 8 }, (_, index) => 'parallel-' + index); await rawInsert(differentIds);
  const different = await Promise.all(differentIds.map(id => ensureProductSkn(db, id)));
  assert.equal(new Set(different).size, 8); assert.ok(different.every(skn => /^[1-9][0-9]{4}$/.test(skn)));
  await assert.rejects(() => ensureProductSkn(db, 'missing-product'));
  console.log('PASS: retained Prisma Product.create and transactional same/different-ID allocation work with no schema-model changes');

  const service = new AdminProductsService(db), payload = { name: 'Service Product', slug: 'service-product', categoryId: null, collectionIds: [],
    shortDescription: null, description: null, fabric: null, care: null, colors: [{ name: 'Magenta Pink', hex: null }], sizes: ['M', 'L', 'XL', 'XXL'],
    pricePaise: 109500, mrpPaise: 109500, weightGrams: null, requestId: randomUUID() };
  const createdProduct = await service.create(payload), replay = await service.create(payload);
  assert.equal(createdProduct.id, replay.id); assert.equal(createdProduct.skn, replay.skn); assert.equal(replay.variants.length, 4);
  const beforeEdits = await reservations();
  await db.product.update({ where: { id: createdProduct.id }, data: { name: 'Edited', status: 'ARCHIVED' } });
  await db.productVariant.updateMany({ where: { productId: createdProduct.id }, data: { pricePaise: 119500 } });
  assert.deepEqual(await reservations(), beforeEdits);
  await db.$disconnect(); await db.$connect(); assert.equal((await service.get(createdProduct.id)).skn, createdProduct.skn);
  await db.product.delete({ where: { id: actual.id } }); assert.equal(await hasRow('HidiProductSKN', actual.id), 1);
  assert.equal((await inspectSchema(adapter(pool), database)).reservedDeletedProductCount, 1);
  console.log('PASS: full service creation/replay, edited name/prices, archive, restart and hard-deletion reservations keep stable numbers');

  let consumed;
  await assert.rejects(() => db.$transaction(async tx => {
    await tx.product.create({ data: { id: 'failed-variant', name: 'Rollback', slug: 'failed-variant', status: 'DRAFT' } });
    consumed = await ensureProductSkn(tx, 'failed-variant');
    // Failure occurs after actual Product creation and mapping allocation.
    await tx.productVariant.create({ data: { productId: 'failed-variant', sku: replay.variants[0].sku, size: 'M', color: 'Pink', pricePaise: 100, mrpPaise: 100 } });
  }, { isolationLevel: 'Serializable' }));
  assert.equal(await hasRow('Product', 'failed-variant'), 0); assert.equal(await hasRow('HidiProductSKN', 'failed-variant'), 0);
  await rawInsert(['after-rollback']); assert.ok(Number(await ensureProductSkn(db, 'after-rollback')) > Number(consumed));
  for (const skn of ['00000', '09999', '12A45', '1234', '123 ', ' 1234']) {
    await assert.rejects(() => pool.request().input('id', sql.NVarChar(64), 'invalid-' + randomUUID()).input('skn', sql.VarChar(5), skn)
      .query('INSERT INTO dbo.HidiProductSKN(productId,skn) VALUES(@id,@skn)'));
  }
  await assert.rejects(() => pool.request().input('skn', sql.Char(5), same[0]).query("INSERT INTO dbo.HidiProductSKN(productId,skn) VALUES(N'duplicate-code',@skn)"));
  await assert.rejects(() => pool.request().query("INSERT INTO dbo.HidiProductSKN(productId,skn) VALUES(N'old-a','80000')"));
  console.log('PASS: failed variant rolls back Product/mapping atomically, consumed values remain unused, invalid ASCII/length/range/duplicate codes are rejected');

  await pool.request().batch('CREATE USER [skn_runtime_fixture] WITHOUT LOGIN; GRANT SELECT,INSERT,UPDATE,DELETE ON SCHEMA::dbo TO [skn_runtime_fixture];');
  const runtime = { $queryRawUnsafe: async text => (await pool.request().batch(`EXECUTE AS USER=N'skn_runtime_fixture';\n${text}\nREVERT;`)).recordset };
  const runtimeReport = await inspectSchema(runtime, database);
  assert.equal(runtimeReport.ddlAuthorized, false); assert.equal(runtimeReport.ddlCapabilities.alterSchema, false);
  assert.equal(runtimeReport.featureReady, true); assert.equal(runtimeReport.dmlCapabilities.mappingInsert, true);
  await pool.request().batch("GRANT VIEW DEFINITION ON OBJECT::dbo.HidiProductSKN TO [skn_runtime_fixture];");
  const definitionReport = await inspectSchema(runtime, database);
  assert.equal(definitionReport.ownerDefinitionVerificationRequired, false); assert.equal(definitionReport.defaultDefinitionVerified, true);
  await rawInsert(['runtime-default']);
  await pool.request().batch("EXECUTE AS USER=N'skn_runtime_fixture'; INSERT INTO dbo.HidiProductSKN(productId) VALUES(N'runtime-default'); REVERT;");
  assert.equal(await hasRow('HidiProductSKN', 'runtime-default'), 1);
  console.log('PASS: DML-only fixture uses sequence default without DDL; explicit disposable VIEW DEFINITION grant verifies hidden-definition evidence behavior');

  // Test-only owner reset; the production migration never restarts a sequence.
  await pool.request().batch('ALTER SEQUENCE dbo.HidiProductSknSequence RESTART WITH 99999;');
  const exhaustionSnapshot = await reservations();
  await assert.rejects(() => db.$transaction(async tx => {
    await tx.product.create({ data: { id: 'exhaust-a', name: 'Exhaust A', slug: 'exhaust-a' } });
    await tx.product.create({ data: { id: 'exhaust-b', name: 'Exhaust B', slug: 'exhaust-b' } });
    assert.equal(await ensureProductSkn(tx, 'exhaust-a'), '99999');
    await ensureProductSkn(tx, 'exhaust-b');
  }, { isolationLevel: 'Serializable' }));
  for (const id of ['exhaust-a', 'exhaust-b']) { assert.equal(await hasRow('Product', id), 0); assert.equal(await hasRow('HidiProductSKN', id), 0); }
  assert.deepEqual(await reservations(), exhaustionSnapshot);
  await pool.request().batch('ALTER SEQUENCE dbo.HidiProductSknSequence RESTART WITH 99999;');
  await rawInsert(['last-code']); assert.equal(await ensureProductSkn(db, 'last-code'), '99999');
  await assert.rejects(() => service.create({ ...payload, name: 'Past capacity', slug: 'past-capacity', requestId: randomUUID() }));
  assert.equal(await db.product.count({ where: { slug: 'past-capacity' } }), 0);
  assert.equal((await inspectSchema(adapter(pool), database)).featureReady, false);
  console.log('PASS: last code works; multi-product and full-service sequence exhaustion roll back Product/variant/mapping together');

  await pool.request().batch('ALTER TABLE dbo.HidiProductSKN NOCHECK CONSTRAINT HidiProductSKN_skn_values;');
  const incompatibleBefore = await reservations(), exhaustedBefore = await sequenceState();
  await assert.rejects(() => pool.request().batch(migration));
  assert.deepEqual(await reservations(), incompatibleBefore); assert.deepEqual(await sequenceState(), exhaustedBefore);
  await db.$disconnect(); db = null; await pool.close(); pool = await new sql.ConnectionPool(config).connect();
  await pool.request().batch(`CREATE DATABASE [${failureDatabase}] COLLATE Latin1_General_100_CI_AS_SC;`);
  failureCreated = true; await pool.close(); pool = await new sql.ConnectionPool({ ...config, database: failureDatabase }).connect();
  await pool.request().batch("CREATE TABLE dbo.Product(id NVARCHAR(64) NOT NULL PRIMARY KEY,name NVARCHAR(MAX) NOT NULL,slug NVARCHAR(191) NOT NULL,status NVARCHAR(40) NOT NULL,createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL); INSERT INTO dbo.Product VALUES(N'before-failure',N'Before',N'before',N'DRAFT',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);");
  const originalFailureColumns = await columns();
  const injected = migration.replace('    COMMIT TRANSACTION;', "    THROW 51999,'Disposable rollback probe',1;\n    COMMIT TRANSACTION;"); assert.notEqual(injected, migration);
  await assert.rejects(() => pool.request().batch(injected)); assert.deepEqual(await columns(), originalFailureColumns);
  assert.equal((await pool.request().query("SELECT COUNT(*) AS n FROM sys.objects WHERE name IN(N'HidiProductSKN',N'HidiProductSknSequence')")).recordset[0].n, 0);
  assert.equal((await pool.request().query('SELECT COUNT(*) AS n FROM dbo.Product')).recordset[0].n, 1);
  await pool.request().batch(migration); assert.equal((await inspectSchema(adapter(pool), failureDatabase)).featureReady, true);
  console.log('PASS: incompatible schema rerun refuses repair; initial migration failure rolls back objects and rows; nonbinary database default works without global changes');
} finally {
  await db?.$disconnect(); await pool?.close().catch(() => {});
  if (created || failureCreated) {
    const cleanup = await new sql.ConnectionPool(config).connect();
    try { for (const name of [created ? database : null, failureCreated ? failureDatabase : null].filter(Boolean)) {
      assert.match(name, /^product_skn_[a-f0-9]{12}(?:_failed)?$/);
      await cleanup.request().batch(`ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}];`);
    } } finally { await cleanup.close(); }
  }
}
