// Create only missing launch taxonomy references; existing rows are immutable here.
import { createHash } from 'node:crypto';
export const CATEGORIES = [
  { slug: 'casual-wear', name: 'Casual Wear' },
  { slug: 'work-wear', name: 'Work Wear' },
  { slug: 'occasional-wear', name: 'Occasional Wear' },
];
export const COLLECTIONS = [
  { slug: 'everyday', name: 'Everyday' },
  { slug: 'work-edit', name: 'Workwear Edit' },
  { slug: 'occasion', name: 'Occasion' },
  { slug: 'ananyas-pick', name: 'Ananya’s Pick' },
];
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = code => Object.assign(new Error(code), { code });
function invariant(condition, code) { if (!condition) throw failure(code); }
const selected = { id: true, slug: true, name: true, active: true, updatedAt: true };

export async function ensureTaxonomy(db, expectedDatabase) {
  invariant(typeof expectedDatabase === 'string' && expectedDatabase.length > 0, 'CAPTURED_DATABASE_MISSING');
  const identity = await db.$queryRawUnsafe('SELECT DB_NAME() AS databaseName');
  invariant(identity.length === 1 && identity[0].databaseName === expectedDatabase, 'DATABASE_TARGET_CHANGED');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await db.$transaction(async tx => {
        const existing = [];
        for (const [kind, definitions] of [['category', CATEGORIES], ['collection', COLLECTIONS]]) {
          for (const definition of definitions) {
            const row = await tx[kind].findUnique({ where: { slug: definition.slug }, select: selected });
            if (row) invariant(row.active === true, 'EXISTING_TAXONOMY_INACTIVE');
            existing.push({ kind, definition, row });
          }
        }
        const counts = { categories: 0, collections: 0 };
        for (const item of existing) {
          if (item.row) continue;
          const row = await tx[item.kind].upsert({
            where: { slug: item.definition.slug }, update: {},
            create: { name: item.definition.name, slug: item.definition.slug, active: true },
            select: selected,
          });
          invariant(row && typeof row.id === 'string' && row.id.length > 0
            && row.slug.toLowerCase() === item.definition.slug && row.active === true, 'TAXONOMY_CREATE_INCOMPLETE');
          counts[item.kind === 'category' ? 'categories' : 'collections']++;
        }
        for (const [kind, definitions] of [['category', CATEGORIES], ['collection', COLLECTIONS]]) {
          for (const definition of definitions) {
            const row = await tx[kind].findUnique({ where: { slug: definition.slug }, select: selected });
            invariant(row && row.active === true && row.slug.toLowerCase() === definition.slug, 'TAXONOMY_NOT_READY');
          }
        }
        return counts;
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
      return {
        passed: true, mode: 'ensure', databaseHash: hash(expectedDatabase), taxonomyReady: true,
        categoriesReady: true, collectionsReady: true, categoriesChecked: CATEGORIES.length,
        collectionsChecked: COLLECTIONS.length, categoriesCreated: created.categories,
        collectionsCreated: created.collections, rowsCreated: created.categories + created.collections,
        existingRowsModified: false, productAssignmentsModified: false, productsModified: false,
        stockModified: false, mediaModified: false, heroModified: false, configurationModified: false,
        ddlExecuted: false, schemaChanged: false, applicationRowsReturned: false,
      };
    } catch (error) {
      if (error?.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
  throw failure('TAXONOMY_TRANSACTION_INCOMPLETE');
}

export async function ensure(expectedDatabase) {
  invariant(process.env.AZURE_SQL_DATABASE === expectedDatabase, 'CAPTURED_DATABASE_CHANGED');
  const { PrismaService } = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    console.log('HIDI_SKN_SCHEMA::' + JSON.stringify(await ensureTaxonomy(db, expectedDatabase)));
  } finally { await db.$disconnect(); }
}
