import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CATEGORIES, COLLECTIONS, ensureTaxonomy } from '../deploy/product-skn/taxonomy.mjs';

function fixture(options = {}) {
  let state = { category: structuredClone(options.categories || []), collection: structuredClone(options.collections || []), products: [{ id: 'p', categoryId: 'untouched', collections: ['untouched'], stock: 4 }] };
  const calls = []; let next = 1;
  const db = {
    $queryRawUnsafe: async sql => { calls.push({ kind: 'query', sql }); return [{ databaseName: options.database || 'fixture_database' }]; },
    $transaction: async (fn, settings) => {
      calls.push({ kind: 'transaction', settings }); const previous = structuredClone(state);
      const tx = {};
      for (const kind of ['category', 'collection']) tx[kind] = {
        findUnique: async ({ where }) => state[kind].find(row => row.slug === where.slug) || null,
        upsert: async args => {
          calls.push({ kind, args }); assert.deepEqual(args.update, {}); assert.equal(args.create.id, undefined, 'Retained Prisma generates the cuid');
          if (options.failAfter !== undefined && calls.filter(call => ['category', 'collection'].includes(call.kind)).length > options.failAfter) throw new Error('Simulated write failure');
          let row = state[kind].find(item => item.slug === args.where.slug);
          if (!row) { row = { id: 'cuid_' + next++, updatedAt: new Date('2026-10-11T00:00:00Z'), ...args.create }; state[kind].push(row); }
          return structuredClone(row);
        },
      };
      try { return await fn(tx); } catch (error) { state = previous; throw error; }
    },
  };
  return { db, calls, state: () => structuredClone(state) };
}
const existing = definitions => definitions.map((row, index) => ({ ...row, name: 'Existing name ' + index, id: 'existing_' + index, active: true, updatedAt: new Date(0) }));

test('missing taxonomy creates exactly three categories and four collections and returns only bounded evidence', async () => {
  const f = fixture(); const product = f.state().products;
  const report = await ensureTaxonomy(f.db, 'fixture_database');
  assert.equal(report.taxonomyReady, true); assert.equal(report.rowsCreated, 7);
  assert.equal(report.categoriesCreated, 3); assert.equal(report.collectionsCreated, 4);
  assert.equal(report.databaseHash, createHash('sha256').update('fixture_database').digest('hex'));
  assert.deepEqual(f.state().products, product);
  assert.deepEqual(f.state().category.map(row => row.slug), CATEGORIES.map(row => row.slug));
  assert.deepEqual(f.state().collection.map(row => row.slug), COLLECTIONS.map(row => row.slug));
  assert.equal(f.calls.find(call => call.kind === 'transaction').settings.isolationLevel, 'Serializable');
  assert.ok(!JSON.stringify(report).includes('fixture_database') && !JSON.stringify(report).includes('cuid_'));
  for (const key of ['existingRowsModified', 'productsModified', 'productAssignmentsModified', 'stockModified', 'mediaModified', 'heroModified', 'configurationModified', 'ddlExecuted', 'schemaChanged']) assert.equal(report[key], false);
});

test('repeated ensure is idempotent and existing names, timestamps and identities remain unchanged', async () => {
  const f = fixture({ categories: existing(CATEGORIES), collections: existing(COLLECTIONS) }); const before = f.state();
  const first = await ensureTaxonomy(f.db, 'fixture_database'); const second = await ensureTaxonomy(f.db, 'fixture_database');
  assert.equal(first.rowsCreated, 0); assert.equal(second.rowsCreated, 0); assert.deepEqual(f.state(), before);
  assert.equal(f.calls.filter(call => ['category', 'collection'].includes(call.kind)).length, 0);
  const missing = fixture(); await ensureTaxonomy(missing.db, 'fixture_database'); const created = missing.state();
  assert.equal((await ensureTaxonomy(missing.db, 'fixture_database')).rowsCreated, 0); assert.deepEqual(missing.state(), created);
});

test('partial taxonomy creates only missing references and retains unrelated rows', async () => {
  const categories = [...existing(CATEGORIES.slice(0, 1)), { id: 'unrelated', slug: 'legacy-kurta', name: 'Legacy', active: false, updatedAt: new Date(0) }];
  const collections = existing(COLLECTIONS.slice(0, 3)); const f = fixture({ categories, collections });
  const report = await ensureTaxonomy(f.db, 'fixture_database');
  assert.equal(report.categoriesCreated, 2); assert.equal(report.collectionsCreated, 1);
  assert.deepEqual(f.state().category.slice(0, 2), categories); assert.deepEqual(f.state().collection.slice(0, 3), collections);
});

test('inactive existing launch reference fails without reactivation, rename or partial creates', async () => {
  for (const kind of ['categories', 'collections']) {
    const rows = existing(kind === 'categories' ? CATEGORIES.slice(1, 2) : COLLECTIONS.slice(3)); rows[0].active = false;
    const f = fixture({ [kind]: rows }); const before = f.state();
    await assert.rejects(() => ensureTaxonomy(f.db, 'fixture_database'), { code: 'EXISTING_TAXONOMY_INACTIVE' });
    assert.deepEqual(f.state(), before); assert.equal(f.calls.filter(call => ['category', 'collection'].includes(call.kind)).length, 0);
  }
});

test('write failure rolls all newly created references back and preserves product assignments', async () => {
  const f = fixture({ failAfter: 4 }); const before = f.state();
  await assert.rejects(() => ensureTaxonomy(f.db, 'fixture_database'), /Simulated write failure/);
  assert.deepEqual(f.state(), before);
});

test('different database fails before any taxonomy transaction or write', async () => {
  const f = fixture({ database: 'other_database' });
  await assert.rejects(() => ensureTaxonomy(f.db, 'fixture_database'), { code: 'DATABASE_TARGET_CHANGED' });
  assert.equal(f.calls.length, 1);
});
