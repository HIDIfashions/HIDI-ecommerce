import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { allowedStatuses, applySchema } from '../deploy/admin-delete/schema-readiness.mjs';

const migration = 'reviewed additive Product CHECK';
const legacy = "([status]='ARCHIVED' OR [status]='ACTIVE' OR [status]='DRAFT')";
const ready = "([status]='DELETED' OR [status]='ARCHIVED' OR [status]='ACTIVE' OR [status]='DRAFT')";
function fixture(options = {}) {
  let applied = false;
  const calls = [];
  const db = {
    async $queryRawUnsafe(sql) {
      calls.push(sql);
      if (sql.startsWith('SELECT name, definition')) return options.missing ? [] : [{ name: 'Product_status_values', definition: applied || options.alreadyReady ? ready : legacy, is_disabled: options.disabled ? 1 : 0, is_not_trusted: options.untrusted ? 1 : 0 }];
      if (sql.includes('sys.columns')) return [{ typeName: 'nvarchar', max_length: applied && options.changeColumn ? 160 : 80, is_nullable: 0 }];
      if (sql.includes('sys.foreign_keys')) return [{ name: applied && options.changeForeignKey ? 'changed' : 'retained-order-product-fk', parent_object_id: 1, referenced_object_id: 2, is_disabled: 0, is_not_trusted: 0 }];
      if (sql.includes('sys.check_constraints')) return [{ name: 'retained-inventory-type', parent_object_id: 3, definition: "[type]='RECEIPT'", is_disabled: 0, is_not_trusted: 0 }];
      throw new Error('Unexpected metadata query');
    },
    async $executeRawUnsafe(sql) { assert.equal(sql, migration); calls.push('MIGRATION'); if (options.failure) throw new Error('DDL rejected'); applied = true; },
  };
  return { db, calls };
}

test('status metadata requires exactly the legacy or deletion set and a trusted enabled CHECK', () => {
  assert.deepEqual(allowedStatuses({ definition: legacy, is_disabled: 0, is_not_trusted: 0 }), ['ACTIVE', 'ARCHIVED', 'DRAFT']);
  for (const data of [{ definition: legacy, is_disabled: 1, is_not_trusted: 0 }, { definition: legacy, is_disabled: 0, is_not_trusted: 1 }, { definition: "[status] IN ('ACTIVE','ARCHIVED','DRAFT','OTHER')", is_disabled: 0, is_not_trusted: 0 }, { definition: "[status] IN ('ACTIVE','DRAFT','DRAFT')", is_disabled: 0, is_not_trusted: 0 }]) assert.throws(() => allowedStatuses(data));
});

test('the additive migration reports exact bytes and preserves other constraints and foreign keys', async () => {
  const f = fixture(); const result = await applySchema(f.db, migration, 'fixture-db');
  assert.equal(result.passed, true); assert.equal(result.applied, true); assert.equal(result.keepOnImageRollback, true);
  assert.equal(result.migrationSha256, createHash('sha256').update(migration).digest('hex'));
  assert.equal(result.applicationRowsModified, false); assert.equal(f.calls.filter(call => call === 'MIGRATION').length, 1);
});

test('an already widened CHECK verifies idempotently without claiming another change', async () => {
  const f = fixture({ alreadyReady: true }); const result = await applySchema(f.db, migration, 'fixture-db');
  assert.equal(result.passed, true); assert.equal(result.applied, false);
});

test('missing disabled and untrusted original constraints fail before executing the migration', async () => {
  for (const options of [{ missing: true }, { disabled: true }, { untrusted: true }]) {
    const f = fixture(options); await assert.rejects(() => applySchema(f.db, migration, 'fixture-db'));
    assert.equal(f.calls.includes('MIGRATION'), false);
  }
});

test('DDL rejection or unrelated metadata changes cannot produce schema readiness', async () => {
  for (const options of [{ failure: true }, { changeForeignKey: true }, { changeColumn: true }]) {
    const f = fixture(options); await assert.rejects(() => applySchema(f.db, migration, 'fixture-db'));
  }
});
