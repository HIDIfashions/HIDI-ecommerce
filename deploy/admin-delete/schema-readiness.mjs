// Runs inside the retained API identity. Only system metadata and effective
// DML permissions are read; no app worker, DDL or application-row query starts.
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const checkQuery = "SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Product') AND name=N'Product_status_values'";
const columnQuery = "SELECT name,TYPE_NAME(user_type_id) AS typeName,max_length,is_nullable FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Product') AND name IN (N'status',N'slug') ORDER BY name";
const requiredPermissions = {
  productRead: ['Product', 'SELECT'], productUpdate: ['Product', 'UPDATE'],
  variantRead: ['ProductVariant', 'SELECT'], variantUpdate: ['ProductVariant', 'UPDATE'],
  cartItemDelete: ['CartItem', 'DELETE'], inventoryRead: ['Inventory', 'SELECT'],
  reservationRead: ['InventoryReservation', 'SELECT'], uploadTicketRead: ['AdminMediaUploadTicket', 'SELECT'],
  productImageRead: ['ProductImage', 'SELECT'], productImageDelete: ['ProductImage', 'DELETE'],
  variantImageRead: ['ProductVariantImage', 'SELECT'], variantImageDelete: ['ProductVariantImage', 'DELETE'],
};
const permissionQuery = 'SELECT ' + Object.entries(requiredPermissions).map(([key, [table, permission]]) => `HAS_PERMS_BY_NAME(N'dbo.${table}',N'OBJECT',N'${permission}') AS [${key}]`).join(',');
const failure = (code, diagnostics) => Object.assign(new Error(code), { code, ...(diagnostics ? { schemaDiagnostics: diagnostics } : {}) });
function invariant(condition, code, diagnostics) { if (!condition) throw failure(code, diagnostics); }
const literals = constraint => [...String(constraint?.definition || '').matchAll(/'((?:''|[^'])*)'/g)].map(match => match[1]).sort();
const safeLiterals = constraint => literals(constraint).slice(0, 20).map(value => /^[A-Z_]{1,40}$/.test(value) ? value : '[REDACTED]');

export function schemaDiagnostics(constraints, columns) {
  const constraint = constraints.length === 1 ? constraints[0] : null;
  const result = {
    constraintCount: constraints.length, constraintPresent: constraints.length === 1,
    constraintEnabled: constraint ? Number(constraint.is_disabled) === 0 : null,
    constraintTrusted: constraint ? Number(constraint.is_not_trusted) === 0 : null,
    constraintDefinitionVisible: typeof constraint?.definition === 'string',
    statusLiterals: constraint ? safeLiterals(constraint) : [],
  };
  for (const [name, prefix] of [['status', 'column'], ['slug', 'slugColumn']]) {
    const matched = columns.filter(column => column.name === name);
    const column = matched.length === 1 ? matched[0] : null;
    Object.assign(result, {
      [prefix + 'Count']: matched.length, [prefix + 'Present']: matched.length === 1,
      [prefix + 'Type']: column && /^[a-z0-9_]{1,40}$/.test(String(column.typeName)) ? column.typeName : null,
      [prefix + 'MaxLength']: column && Number.isFinite(Number(column.max_length)) ? Number(column.max_length) : null,
      [prefix + 'Nullable']: column ? Number(column.is_nullable) === 1 : null,
    });
  }
  return result;
}

async function readMetadata(db) {
  try {
    const constraints = await db.$queryRawUnsafe(checkQuery);
    const columns = await db.$queryRawUnsafe(columnQuery);
    const permissions = await db.$queryRawUnsafe(permissionQuery);
    return { constraints, columns, permissions, diagnostics: schemaDiagnostics(constraints, columns) };
  } catch { throw failure('PRODUCT_METADATA_QUERY_FAILED'); }
}

export async function diagnoseSchema(db) {
  const metadata = await readMetadata(db);
  let available;
  try { available = await db.$queryRawUnsafe("SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Product') ORDER BY name"); }
  catch { throw failure('PRODUCT_METADATA_QUERY_FAILED'); }
  return {
    readOnly: true, applicationRowsQueried: false, applicationRowsModified: false, ddlExecuted: false, schemaChanged: false,
    ...metadata.diagnostics,
    dmlCapabilities: Object.fromEntries(Object.keys(requiredPermissions).map(key => [key, Number(metadata.permissions[0]?.[key]) === 1])),
    availableProductChecks: available.slice(0, 20).map(constraint => ({
      name: /^[A-Za-z0-9_]{1,128}$/.test(String(constraint.name)) ? constraint.name : '[REDACTED]',
      enabled: Number(constraint.is_disabled) === 0, trusted: Number(constraint.is_not_trusted) === 0,
      definitionVisible: typeof constraint.definition === 'string', statusLiterals: safeLiterals(constraint),
    })),
  };
}

export async function verifyExistingSchema(db, database) {
  const { constraints, columns, permissions, diagnostics } = await readMetadata(db);
  invariant(constraints.length === 1, 'PRODUCT_CHECK_COUNT', diagnostics);
  invariant(Number(constraints[0].is_disabled) === 0, 'PRODUCT_CHECK_DISABLED', diagnostics);
  invariant(Number(constraints[0].is_not_trusted) === 0, 'PRODUCT_CHECK_UNTRUSTED', diagnostics);
  // Runtime DML grants do not expose the expression. ARCHIVED is the existing
  // app/schema contract, and the deletion implementation writes no new status.
  if (typeof constraints[0].definition === 'string') invariant(literals(constraints[0]).includes('ARCHIVED'), 'PRODUCT_ARCHIVED_STATUS_MISSING', diagnostics);
  for (const [name, bytes] of [['status', 80], ['slug', 382]]) {
    const matched = columns.filter(column => column.name === name);
    const code = 'PRODUCT_' + name.toUpperCase() + '_COLUMN_';
    invariant(matched.length === 1, code + 'COUNT', diagnostics);
    invariant(matched[0].typeName === 'nvarchar', code + 'TYPE', diagnostics);
    invariant(Number(matched[0].max_length) === bytes, code + 'MAX_LENGTH', diagnostics);
    invariant(Number(matched[0].is_nullable) === 0, code + 'NULLABLE', diagnostics);
  }
  invariant(permissions.length === 1, 'PRODUCT_DML_CAPABILITY_COUNT', diagnostics);
  const dmlCapabilities = {};
  for (const key of Object.keys(requiredPermissions)) {
    invariant(Number(permissions[0][key]) === 1, 'PRODUCT_DML_' + key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(), diagnostics);
    dmlCapabilities[key] = true;
  }
  return {
    passed: true, readOnly: true, existingProductSchema: true, databaseHash: hash(database),
    trustedConstraint: true, productColumnsVerified: true, dmlCapabilitiesVerified: true, dmlCapabilities,
    applicationRowsQueried: false, applicationRowsModified: false, ddlExecuted: false, schemaChanged: false,
    ...diagnostics,
  };
}

async function withRuntimeDatabase(expectedDatabase, method, marker) {
  invariant(typeof expectedDatabase === 'string' && expectedDatabase.length > 0, 'CAPTURED_DATABASE_MISSING');
  invariant(process.env.AZURE_SQL_DATABASE === expectedDatabase, 'CAPTURED_DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    console.log(marker + '::' + JSON.stringify(await method(db, expectedDatabase)));
  } finally { await db.$disconnect(); }
}
export async function run(expectedDatabase) { return withRuntimeDatabase(expectedDatabase, verifyExistingSchema, 'HIDI_DELETE_SCHEMA'); }
export async function diagnose(expectedDatabase) { return withRuntimeDatabase(expectedDatabase, diagnoseSchema, 'HIDI_DELETE_SCHEMA_DIAGNOSTIC'); }
