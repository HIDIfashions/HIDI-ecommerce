// Loaded inside the captured API revision. Only the reviewed additive CHECK
// migration is executed; no application module, worker or customer flow starts.
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const legacyStatuses = ['ACTIVE', 'ARCHIVED', 'DRAFT'];
const deletionStatuses = [...legacyStatuses, 'DELETED'].sort();
const checkQuery = "SELECT name, definition, is_disabled, is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Product') AND name=N'Product_status_values'";
const columnQuery = "SELECT TYPE_NAME(user_type_id) AS typeName,max_length,is_nullable FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Product') AND name=N'status'";
const failure = (code, diagnostics) => Object.assign(new Error(code), { code, ...(diagnostics ? { schemaDiagnostics: diagnostics } : {}) });
function invariant(condition, code, diagnostics) { if (!condition) throw failure(code, diagnostics); }
const literals = constraint => [...String(constraint?.definition || '').matchAll(/'((?:''|[^'])*)'/g)].map(match => match[1]).sort();
export function schemaDiagnostics(constraints, columns) {
  const constraint = constraints.length === 1 ? constraints[0] : null;
  const column = columns.length === 1 ? columns[0] : null;
  // Only bounded schema metadata is exported. SQL text, data rows, database
  // names, identity details and connection settings never leave the console.
  return {
    constraintCount: constraints.length, constraintPresent: constraints.length === 1,
    constraintEnabled: constraint ? Number(constraint.is_disabled) === 0 : null,
    constraintTrusted: constraint ? Number(constraint.is_not_trusted) === 0 : null,
    statusLiterals: constraint ? literals(constraint).slice(0, 20).map(value => /^[A-Z_]{1,40}$/.test(value) ? value : '[REDACTED]') : [],
    columnCount: columns.length, columnPresent: columns.length === 1,
    columnType: column && /^[a-z0-9_]{1,40}$/.test(String(column.typeName)) ? column.typeName : null,
    columnMaxLength: column && Number.isFinite(Number(column.max_length)) ? Number(column.max_length) : null,
    columnNullable: column ? Number(column.is_nullable) === 1 : null,
  };
}

export async function diagnoseSchema(db) {
  let constraints, columns, available;
  try {
    constraints = await db.$queryRawUnsafe(checkQuery);
    columns = await db.$queryRawUnsafe(columnQuery);
    available = await db.$queryRawUnsafe("SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Product') ORDER BY name");
  } catch { throw failure('PRODUCT_METADATA_QUERY_FAILED'); }
  return {
    readOnly: true, applicationRowsQueried: false, ddlExecuted: false,
    ...schemaDiagnostics(constraints, columns),
    availableProductChecks: available.slice(0, 20).map(constraint => ({
      name: /^[A-Za-z0-9_]{1,128}$/.test(String(constraint.name)) ? constraint.name : '[REDACTED]',
      enabled: Number(constraint.is_disabled) === 0, trusted: Number(constraint.is_not_trusted) === 0,
      statusLiterals: literals(constraint).slice(0, 20).map(value => /^[A-Z_]{1,40}$/.test(value) ? value : '[REDACTED]'),
    })),
  };
}

export function allowedStatuses(constraint) {
  invariant(Number(constraint?.is_disabled) === 0, 'PRODUCT_CHECK_DISABLED');
  invariant(Number(constraint?.is_not_trusted) === 0, 'PRODUCT_CHECK_UNTRUSTED');
  const values = literals(constraint);
  invariant(JSON.stringify(values) === JSON.stringify(legacyStatuses) || JSON.stringify(values) === JSON.stringify(deletionStatuses), 'PRODUCT_CHECK_STATUS_SET');
  return values;
}

export async function inspectSchema(db) {
  let constraint, column;
  try { constraint = await db.$queryRawUnsafe(checkQuery); column = await db.$queryRawUnsafe(columnQuery); }
  catch { throw failure('PRODUCT_METADATA_QUERY_FAILED'); }
  const diagnostics = schemaDiagnostics(constraint, column);
  try {
    invariant(constraint.length === 1, 'PRODUCT_CHECK_COUNT', diagnostics);
    const statuses = allowedStatuses(constraint[0]);
    invariant(column.length === 1, 'PRODUCT_STATUS_COLUMN_COUNT', diagnostics);
    invariant(column[0].typeName === 'nvarchar', 'PRODUCT_STATUS_COLUMN_TYPE', diagnostics);
    invariant(column[0].max_length === 80, 'PRODUCT_STATUS_COLUMN_MAX_LENGTH', diagnostics);
    invariant(Number(column[0].is_nullable) === 0, 'PRODUCT_STATUS_COLUMN_NULLABLE', diagnostics);
    let foreignKeys, otherChecks;
    try {
      foreignKeys = await db.$queryRawUnsafe('SELECT name,parent_object_id,referenced_object_id,is_disabled,is_not_trusted FROM sys.foreign_keys ORDER BY parent_object_id,name');
      otherChecks = await db.$queryRawUnsafe("SELECT name,parent_object_id,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE NOT(parent_object_id=OBJECT_ID(N'dbo.Product') AND name=N'Product_status_values') ORDER BY parent_object_id,name");
    } catch { throw failure('UNRELATED_METADATA_QUERY_FAILED', diagnostics); }
    return { statuses, columnHash: hash(column), foreignKeyHash: hash(foreignKeys), foreignKeyCount: foreignKeys.length, otherCheckHash: hash(otherChecks), otherCheckCount: otherChecks.length, diagnostics };
  } catch (error) { error.schemaDiagnostics ??= diagnostics; throw error; }
}

export async function applySchema(db, migration, database) {
  invariant(typeof migration === 'string' && migration.length > 0, 'MIGRATION_BYTES_MISSING');
  const before = await inspectSchema(db);
  // The migration itself validates the exact constraint expression and takes
  // an exclusive Product lock in a transaction while comparing row counts.
  try { await db.$executeRawUnsafe(migration); }
  catch { throw failure('MIGRATION_EXECUTION_FAILED', before.diagnostics); }
  const after = await inspectSchema(db);
  invariant(JSON.stringify(after.statuses) === JSON.stringify(deletionStatuses), 'PRODUCT_DELETION_STATUS_NOT_READY', after.diagnostics);
  const fields = { columnHash: 'PRODUCT_STATUS_COLUMN_CHANGED', foreignKeyHash: 'FOREIGN_KEYS_CHANGED', foreignKeyCount: 'FOREIGN_KEY_COUNT_CHANGED', otherCheckHash: 'UNRELATED_CHECKS_CHANGED', otherCheckCount: 'UNRELATED_CHECK_COUNT_CHANGED' };
  for (const [field, code] of Object.entries(fields)) invariant(after[field] === before[field], code, after.diagnostics);
  return { passed: true, databaseHash: hash(database), migrationSha256: hash(migration), additiveConstraint: true, applied: !before.statuses.includes('DELETED'), allowedStatuses: after.statuses, trustedConstraint: true, foreignKeysPreserved: true, unrelatedChecksPreserved: true, columnPreserved: true, applicationRowsModified: false, keepOnImageRollback: true };
}

export async function run(migration, expectedDatabase) {
  invariant(typeof expectedDatabase === 'string' && expectedDatabase.length > 0, 'CAPTURED_DATABASE_MISSING');
  invariant(process.env.AZURE_SQL_DATABASE === expectedDatabase, 'CAPTURED_DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const report = await applySchema(db, migration, expectedDatabase);
    console.log('HIDI_DELETE_SCHEMA::' + JSON.stringify(report));
  } finally { await db.$disconnect(); }
}

export async function diagnose(expectedDatabase) {
  invariant(typeof expectedDatabase === 'string' && expectedDatabase.length > 0, 'CAPTURED_DATABASE_MISSING');
  invariant(process.env.AZURE_SQL_DATABASE === expectedDatabase, 'CAPTURED_DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    console.log('HIDI_DELETE_SCHEMA_DIAGNOSTIC::' + JSON.stringify(await diagnoseSchema(db)));
  } finally { await db.$disconnect(); }
}
