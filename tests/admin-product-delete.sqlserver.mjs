// Destructive regression is confined to a fresh loopback CI database. No Azure or storage writes.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { PrismaMssql } from '../apps/api/node_modules/@prisma/adapter-mssql/dist/index.mjs';
import { PrismaClient } from '../apps/api/dist/generated/prisma/client.js';
import { AdminProductsService } from '../apps/api/dist/admin/products/admin-products.service.js';
import { AdminInventoryService } from '../apps/api/dist/admin/admin-inventory.service.js';
import { verifyExistingSchema } from '../deploy/admin-delete/schema-readiness.mjs';

assert.equal(process.env.ADMIN_DELETE_TEST_SQL_HOST, '127.0.0.1', 'Deletion SQL regression accepts loopback only');
assert.ok(process.env.ADMIN_DELETE_TEST_SQL_PASSWORD, 'Disposable SQL Server password is required');
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const sql = require('mssql');
const config = { server: '127.0.0.1', port: 1433, user: 'sa', password: process.env.ADMIN_DELETE_TEST_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }, pool: { max: 10 }, connectionTimeout: 3000, requestTimeout: 30000 };
const database = 'admin_delete_regression_' + randomUUID().replaceAll('-', '').slice(0, 12);
let pool;
for (let attempt = 0; attempt < 30; attempt++) {
  try { pool = await new sql.ConnectionPool(config).connect(); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
}
assert(pool, 'Disposable loopback SQL Server did not become ready');
await pool.request().batch(`CREATE DATABASE [${database}] COLLATE Latin1_General_100_BIN2; ALTER DATABASE [${database}] SET READ_COMMITTED_SNAPSHOT ON;`);
await pool.close();
let db;
try {
  pool = await new sql.ConnectionPool({ ...config, database }).connect();
  const root = new URL('../apps/api/prisma/migrations-sqlserver/', import.meta.url);
  const migrations = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const folder of migrations) {
    let migration;
    try { migration = await readFile(new URL(folder + '/migration.sql', root), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await pool.request().batch(migration);
  }
  await pool.request().batch(await readFile(new URL('../deploy/product-skn/migration.sql', import.meta.url), 'utf8'));
  async function checkState() {
    return (await pool.request().query("SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Product') ORDER BY name")).recordset;
  }
  const constraints = await checkState();
  const statusCheck = constraints.find(row => row.name === 'Product_status_values');
  assert.equal(statusCheck.definition.includes('DELETED'), false); assert.equal(statusCheck.is_disabled, false); assert.equal(statusCheck.is_not_trusted, false);
  console.log('PASS: original trusted three-value product status CHECK remains unchanged; deletion requires no new schema or DDL');
  const foreignKeysBefore = (await pool.request().query('SELECT COUNT(*) AS n FROM sys.foreign_keys')).recordset[0].n;
  await pool.close();
  db = new PrismaClient({ adapter: new PrismaMssql({ ...config, database }, { schema: 'dbo' }) });
  await db.$connect();
  const readiness = await verifyExistingSchema(db, database);
  assert.equal(readiness.passed, true); assert.equal(readiness.schemaChanged, false);
  assert.equal(readiness.ddlExecuted, false); assert.equal(readiness.existingProductSchema, true);
  assert.deepEqual(await db.$queryRaw`SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Product') ORDER BY name`, constraints);
  console.log('PASS: actual Prisma read-only readiness verifies the original CHECK, column types and DML permissions without schema changes');
  const service = new AdminProductsService(db), photos = new AdminInventoryService(db);
  const product = await db.product.create({ data: { name: 'Disposable Olive Kurta', slug: 'ci-deletion-product', status: 'ACTIVE' } });
  const other = await db.product.create({ data: { name: 'Shared Photo Product', slug: 'ci-other-product', status: 'ARCHIVED' } });
  assert.equal((await service.get(other.id)).status, 'ARCHIVED');
  const variant = await db.productVariant.create({ data: { productId: product.id, sku: 'DELETE-CI-M', size: 'M', color: 'Olive', pricePaise: 249900, mrpPaise: 249900, inventory: { create: { onHand: 9, reserved: 0 } } } });
  const otherVariant = await db.productVariant.create({ data: { productId: other.id, sku: 'OTHER-CI-M', size: 'M', color: 'Olive', pricePaise: 249900, mrpPaise: 249900, inventory: { create: { onHand: 3 } } } });
  const ownedImage = await db.productImage.create({ data: { productId: product.id, url: 'https://media.example.test/products/owned.jpg', alt: 'Owned product image' } });
  const sharedImage = await db.productVariantImage.create({ data: { variantId: variant.id, url: 'https://media.example.test/products/shared.jpg', storagePath: 'azure://product-media/products/shared.jpg', alt: 'Shared colour image' } });
  const foreignImage = await db.productImage.create({ data: { productId: other.id, url: '/media/products/%73hared.jpg', alt: 'Shared via escaped local URL' } });
  const foreignVariantImage = await db.productVariantImage.create({ data: { variantId: otherVariant.id, url: 'https://other-cdn.example.test/products/shared.jpg', storagePath: 'azure://account/product-media/products/shared.jpg', alt: 'Shared through alternate Azure path' } });
  const inventory = await db.inventory.findUnique({ where: { variantId: variant.id } });
  await db.inventoryMovement.create({ data: { inventoryId: inventory.id, type: 'RECEIPT', delta: 10, onHandBefore: 0, onHandAfter: 10, reason: 'RECEIPT', reference: 'CI-RECEIPT', actor: 'CI' } });
  const receipt = await db.stockReceipt.create({ data: { receiptNumber: 'CI-DELETION-RECEIPT', supplierName: 'CI Supplier', receivedAt: new Date(), status: 'POSTED', totalAccepted: 10, lines: { create: { variantId: variant.id, acceptedQuantity: 10, unitCostPaise: 100000 } } } });
  const order = await db.order.create({ data: { orderNumber: 'CI-PAID-ORDER', status: 'CONFIRMED', subtotalPaise: 249900, totalPaise: 249900, customerPhone: '9000000000', shippingAddress: '{}',
    items: { create: { productId: product.id, variantId: variant.id, productName: product.name, sku: variant.sku, size: variant.size, color: variant.color, quantity: 1, unitPricePaise: 249900, totalPaise: 249900 } },
    payments: { create: { provider: 'FIXTURE', status: 'CAPTURED', amountPaise: 249900, providerPaymentId: 'CI-PAID-FIXTURE' } },
    reservations: { create: { variantId: variant.id, quantity: 1, status: 'CONSUMED', expiresAt: new Date(), consumedAt: new Date() } },
  }, include: { items: true } });
  await db.productReview.create({ data: { productId: product.id, orderId: order.id, orderItemId: order.items[0].id, rating: 5, body: 'Historical verified order review', reviewerName: 'CI' } });
  const cart = await db.cart.create({ data: { sessionId: randomUUID(), items: { create: [
    { productId: product.id, variantId: variant.id, quantity: 1, unitPricePaise: 249900 },
    { productId: other.id, variantId: otherVariant.id, quantity: 1, unitPricePaise: 249900 },
  ] } } });
  async function snapshot() {
    return {
      product: await db.product.findUnique({ where: { id: product.id } }),
      variants: await db.productVariant.findMany({ where: { productId: product.id }, orderBy: { id: 'asc' } }),
      images: await db.productImage.findMany({ where: { productId: product.id }, orderBy: { id: 'asc' } }),
      variantImages: await db.productVariantImage.findMany({ where: { variantId: variant.id }, orderBy: { id: 'asc' } }),
      uploadTickets: await db.adminMediaUploadTicket.findMany({ where: { variantId: variant.id }, orderBy: { id: 'asc' } }),
      cart: await db.cartItem.findMany({ where: { cartId: cart.id }, orderBy: { id: 'asc' } }),
      stock: await db.inventory.findUnique({ where: { id: inventory.id }, include: { movements: { orderBy: { id: 'asc' } } } }),
      receipt: await db.stockReceipt.findUnique({ where: { id: receipt.id }, include: { lines: { orderBy: { id: 'asc' } } } }),
      order: await db.order.findUnique({ where: { id: order.id }, include: { items: true, payments: true, reservations: true, reviews: true } }),
    };
  }
  const before = await snapshot();
  const confirmation = { expectedUpdatedAt: product.updatedAt.toISOString(), confirmName: product.name };
  await assert.rejects(() => service.beginDeletion(product.id, { ...confirmation, confirmName: 'Wrong Product' }), { name: 'BadRequestException' });
  await assert.rejects(() => service.beginDeletion(product.id, { ...confirmation, expectedUpdatedAt: '2026-01-01T00:00:00.000Z' }), { name: 'ConflictException' });
  assert.deepEqual(await snapshot(), before);
  await db.inventory.update({ where: { id: inventory.id }, data: { reserved: 1 } });
  const reservedBefore = await snapshot();
  await assert.rejects(() => service.beginDeletion(product.id, confirmation), { name: 'ConflictException' });
  assert.deepEqual(await snapshot(), reservedBefore);
  await db.inventory.update({ where: { id: inventory.id }, data: { reserved: 0 } });
  await db.inventoryReservation.update({ where: { orderId_variantId: { orderId: order.id, variantId: variant.id } }, data: { status: 'ACTIVE' } });
  const activeBefore = await snapshot();
  await assert.rejects(() => service.beginDeletion(product.id, confirmation), { name: 'ConflictException' });
  assert.deepEqual(await snapshot(), activeBefore);
  await db.inventoryReservation.update({ where: { orderId_variantId: { orderId: order.id, variantId: variant.id } }, data: { status: 'CONSUMED' } });
  const ticket = await db.adminMediaUploadTicket.create({ data: { variantId: variant.id, tokenHash: 'ci-only-upload-authorization', mimeType: 'image/jpeg', maxBytes: 1024, expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
  const uploadingBefore = await snapshot();
  await assert.rejects(() => service.beginDeletion(product.id, confirmation), /photo upload recently started/);
  assert.deepEqual(await snapshot(), uploadingBefore);
  await db.adminMediaUploadTicket.update({ where: { id: ticket.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
  const preservedBefore = await snapshot();
  console.log('PASS: real SQL stale version, wrong name, reserved pieces, active checkout and recent photo authorization reject without changing data');

  const deletes = await Promise.all([service.beginDeletion(product.id, confirmation), service.beginDeletion(product.id, confirmation)]);
  assert.equal(deletes.filter(result => result.repeated === false).length, 1);
  assert.equal(deletes.filter(result => result.repeated === true).length, 1);
  const deleted = deletes.find(result => result.repeated === false);
  assert.equal(deleted.status, 'DELETED'); assert.equal(deleted.media.length, 2);
  assert.equal(deleted.media.find(image => image.id === ownedImage.id).shared, false);
  assert.equal(deleted.media.find(image => image.id === sharedImage.id).shared, true);
  const after = await snapshot();
  assert.equal(after.product.status, 'ARCHIVED'); assert.equal(after.product.slug, 'hidi-internal-deleted-' + Buffer.from(product.id, 'utf8').toString('hex')); assert.equal(after.variants[0].active, false);
  assert.equal(after.cart.length, 1); assert.equal(after.cart[0].productId, other.id);
  for (const key of ['stock', 'receipt', 'order', 'images', 'variantImages']) assert.deepEqual(after[key], preservedBefore[key]);
  assert.deepEqual(await db.productImage.findUnique({ where: { id: foreignImage.id } }), foreignImage);
  assert.deepEqual(await db.productVariantImage.findUnique({ where: { id: foreignVariantImage.id } }), foreignVariantImage);
  console.log('PASS: concurrent idempotent SQL deletion preserves paid order snapshots, receipts, inventory movements and shared media aliases');

  await db.$disconnect(); await db.$connect();
  const restarted = new AdminProductsService(db);
  assert.equal((await restarted.getDeletion(product.id)).pendingMediaCount, 2);
  const retry = await restarted.beginDeletion(product.id, confirmation);
  assert.equal(retry.repeated, true); assert.deepEqual(retry.media, deleted.media);
  await assert.rejects(() => restarted.get(product.id), { name: 'NotFoundException' });
  const catalogue = await restarted.list(undefined, 'ALL'); assert.ok(catalogue.items.every(item => item.id !== product.id)); assert.equal(catalogue.total, 1);
  await assert.rejects(() => restarted.setStatus(product.id, { status: 'ACTIVE', expectedUpdatedAt: deleted.updatedAt.toISOString() }), { name: 'ConflictException' });
  await assert.rejects(() => photos.addVariantImage(variant.id, { url: 'https://media.example.test/products/new.jpg' }), { name: 'ConflictException' });
  await assert.rejects(() => photos.removeVariantImage(variant.id, sharedImage.id), { name: 'ConflictException' });
  await assert.rejects(() => photos.addVariantImage(otherVariant.id, { url: 'https://different-origin.example.test/products/owned.jpg' }), { name: 'ConflictException' });
  console.log('PASS: durable SQL photo queue survives reconnection; tombstones cannot be read, relisted, republished or bypassed by image endpoints');

  await assert.rejects(() => restarted.finishDeletionCleanup(product.id, { productImageIds: [foreignImage.id] }), { name: 'BadRequestException' });
  await assert.rejects(() => restarted.finishDeletionCleanup(product.id, { variantImageIds: [foreignVariantImage.id] }), { name: 'BadRequestException' });
  assert.equal((await restarted.getDeletion(product.id)).pendingMediaCount, 2);
  const partial = await restarted.finishDeletionCleanup(product.id, { productImageIds: [ownedImage.id] });
  assert.equal(partial.pendingMediaCount, 1); assert.equal(partial.complete, false);
  const replay = await restarted.finishDeletionCleanup(product.id, { productImageIds: [ownedImage.id] });
  assert.equal(replay.removedMetadataCount, 0); assert.equal(replay.pendingMediaCount, 1);
  const complete = await restarted.finishDeletionCleanup(product.id, { variantImageIds: [sharedImage.id] });
  assert.equal(complete.complete, true); assert.equal((await restarted.getDeletion(product.id)).pendingMediaCount, 0);
  const finished = await snapshot();
  for (const key of ['stock', 'receipt', 'order']) assert.deepEqual(finished[key], preservedBefore[key]);
  assert.deepEqual(await db.productImage.findUnique({ where: { id: foreignImage.id } }), foreignImage);
  assert.deepEqual(await db.productVariantImage.findUnique({ where: { id: foreignVariantImage.id } }), foreignVariantImage);
  assert.equal((await db.$queryRaw`SELECT COUNT(*) AS n FROM sys.foreign_keys`)[0].n, foreignKeysBefore);
  assert.deepEqual(await db.$queryRaw`SELECT name,definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Product') ORDER BY name`, constraints);
  const replacement = await db.product.create({ data: { name: 'Replacement Draft', slug: product.slug, status: 'DRAFT' } });
  assert.equal(replacement.slug, product.slug); assert.notEqual(replacement.id, product.id);
  console.log('PASS: SQL cleanup ownership, partial failure retry and completion retain every historical FK and the other product\'s photo references');
} finally {
  await db?.$disconnect(); await pool?.close().catch(() => {});
  const cleanup = await new sql.ConnectionPool(config).connect();
  try { await cleanup.request().batch(`ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}];`); }
  finally { await cleanup.close(); }
}
