// Loaded inside the captured API revision. Only the reviewed additive CHECK
// migration is executed; no application module, worker or customer flow starts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const legacyStatuses = ['ACTIVE', 'ARCHIVED', 'DRAFT'];
const deletionStatuses = [...legacyStatuses, 'DELETED'].sort();

export function allowedStatuses(constraint) {
  assert.equal(Number(constraint?.is_disabled), 0, 'Product status CHECK must be enabled');
  assert.equal(Number(constraint?.is_not_trusted), 0, 'Product status CHECK must be trusted');
  const values = [...String(constraint?.definition || '').matchAll(/'((?:''|[^'])*)'/g)].map(match => match[1]).sort();
  assert.ok(JSON.stringify(values) === JSON.stringify(legacyStatuses) || JSON.stringify(values) === JSON.stringify(deletionStatuses), 'Unexpected Product status values');
  return values;
}

export async function inspectSchema(db) {
  const constraint = await db.$queryRawUnsafe("SELECT name, definition, is_disabled, is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Product') AND name=N'Product_status_values'");
  assert.equal(constraint.length, 1, 'Expected named Product status CHECK');
  const statuses = allowedStatuses(constraint[0]);
  const column = await db.$queryRawUnsafe("SELECT TYPE_NAME(user_type_id) AS typeName,max_length,is_nullable FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Product') AND name=N'status'");
  assert.equal(column.length, 1); assert.equal(column[0].typeName, 'nvarchar'); assert.equal(column[0].max_length, 80); assert.equal(Number(column[0].is_nullable), 0);
  const foreignKeys = await db.$queryRawUnsafe('SELECT name,parent_object_id,referenced_object_id,is_disabled,is_not_trusted FROM sys.foreign_keys ORDER BY parent_object_id,name');
  const otherChecks = await db.$queryRawUnsafe("SELECT name,parent_object_id,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE NOT(parent_object_id=OBJECT_ID(N'dbo.Product') AND name=N'Product_status_values') ORDER BY parent_object_id,name");
  return { statuses, columnHash: hash(column), foreignKeyHash: hash(foreignKeys), foreignKeyCount: foreignKeys.length, otherCheckHash: hash(otherChecks), otherCheckCount: otherChecks.length };
}

export async function applySchema(db, migration, database) {
  assert.equal(typeof migration, 'string'); assert.ok(migration.length > 0);
  const before = await inspectSchema(db);
  // The migration itself validates the exact constraint expression and takes
  // an exclusive Product lock in a transaction while comparing row counts.
  await db.$executeRawUnsafe(migration);
  const after = await inspectSchema(db);
  assert.deepEqual(after.statuses, deletionStatuses, 'Deletion schema not ready');
  for (const field of ['columnHash', 'foreignKeyHash', 'foreignKeyCount', 'otherCheckHash', 'otherCheckCount']) assert.deepEqual(after[field], before[field], 'Unrelated schema metadata changed: ' + field);
  return { passed: true, databaseHash: hash(database), migrationSha256: hash(migration), additiveConstraint: true, applied: !before.statuses.includes('DELETED'), allowedStatuses: after.statuses, trustedConstraint: true, foreignKeysPreserved: true, unrelatedChecksPreserved: true, columnPreserved: true, applicationRowsModified: false, keepOnImageRollback: true };
}

export async function run(migration, expectedDatabase) {
  assert.ok(expectedDatabase); assert.equal(process.env.AZURE_SQL_DATABASE, expectedDatabase, 'Captured database changed');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const report = await applySchema(db, migration, expectedDatabase);
    console.log('HIDI_DELETE_SCHEMA::' + JSON.stringify(report));
  } finally { await db.$disconnect(); }
}
