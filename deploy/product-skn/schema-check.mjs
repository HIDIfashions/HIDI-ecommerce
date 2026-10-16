// Private, read-only readiness check. Emit only counts, flags and hashes.
import { createHash } from 'node:crypto';

export const DEFAULT_DEFINITION = 'CONVERT(CHAR(5), NEXT VALUE FOR dbo.HidiProductSknSequence)';
export const SKN_CHECK_DEFINITION = "skn COLLATE Latin1_General_100_BIN2 LIKE '[1-9][0-9][0-9][0-9][0-9]' AND skn >= '10000' AND skn <= '99999'";
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = text => String(text).replace(/[\s\[\]()]/g, '').toLowerCase();
export const SCHEMA_CONTRACT_HASH = hash(JSON.stringify({ version: 1, table: 'dbo.HidiProductSKN',
  productId: 'NVARCHAR(64) COLLATE DATABASE_DEFAULT PRIMARY KEY', skn: 'CHAR(5) COLLATE Latin1_General_100_BIN2 UNIQUE',
  default: normalize(DEFAULT_DEFINITION), check: normalize(SKN_CHECK_DEFINITION),
  sequence: 'INT 10000..99999 INCREMENT 1 NO CYCLE NO CACHE', preservesDeletedReservations: true }));
const flag = value => Number(value) === 1;
const count = value => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw failure('SCHEMA_COUNT_OUT_OF_RANGE');
  return result;
};
function failure(code) { return Object.assign(new Error(code), { code }); }
function invariant(condition, code) { if (!condition) throw failure(code); }
function query(db, sql) { return db.$queryRawUnsafe(sql); }

export async function inspectSchema(db, expectedDatabase) {
  invariant(typeof expectedDatabase === 'string' && expectedDatabase.length > 0, 'CAPTURED_DATABASE_MISSING');
  let identity, productColumns, mappingColumns, indexes, checks, sequences, defaults, foreignKeys, permissions;
  try {
    identity = await query(db, `SELECT DB_NAME() AS databaseName,
      CAST(DATABASEPROPERTYEX(DB_NAME(),'Collation') AS NVARCHAR(128)) AS collation,
      HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS createTable,
      HAS_PERMS_BY_NAME(N'dbo','SCHEMA','CREATE SEQUENCE') AS createSequence,
      HAS_PERMS_BY_NAME(N'dbo','SCHEMA','ALTER') AS alterSchema,
      HAS_PERMS_BY_NAME(N'dbo','SCHEMA','CONTROL') AS controlSchema,
      HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS controlDatabase`);
    invariant(identity.length === 1 && identity[0].databaseName === expectedDatabase, 'DATABASE_TARGET_CHANGED');
    productColumns = await query(db, `SELECT name, TYPE_NAME(user_type_id) AS typeName, max_length, is_nullable
      FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Product',N'U') AND name IN (N'id',N'createdAt')`);
    mappingColumns = await query(db, `SELECT name, TYPE_NAME(user_type_id) AS typeName, max_length, is_nullable, collation_name
      FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U')`);
    indexes = await query(db, `SELECT i.name, i.is_unique, i.is_primary_key, i.is_disabled,
      c.name AS columnName, ic.key_ordinal, i.has_filter
      FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
      JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
      WHERE i.object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U') AND ic.key_ordinal>0`);
    checks = await query(db, `SELECT name, definition, is_disabled, is_not_trusted
      FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U')`);
    defaults = await query(db, `SELECT d.name,d.definition,c.name AS columnName
      FROM sys.default_constraints d JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
      WHERE d.parent_object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U')`);
    foreignKeys = await query(db, `SELECT COUNT(*) AS n FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U')`);
    sequences = await query(db, `SELECT TYPE_NAME(user_type_id) AS typeName,
      CAST(start_value AS BIGINT) AS startValue, CAST(increment AS BIGINT) AS incrementValue,
      CAST(minimum_value AS BIGINT) AS minimumValue, CAST(maximum_value AS BIGINT) AS maximumValue,
      CAST(current_value AS BIGINT) AS currentValue, is_cycling, is_cached, is_exhausted
      FROM sys.sequences WHERE object_id=OBJECT_ID(N'dbo.HidiProductSknSequence',N'SO')`);
    permissions = await query(db, `SELECT
      HAS_PERMS_BY_NAME(N'dbo.Product',N'OBJECT',N'SELECT') AS productRead,
      HAS_PERMS_BY_NAME(N'dbo.HidiProductSKN',N'OBJECT',N'SELECT') AS mappingRead,
      HAS_PERMS_BY_NAME(N'dbo.HidiProductSKN',N'OBJECT',N'INSERT') AS mappingInsert,
      HAS_PERMS_BY_NAME(N'dbo.HidiProductSKN',N'OBJECT',N'UPDATE') AS mappingUpdate,
      HAS_PERMS_BY_NAME(N'dbo.HidiProductSKN',N'OBJECT',N'DELETE') AS mappingDelete,
      HAS_PERMS_BY_NAME(N'dbo.HidiProductSknSequence',N'OBJECT',N'UPDATE') AS sequenceUse`);
  } catch (error) {
    if (error?.code === 'DATABASE_TARGET_CHANGED') throw error;
    throw failure('PRIVATE_SCHEMA_METADATA_QUERY_FAILED');
  }
  const pId = productColumns.find(column => column.name === 'id');
  const pDate = productColumns.find(column => column.name === 'createdAt');
  const existingProductSchema = productColumns.length === 2 && pId?.typeName === 'nvarchar'
    && Number(pId.max_length) === 128 && !flag(pId.is_nullable)
    && pDate?.typeName === 'datetime2' && !flag(pDate.is_nullable);
  const mId = mappingColumns.find(column => column.name === 'productId');
  const mSkn = mappingColumns.find(column => column.name === 'skn');
  const mappingColumnsVerified = mappingColumns.length === 2 && mId?.typeName === 'nvarchar'
    && Number(mId.max_length) === 128 && !flag(mId.is_nullable) && mId.collation_name === identity[0].collation
    && mSkn?.typeName === 'char' && Number(mSkn.max_length) === 5 && !flag(mSkn.is_nullable)
    && mSkn.collation_name === 'Latin1_General_100_BIN2';
  const matchingIndex = (name, column, primary) => {
    const matched = indexes.filter(index => index.name === name);
    return matched.length === 1 && matched[0].columnName === column && Number(matched[0].key_ordinal) === 1
      && flag(matched[0].is_unique) && flag(matched[0].is_primary_key) === primary
      && !flag(matched[0].is_disabled) && !flag(matched[0].has_filter);
  };
  const mappingIndexesVerified = matchingIndex('HidiProductSKN_pkey', 'productId', true)
    && matchingIndex('HidiProductSKN_skn_key', 'skn', false);
  const constraint = checks.find(check => check.name === 'HidiProductSKN_skn_values');
  const mappingConstraintTrusted = checks.length === 1 && !!constraint && !flag(constraint.is_disabled) && !flag(constraint.is_not_trusted);
  const constraintDefinitionVisible = typeof constraint?.definition === 'string';
  const constraintDefinitionVerified = constraintDefinitionVisible ? normalize(constraint.definition) === normalize(SKN_CHECK_DEFINITION) : null;
  const mappingDefault = defaults.length === 1 ? defaults[0] : null;
  const mappingDefaultPresent = !!mappingDefault && mappingDefault.name === 'HidiProductSKN_skn_df' && mappingDefault.columnName === 'skn';
  const defaultDefinitionVisible = typeof mappingDefault?.definition === 'string';
  const defaultDefinitionVerified = defaultDefinitionVisible
    ? normalize(mappingDefault.definition).replace(/,0$/, '') === normalize(DEFAULT_DEFINITION) : null;
  const sequence = sequences.length === 1 ? sequences[0] : null;
  const sequenceBoundsVerified = !!sequence && sequence.typeName === 'int'
    && Number(sequence.startValue) === 10000 && Number(sequence.incrementValue) === 1
    && Number(sequence.minimumValue) === 10000 && Number(sequence.maximumValue) === 99999
    && !flag(sequence.is_cycling) && !flag(sequence.is_cached);
  const ddlCapabilities = Object.fromEntries(['createTable', 'alterSchema', 'controlSchema', 'controlDatabase'].map(key => [key, flag(identity[0][key])]));
  ddlCapabilities.schemaSequenceCreate = flag(identity[0].createSequence);
  // SQL Server CREATE SEQUENCE is a schema permission. ALTER or CONTROL on
  // that schema also authorizes it; DATABASE CREATE SEQUENCE is invalid scope.
  ddlCapabilities.createSequence = ddlCapabilities.schemaSequenceCreate || ddlCapabilities.alterSchema || ddlCapabilities.controlSchema;
  const dmlCapabilities = Object.fromEntries(['productRead', 'mappingRead', 'mappingInsert', 'mappingUpdate', 'mappingDelete', 'sequenceUse'].map(key => [key, flag(permissions[0]?.[key])]));
  let productCount = null, mappingCount = null, unmappedProductCount = null, invalidSknCount = null, reservedDeletedProductCount = null, sequenceNotBehindReservations = null;
  try {
    if (existingProductSchema && dmlCapabilities.productRead) productCount = count((await query(db, 'SELECT COUNT_BIG(*) AS n FROM dbo.Product'))[0].n);
    if (mappingColumnsVerified && dmlCapabilities.mappingRead && dmlCapabilities.productRead) {
      const counts = (await query(db, `SELECT
        (SELECT COUNT_BIG(*) FROM dbo.HidiProductSKN) AS mappingCount,
        (SELECT COUNT_BIG(*) FROM dbo.Product p LEFT JOIN dbo.HidiProductSKN s ON s.productId=p.id COLLATE DATABASE_DEFAULT WHERE s.productId IS NULL) AS unmappedProductCount,
        (SELECT COUNT_BIG(*) FROM dbo.HidiProductSKN WHERE skn COLLATE Latin1_General_100_BIN2 NOT LIKE '[1-9][0-9][0-9][0-9][0-9]' OR skn<'10000' OR skn>'99999') AS invalidSknCount,
        (SELECT COUNT_BIG(*) FROM dbo.HidiProductSKN s LEFT JOIN dbo.Product p ON p.id COLLATE DATABASE_DEFAULT=s.productId WHERE p.id IS NULL) AS reservedDeletedProductCount,
        (SELECT CASE WHEN COALESCE(MAX(TRY_CONVERT(INT,skn)),10000)<=(SELECT CAST(current_value AS INT) FROM sys.sequences WHERE object_id=OBJECT_ID(N'dbo.HidiProductSknSequence',N'SO')) THEN 1 ELSE 0 END FROM dbo.HidiProductSKN) AS sequenceNotBehindReservations`))[0];
      mappingCount = count(counts.mappingCount); unmappedProductCount = count(counts.unmappedProductCount);
      invalidSknCount = count(counts.invalidSknCount); reservedDeletedProductCount = count(counts.reservedDeletedProductCount);
      sequenceNotBehindReservations = flag(counts.sequenceNotBehindReservations);
    }
  } catch { throw failure('PRIVATE_SCHEMA_COUNTS_QUERY_FAILED'); }
  const checksRequired = {
    EXISTING_PRODUCT_SCHEMA: existingProductSchema, MAPPING_COLUMNS: mappingColumnsVerified,
    MAPPING_UNIQUE_INDEXES: mappingIndexesVerified, MAPPING_TRUSTED_CHECK: mappingConstraintTrusted,
    HISTORICAL_RESERVATIONS_INDEPENDENT: Number(foreignKeys[0]?.n) === 0,
    CHECK_DEFINITION: constraintDefinitionVerified !== false, SEQUENCE_DEFAULT_PRESENT: mappingDefaultPresent,
    SEQUENCE_DEFAULT_DEFINITION: defaultDefinitionVerified !== false, NONCYCLING_SEQUENCE_BOUNDS: sequenceBoundsVerified,
    RUNTIME_MAPPING_ACCESS: dmlCapabilities.productRead && dmlCapabilities.mappingRead && dmlCapabilities.mappingInsert,
    EXISTING_PRODUCTS_MAPPED: unmappedProductCount === 0, ALL_SKNS_VALID: invalidSknCount === 0,
    SEQUENCE_RESERVATION_HISTORY: sequenceNotBehindReservations === true,
    SKN_CAPACITY_AVAILABLE: !!sequence && !flag(sequence.is_exhausted),
  };
  const missingRequirements = Object.entries(checksRequired).filter(([, valid]) => !valid).map(([key]) => key);
  return {
    passed: true, readOnly: true, ddlExecuted: false, schemaChanged: false, applicationRowsModified: false,
    applicationRowsReturned: false, aggregateApplicationRowsQueried: productCount !== null,
    databaseHash: hash(expectedDatabase), existingProductSchema, mappingPresent: mappingColumns.length > 0,
    mappingColumnsVerified, mappingIndexesVerified, mappingConstraintTrusted, constraintDefinitionVisible,
    historicalReservationsIndependent: Number(foreignKeys[0]?.n) === 0, expectedOwnerSchemaHash: SCHEMA_CONTRACT_HASH,
    constraintDefinitionVerified, mappingDefaultPresent, defaultDefinitionVisible, defaultDefinitionVerified,
    sequencePresent: !!sequence, sequenceBoundsVerified, sequenceExhausted: sequence ? flag(sequence.is_exhausted) : null,
    sequenceCurrentValue: sequence ? Number(sequence.currentValue) : null,
    ddlCapabilities, ddlAuthorized: ['createTable', 'createSequence', 'alterSchema'].every(key => ddlCapabilities[key]),
    dmlCapabilities, productCount, mappingCount, unmappedProductCount, invalidSknCount, reservedDeletedProductCount, sequenceNotBehindReservations,
    featureReady: missingRequirements.length === 0, missingRequirements,
    ownerDefinitionVerificationRequired: !constraintDefinitionVisible || !defaultDefinitionVisible, taxonomyChecked: false,
  };
}

export function verifyOwnerProof(migration, proof, expectedDatabase, now = Date.now()) {
  invariant(typeof migration === 'string' && typeof proof === 'object' && proof !== null, 'OWNER_MIGRATION_PROOF_MISSING');
  invariant(/^[a-f0-9]{64}$/.test(proof.migrationSha256 || '') && hash(migration) === proof.migrationSha256, 'OWNER_MIGRATION_CHECKSUM_MISMATCH');
  invariant(/^acrhidiprod0927\.azurecr\.io\/hidi-api@sha256:[a-f0-9]{64}$/.test(proof.apiImage || '')
    && /^[a-f0-9]{64}$/.test(proof.apiSettingsHash || ''), 'OWNER_APP_CAPTURE_MISSING');
  const checkpoint = proof.checkpoint;
  invariant(checkpoint && checkpoint.passed === true && checkpoint.readOnly === true
    && checkpoint.databaseOnline === true, 'FRESH_SQL_PITR_CHECKPOINT_REQUIRED');
  invariant(checkpoint.databaseHash === hash(expectedDatabase) && checkpoint.apiImage === proof.apiImage
    && checkpoint.apiSettingsHash === proof.apiSettingsHash, 'SQL_PITR_CHECKPOINT_TARGET_MISMATCH');
  invariant(Number.isInteger(checkpoint.pitrRetentionDays) && checkpoint.pitrRetentionDays >= 1
    && checkpoint.pitrRetentionDays <= 3650, 'SQL_PITR_RETENTION_REQUIRED');
  const captured = Date.parse(checkpoint.capturedAtUtc), earliest = Date.parse(checkpoint.earliestRestoreDateUtc);
  invariant(Number.isFinite(captured) && Number.isFinite(earliest) && earliest < captured
    && captured <= now + 5000 && now - captured <= 15 * 60 * 1000, 'SQL_PITR_CHECKPOINT_NOT_FRESH');
  return { checkpointHash: hash(JSON.stringify(checkpoint)), checkpointAgeSeconds: Math.max(0, Math.floor((now - captured) / 1000)) };
}

export async function applyOwnerMigration(db, expectedDatabase, migration, proof) {
  const checkpoint = verifyOwnerProof(migration, proof, expectedDatabase);
  const before = await inspectSchema(db, expectedDatabase);
  invariant(before.ddlAuthorized === true, 'EXISTING_PRIVATE_IDENTITY_HAS_NO_DDL_PERMISSION');
  verifyOwnerProof(migration, proof, expectedDatabase);
  let applied;
  try { applied = await db.$queryRawUnsafe(migration); }
  catch { throw failure('OWNER_ADDITIVE_MIGRATION_FAILED'); }
  invariant(Array.isArray(applied) && applied.length === 1 && flag(applied[0].installed)
    && flag(applied[0].existingProductColumnsPreserved) && !flag(applied[0].existingProductRowsModified)
    && !flag(applied[0].identityOrPermissionChanges) && !flag(applied[0].sequenceRestarted), 'OWNER_MIGRATION_RESULT_INVALID');
  const after = await inspectSchema(db, expectedDatabase);
  invariant(after.mappingColumnsVerified && after.mappingIndexesVerified && after.mappingConstraintTrusted
    && after.constraintDefinitionVerified === true && after.mappingDefaultPresent
    && after.defaultDefinitionVerified === true && after.sequenceBoundsVerified && after.historicalReservationsIndependent
    && after.unmappedProductCount === 0 && after.invalidSknCount === 0 && after.sequenceNotBehindReservations,
    'OWNER_SCHEMA_VERIFICATION_FAILED');
  const mappingRowsInserted = after.mappingCount - (before.mappingCount ?? 0);
  invariant(Number.isSafeInteger(mappingRowsInserted) && mappingRowsInserted >= 0, 'OWNER_MAPPING_COUNT_INVALID');
  return {
    ...after, readOnly: false, ddlExecuted: !before.mappingPresent, schemaChanged: !before.mappingPresent,
    applicationRowsModified: mappingRowsInserted > 0, existingProductRowsModified: false, mappingRowsInserted,
    ownerMigrationExecuted: true, ownerDefinitionsVerified: true, definitionsVerified: true,
    ownerSchemaHash: SCHEMA_CONTRACT_HASH, identityOrPermissionChanges: false,
    migrationSha256: proof.migrationSha256, pitrCheckpointVerified: true,
    pitrCheckpointHash: checkpoint.checkpointHash, pitrCheckpointAgeSeconds: checkpoint.checkpointAgeSeconds,
  };
}

async function run(expectedDatabase, mode, ownerPayload) {
  invariant(process.env.AZURE_SQL_DATABASE === expectedDatabase, 'CAPTURED_DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const report = mode === 'migrateOwner'
      ? await applyOwnerMigration(db, expectedDatabase, ownerPayload?.migration, ownerPayload?.proof)
      : await inspectSchema(db, expectedDatabase);
    console.log('HIDI_SKN_SCHEMA::' + JSON.stringify({ ...report, mode }));
  } finally { await db.$disconnect(); }
}
export function checkDdl(expectedDatabase) { return run(expectedDatabase, 'checkDdl'); }
export function verify(expectedDatabase) { return run(expectedDatabase, 'verify'); }
export function migrateOwner(expectedDatabase, payload) { return run(expectedDatabase, 'migrateOwner', payload); }
