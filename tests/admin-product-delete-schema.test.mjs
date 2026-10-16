import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { verifyExistingSchema, diagnoseSchema, schemaDiagnostics } from '../deploy/admin-delete/schema-readiness.mjs';

const legacy = "([status]='ARCHIVED' OR [status]='ACTIVE' OR [status]='DRAFT')";
const permissionKeys = ['productRead','productUpdate','variantRead','variantUpdate','cartItemDelete','inventoryRead','reservationRead','uploadTicketRead','productImageRead','productImageDelete','variantImageRead','variantImageDelete'];
function fixture(options = {}) {
  const calls = [];
  const constraints = options.missing ? [] : [{ name: 'Product_status_values', definition: options.hiddenDefinition ? null : options.definition ?? legacy, is_disabled: options.disabled ? 1 : 0, is_not_trusted: options.untrusted ? 1 : 0 }];
  const columns = [{ name: 'status', typeName: options.columnType || 'nvarchar', max_length: options.maxLength ?? 80, is_nullable: options.nullable ? 1 : 0 }, { name: 'slug', typeName: options.slugType || 'nvarchar', max_length: options.slugMaxLength ?? 382, is_nullable: options.slugNullable ? 1 : 0 }].filter(column => column.name !== options.missingColumn);
  const db = {
    async $queryRawUnsafe(sql) {
      calls.push(sql);
      if (options.queryFailure) throw new Error('private connection detail must not be exported');
      if (sql.includes('sys.columns')) return columns;
      if (sql.startsWith('SELECT HAS_PERMS_BY_NAME')) return [Object.fromEntries(permissionKeys.map(key => [key, options.deniedPermission === key ? 0 : 1]))];
      if (sql.includes('sys.check_constraints')) return constraints;
      throw new Error('Unexpected metadata query');
    },
    async $executeRawUnsafe() { throw new Error('Readiness must never execute DDL'); },
  };
  return { db, calls };
}

test('the unchanged ARCHIVED/slug schema and existing DML grants are verified with metadata SELECTs only', async () => {
  const f = fixture(); const result = await verifyExistingSchema(f.db, 'fixture-db');
  assert.equal(result.passed, true); assert.equal(result.existingProductSchema, true); assert.equal(result.readOnly, true);
  assert.equal(result.databaseHash, createHash('sha256').update('fixture-db').digest('hex'));
  assert.equal(result.applicationRowsModified, false); assert.equal(result.applicationRowsQueried, false); assert.equal(result.ddlExecuted, false);
  assert.ok(f.calls.every(call => call.startsWith('SELECT ') && !call.includes('FROM [dbo].'))); assert.equal(f.calls.length, 3);
});

test('a CHECK definition hidden by existing DML-only permissions does not require privilege expansion', async () => {
  const f = fixture({ hiddenDefinition: true }); const result = await verifyExistingSchema(f.db, 'fixture-db');
  assert.equal(result.passed, true); assert.equal(result.constraintDefinitionVisible, false); assert.deepEqual(result.statusLiterals, []);
});

test('missing disabled untrusted CHECK or a visible expression that excludes ARCHIVED fails safely', async () => {
  for (const [options, code] of [[{ missing: true }, 'PRODUCT_CHECK_COUNT'], [{ disabled: true }, 'PRODUCT_CHECK_DISABLED'], [{ untrusted: true }, 'PRODUCT_CHECK_UNTRUSTED'], [{ definition: "[status]='ACTIVE'" }, 'PRODUCT_ARCHIVED_STATUS_MISSING']]) {
    const f = fixture(options); await assert.rejects(() => verifyExistingSchema(f.db, 'fixture-db'), { code });
    assert.equal(f.calls.length, 3);
  }
});

test('both durable tombstone columns must match the retained required types sizes and nullability', async () => {
  for (const [options, code] of [
    [{ missingColumn: 'status' }, 'PRODUCT_STATUS_COLUMN_COUNT'], [{ columnType: 'varchar' }, 'PRODUCT_STATUS_COLUMN_TYPE'],
    [{ maxLength: 40 }, 'PRODUCT_STATUS_COLUMN_MAX_LENGTH'], [{ nullable: true }, 'PRODUCT_STATUS_COLUMN_NULLABLE'],
    [{ missingColumn: 'slug' }, 'PRODUCT_SLUG_COLUMN_COUNT'], [{ slugType: 'varchar' }, 'PRODUCT_SLUG_COLUMN_TYPE'],
    [{ slugMaxLength: 191 }, 'PRODUCT_SLUG_COLUMN_MAX_LENGTH'], [{ slugNullable: true }, 'PRODUCT_SLUG_COLUMN_NULLABLE'],
  ]) {
    const f = fixture(options); await assert.rejects(() => verifyExistingSchema(f.db, 'private-database-name'), error => {
      assert.equal(error.code, code); assert.ok(error.schemaDiagnostics);
      assert.equal(JSON.stringify(error.schemaDiagnostics).includes('private-database-name'), false); return true;
    });
  }
});

test('each required read/update/delete capability is checked without touching an application row', async () => {
  for (const key of permissionKeys) {
    const f = fixture({ deniedPermission: key }); await assert.rejects(() => verifyExistingSchema(f.db, 'fixture-db'), error => error.code.startsWith('PRODUCT_DML_'));
  }
  const f = fixture({ queryFailure: true }); await assert.rejects(() => verifyExistingSchema(f.db, 'fixture-db'), { code: 'PRODUCT_METADATA_QUERY_FAILED' });
});

test('read-only diagnosis reports schema differences and hidden definitions without asserting them', async () => {
  const f = fixture({ missing: true, columnType: 'varchar', maxLength: 40, nullable: true, deniedPermission: 'productUpdate' });
  const result = await diagnoseSchema(f.db);
  assert.equal(result.readOnly, true); assert.equal(result.applicationRowsQueried, false); assert.equal(result.ddlExecuted, false);
  assert.equal(result.constraintPresent, false); assert.equal(result.columnType, 'varchar'); assert.equal(result.columnMaxLength, 40);
  assert.equal(result.columnNullable, true); assert.equal(result.dmlCapabilities.productUpdate, false);
  assert.equal(f.calls.length, 4); assert.ok(f.calls.every(sql => sql.startsWith('SELECT ')));
});

test('diagnostic metadata excludes full SQL and redacts unexpected literal contents', () => {
  const privateText = 'person@example.invalid';
  const result = schemaDiagnostics([{ definition: `[status] IN ('ACTIVE','${privateText}')`, is_disabled: 1, is_not_trusted: 1 }], [{ name: 'status', typeName: 'nvarchar', max_length: 80, is_nullable: 0 }]);
  assert.equal(result.constraintEnabled, false); assert.equal(result.constraintTrusted, false);
  assert.deepEqual(result.statusLiterals, ['ACTIVE', '[REDACTED]']);
  assert.equal(JSON.stringify(result).includes(privateText), false); assert.equal(JSON.stringify(result).includes('IN ('), false);
});
