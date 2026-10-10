// Executed inside the retained API revision. Only SELECTs against system metadata.
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const flag = value => value === null || value === undefined ? null : Number(value) === 1;
const integer = value => { const number = Number(value); if (!Number.isSafeInteger(number)) throw error('METADATA_NUMBER_INVALID'); return number; };
const name = value => { if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value)) throw error('METADATA_NAME_INVALID'); return value; };
const guid = value => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
function error(code) { return Object.assign(new Error(code), { code }); }
function invariant(condition, code) { if (!condition) throw error(code); }
async function metadata(db, sql) {
  const statements = sql.replace(/'(?:''|[^'])*'/g, '');
  invariant(/^\s*SELECT\b/i.test(statements) && !/[;]/.test(statements) && !/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|MERGE|EXEC|EXECUTE|GRANT|REVOKE|DENY|NEXT\s+VALUE\s+FOR)\b/i.test(statements), 'NON_READ_ONLY_QUERY_BLOCKED');
  const rows = await db.$queryRawUnsafe(sql); invariant(Array.isArray(rows) && rows.length <= 128, 'METADATA_ROWS_EXCEEDED'); return rows;
}

export async function inspectAccess(db, expectedDatabase, migrationPrincipalId = '') {
  invariant(typeof expectedDatabase === 'string' && expectedDatabase.length > 0 && expectedDatabase.length <= 128, 'CAPTURED_DATABASE_MISSING');
  invariant(!migrationPrincipalId || guid(migrationPrincipalId), 'MIGRATION_IDENTITY_INVALID');
  const identity = await metadata(db, `SELECT DB_NAME() AS databaseName, USER_NAME() AS principalName,
    HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS createTable,
    HAS_PERMS_BY_NAME(N'dbo','SCHEMA','CREATE SEQUENCE') AS createSequence,
    HAS_PERMS_BY_NAME(N'dbo','SCHEMA','ALTER') AS alterDbo,
    HAS_PERMS_BY_NAME(N'dbo','SCHEMA','CONTROL') AS controlDbo,
    HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS controlDatabase,
    HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS viewDefinition`);
  invariant(identity.length === 1 && identity[0].databaseName === expectedDatabase, 'DATABASE_TARGET_CHANGED');
  const capabilityNames = ['createTable', 'createSequence', 'alterDbo', 'controlDatabase', 'viewDefinition'];
  const effectiveCapabilities = Object.fromEntries(capabilityNames.map(key => [key, flag(identity[0][key])]));
  const schemaSequenceCreate = flag(identity[0].createSequence), schemaControl = flag(identity[0].controlDbo);
  const sequencePermissions = [schemaSequenceCreate, effectiveCapabilities.alterDbo, schemaControl];
  effectiveCapabilities.createSequence = sequencePermissions.some(value => value === true) ? true : sequencePermissions.every(value => value === false) ? false : null;
  const objects = await metadata(db, `SELECT
    CASE WHEN OBJECT_ID(N'dbo.HidiProductSKN',N'U') IS NULL THEN 0 ELSE 1 END AS mappingVisible,
    CASE WHEN OBJECT_ID(N'dbo.HidiProductSknSequence',N'SO') IS NULL THEN 0 ELSE 1 END AS sequenceVisible,
    HAS_PERMS_BY_NAME(N'dbo.HidiProductSKN','OBJECT','SELECT') AS mappingSelect,
    HAS_PERMS_BY_NAME(N'dbo.HidiProductSKN','OBJECT','INSERT') AS mappingInsert,
    HAS_PERMS_BY_NAME(N'dbo.HidiProductSKN','OBJECT','UPDATE') AS mappingUpdate,
    HAS_PERMS_BY_NAME(N'dbo.HidiProductSknSequence','OBJECT','UPDATE') AS sequenceUse`);
  invariant(objects.length === 1, 'OBJECT_METADATA_MISSING');
  const columns = await metadata(db, `SELECT name, TYPE_NAME(user_type_id) AS typeName, max_length, is_nullable
    FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U') ORDER BY column_id`);
  const indexes = await metadata(db, `SELECT i.name, i.is_unique, i.is_primary_key, i.is_disabled,
    c.name AS columnName, ic.key_ordinal FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
    JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
    WHERE i.object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U') AND ic.key_ordinal>0 ORDER BY i.index_id,ic.key_ordinal`);
  const checks = await metadata(db, `SELECT name, definition, is_disabled, is_not_trusted FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U')`);
  const defaults = await metadata(db, `SELECT d.name,d.definition,c.name AS columnName FROM sys.default_constraints d
    JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
    WHERE d.parent_object_id=OBJECT_ID(N'dbo.HidiProductSKN',N'U')`);
  const sequences = await metadata(db, `SELECT TYPE_NAME(user_type_id) AS typeName,
    CONVERT(BIGINT,start_value) AS startValue,CONVERT(BIGINT,increment) AS incrementValue,
    CONVERT(BIGINT,minimum_value) AS minimumValue,CONVERT(BIGINT,maximum_value) AS maximumValue,
    is_cycling,is_cached,is_exhausted FROM sys.sequences WHERE object_id=OBJECT_ID(N'dbo.HidiProductSknSequence',N'SO')`);
  let migrationPrincipal = { identityConfigured: Boolean(migrationPrincipalId), metadataQueried: false, principalVisible: null, effectivePermissionsEvaluated: false };
  if (migrationPrincipalId) {
    const principals = await metadata(db, `SELECT name,type_desc,authentication_type_desc,
      IS_ROLEMEMBER(N'db_owner',name) AS dbOwner,IS_ROLEMEMBER(N'db_ddladmin',name) AS dbDdlAdmin
      FROM sys.database_principals WHERE sid=CONVERT(VARBINARY(16),CONVERT(UNIQUEIDENTIFIER,'${migrationPrincipalId}'))`);
    invariant(principals.length <= 1, 'MIGRATION_PRINCIPAL_METADATA_AMBIGUOUS');
    migrationPrincipal = { ...migrationPrincipal, metadataQueried: true, principalVisible: principals.length === 1,
      principalHash: principals.length ? hash(principals[0].name) : null,
      dbOwnerMember: principals.length ? flag(principals[0].dbOwner) : null,
      dbDdlAdminMember: principals.length ? flag(principals[0].dbDdlAdmin) : null };
  }
  return {
    passed: true, readOnly: true, ddlExecuted: false, schemaChanged: false, applicationRowsModified: false, applicationRowsReturned: false,
    databaseHash: hash(expectedDatabase), runtimePrincipalHash: hash(identity[0].principalName),
    effectiveCapabilities, schemaSequenceCreate, schemaControl,
    ddlAuthorized: ['createTable', 'createSequence', 'alterDbo'].every(key => effectiveCapabilities[key] === true),
    metadataVisibilityLimited: effectiveCapabilities.viewDefinition !== true,
    mappingObjectVisible: flag(objects[0].mappingVisible), sequenceObjectVisible: flag(objects[0].sequenceVisible),
    objectCapabilities: Object.fromEntries(['mappingSelect', 'mappingInsert', 'mappingUpdate', 'sequenceUse'].map(key => [key, flag(objects[0][key])])),
    columns: columns.map(column => ({ name: name(column.name), type: name(column.typeName), maxLength: integer(column.max_length), nullable: flag(column.is_nullable) })),
    indexes: indexes.map(index => ({ nameHash: hash(index.name), unique: flag(index.is_unique), primary: flag(index.is_primary_key), disabled: flag(index.is_disabled), column: name(index.columnName), ordinal: integer(index.key_ordinal) })),
    checks: checks.map(check => ({ nameHash: hash(check.name), definitionVisible: typeof check.definition === 'string', definitionHash: typeof check.definition === 'string' ? hash(check.definition) : null, disabled: flag(check.is_disabled), untrusted: flag(check.is_not_trusted) })),
    defaults: defaults.map(item => ({ nameHash: hash(item.name), column: name(item.columnName), definitionVisible: typeof item.definition === 'string', definitionHash: typeof item.definition === 'string' ? hash(item.definition) : null })),
    sequences: sequences.map(sequence => ({ type: name(sequence.typeName), start: integer(sequence.startValue), increment: integer(sequence.incrementValue), minimum: integer(sequence.minimumValue), maximum: integer(sequence.maximumValue), cycling: flag(sequence.is_cycling), cached: flag(sequence.is_cached), exhausted: flag(sequence.is_exhausted) })),
    migrationPrincipal,
    absenceMayReflectMetadataVisibility: true,
  };
}

export async function run(expectedDatabase, migrationPrincipalId = '') {
  invariant(process.env.AZURE_SQL_DATABASE === expectedDatabase, 'CAPTURED_DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try { await db.$connect(); console.log('HIDI_SKN_ACCESS::' + JSON.stringify(await inspectAccess(db, expectedDatabase, migrationPrincipalId))); }
  finally { await db.$disconnect(); }
}
