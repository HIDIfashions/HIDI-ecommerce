// One-time, explicitly authorized publication using the retained production service.
import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const include = {images: {orderBy: {id: 'asc'}}, variants: {include: {images: {orderBy: {id: 'asc'}}, inventory: true}, orderBy: {id: 'asc'}}, collections: {orderBy: {collectionId: 'asc'}}};
function invariant(value, code) {if (!value) throw Object.assign(new Error(code), {code});}
const unchanged = product => {const {status, updatedAt, ...fields} = product; return hash(fields);};
const emit = (kind, value) => console.log('HIDI_DRAFT_' + kind + '::' + JSON.stringify(value));
async function connect(expectedDatabase) {
  invariant(expectedDatabase === 'hidi-sql' && process.env.AZURE_SQL_DATABASE === expectedDatabase, 'DATABASE_TARGET_CHANGED');
  const {PrismaService} = await import('file:///app/apps/api/dist/prisma/prisma.service.js');
  const db = new PrismaService(); await db.$connect();
  const identity = await db.$queryRawUnsafe('SELECT DB_NAME() AS databaseName');
  invariant(identity.length === 1 && identity[0].databaseName === expectedDatabase, 'DATABASE_TARGET_CHANGED');
  return db;
}
export async function inspect(expectedDatabase) {
  const db = await connect(expectedDatabase);
  try {
    const rows = await db.product.findMany({where: {status: 'DRAFT'}, include, orderBy: {id: 'asc'}, take: 5001});
    invariant(rows.length <= 5000, 'DRAFT_SNAPSHOT_TOO_LARGE');
    for (const row of rows) emit('ITEM', {id: row.id, name: row.name, slug: row.slug, status: row.status, updatedAt: row.updatedAt.toISOString(), fieldsHash: unchanged(row)});
    emit('REPORT', {passed: true, mode: 'inspect', draftCount: rows.length, readOnly: true, databaseHash: hash(expectedDatabase)});
  } finally {await db.$disconnect();}
}
export async function publish(expectedDatabase, payload) {
  invariant(payload?.authorization === 'Publish whatever is there in draft', 'PUBLICATION_AUTHORIZATION_MISSING');
  const items = payload.items;
  invariant(Array.isArray(items) && items.length <= 5000 && new Set(items.map(x => x.id)).size === items.length, 'INVALID_DRAFT_SNAPSHOT');
  const db = await connect(expectedDatabase);
  try {
    const {AdminProductsService} = await import('file:///app/apps/api/dist/admin/products/admin-products.service.js');
    const service = new AdminProductsService(db);
    invariant(typeof service.setStatus === 'function', 'RETAINED_PUBLICATION_SERVICE_MISSING');
    const counts = {published: 0, alreadyActive: 0, blocked: 0, changed: 0, failed: 0};
    for (const item of items) {
      let result = {id: item.id, name: item.name, slug: item.slug};
      const current = await db.product.findUnique({where: {id: item.id}, include});
      if (current?.status === 'ACTIVE') {counts.alreadyActive++; emit('RESULT', {...result, result: 'ALREADY_ACTIVE'}); continue;}
      if (!current || current.status !== 'DRAFT' || current.updatedAt.toISOString() !== item.updatedAt || unchanged(current) !== item.fieldsHash) {
        counts.changed++; emit('RESULT', {...result, result: 'CHANGED', reason: 'Product changed after the saved draft snapshot.'}); continue;
      }
      let error;
      try {await service.setStatus(item.id, {status: 'ACTIVE', expectedUpdatedAt: item.updatedAt});} catch (caught) {error = caught;}
      const after = await db.product.findUnique({where: {id: item.id}, include});
      if (after?.status === 'ACTIVE' && unchanged(after) === item.fieldsHash) {
        counts.published++; result = {...result, result: 'PUBLISHED', previousUpdatedAt: item.updatedAt, publishedUpdatedAt: after.updatedAt.toISOString(), otherFieldsPreserved: true};
      } else {
        const http = error?.getStatus?.();
        const reason = http === 400 || http === 409 ? String(error.message).slice(0, 300) : 'Publication failed; no confirmed successful change.';
        const key = http === 400 ? 'blocked' : http === 409 ? 'changed' : 'failed'; counts[key]++;
        result = {...result, result: key.toUpperCase(), reason, status: after?.status ?? null};
      }
      emit('RESULT', result);
    }
    const remainingDrafts = await db.product.count({where: {status: 'DRAFT'}});
    emit('REPORT', {passed: counts.failed === 0, mode: 'publish', capturedDrafts: items.length, ...counts, remainingDrafts, changedFields: ['status', 'updatedAt'], schemaChanged: false, databaseHash: hash(expectedDatabase)});
  } finally {await db.$disconnect();}
}
