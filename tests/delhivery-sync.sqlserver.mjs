// Disposable local SQL Server only. No production credentials or courier calls.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PrismaMssql } from '../apps/api/node_modules/@prisma/adapter-mssql/dist/index.mjs';
import { PrismaClient } from '../apps/api/dist/generated/prisma/client.js';
import { DelhiverySyncService } from '../apps/api/dist/delhivery/delhivery-sync.service.js';
import { AdminService } from '../apps/api/dist/admin/admin.service.js';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url)), sql = require('mssql');
assert.equal(process.env.TRACKING_TEST_SQL_HOST, '127.0.0.1');
const config = { server: '127.0.0.1', port: 1433, user: 'sa', password: process.env.TRACKING_TEST_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }, pool: { max: 10 } };
let pool;
for (let i = 0; i < 30; i++) {
  try { pool = await new sql.ConnectionPool(config).connect(); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 2000)); }
}
assert(pool, 'Disposable SQL Server is required');
await pool.request().batch('CREATE DATABASE tracking_regression COLLATE Latin1_General_100_BIN2; ALTER DATABASE tracking_regression SET READ_COMMITTED_SNAPSHOT ON;');
await pool.close();
pool = await new sql.ConnectionPool({ ...config, database: 'tracking_regression' }).connect();
const migrationRoot = new URL('../apps/api/prisma/migrations-sqlserver/', import.meta.url);
for (const name of (await readdir(migrationRoot, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()) {
  await pool.request().batch(await readFile(new URL(`${name}/migration.sql`, migrationRoot), 'utf8'));
}
await pool.close();
const db = new PrismaClient({ adapter: new PrismaMssql({ ...config, database: 'tracking_regression' }, { schema: 'dbo' }) });
await db.$connect();
process.env.DELHIVERY_SYNC_ENABLED = 'true';
let calls = 0, mismatch = false;
const deliveredAt = new Date(Date.now() - 3600000);
const carrier = { trackingConfigured: () => true, track: async awb => {
  calls++;
  return { raw: { ShipmentData: [{ Shipment: { AWB: awb, OrderType: 'COD', CODAmount: mismatch ? 1 : 1878,
    ReverseInTransit: false, Status: { Status: 'Delivered', StatusType: 'DL', StatusDateTime: deliveredAt.toISOString() } } }] } };
} };
const worker = new DelhiverySyncService(db, carrier), replica = new DelhiverySyncService(db, carrier);
const admin = new AdminService(db, carrier), actor = { id: 'test-admin', role: 'OWNER' };
try {
  const order = await db.order.create({ data: { orderNumber: 'HIDI-SYNC-TEST', status: 'SHIPPED', subtotalPaise: 187800,
    totalPaise: 187800, customerPhone: '9000000000', shippingAddress: '{}', createdAt: new Date(Date.now() - 86400000),
    payments: { create: { provider: 'COD', amountPaise: 187800, status: 'CREATED' } },
    shipments: { create: { provider: 'Delhivery', awb: 'TEST-123', status: 'SHIPPED', shippedAt: new Date(Date.now() - 7200000) } },
  }, include: { shipments: true, payments: true } });
  const shipment = order.shipments[0], payment = order.payments[0];
  assert.equal((await worker.candidates()).length, 1);
  const claims = await Promise.all([worker.claim(shipment.id), replica.claim(shipment.id), worker.claim(shipment.id)]);
  assert.equal(claims.filter(Boolean).length, 1, 'only one replica claims the initial row');
  assert.equal((await replica.candidates()).length, 0, 'restart/replica sees persisted next-check time');
  const lease = await db.backgroundLease.findUnique({ where: { id: `tracking:${shipment.id}` } });
  assert(Math.abs(lease.expiresAt.getTime() - Date.now() - 6 * 3600000) < 10000, 'durable interval is six hours');
  await db.backgroundLease.update({ where: { id: lease.id }, data: { expiresAt: new Date(0) } });
  mismatch = true;
  await Promise.all([worker.runOnce(), replica.runOnce()]);
  assert.equal(calls, 1);
  assert.equal((await db.order.findUnique({ where: { id: order.id } })).status, 'DELIVERED');
  assert.equal((await db.payment.findUnique({ where: { id: payment.id } })).status, 'CREATED');
  assert.equal((await db.shipment.findUnique({ where: { id: shipment.id } })).deliveredAt.toISOString(), deliveredAt.toISOString());
  assert.equal(await db.orderAuditEvent.count({ where: { orderId: order.id, eventType: 'ORDER_DELIVERED' } }), 1);
  assert.equal(await db.orderAuditEvent.count({ where: { orderId: order.id, eventType: 'COD_COLLECTION_REVIEW_REQUIRED' } }), 1);
  await db.backgroundLease.update({ where: { id: lease.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await worker.candidates()).length, 1, 'delivered but unpaid remains eligible');
  await worker.runOnce(); // Repeated mismatch must not duplicate the audit event or fail its transaction.
  assert.equal(await db.orderAuditEvent.count({ where: { orderId: order.id, eventType: 'COD_COLLECTION_REVIEW_REQUIRED' } }), 1);
  await db.backgroundLease.update({ where: { id: lease.id }, data: { expiresAt: new Date(0) } });
  mismatch = false;
  await Promise.all([worker.runOnce(), admin.confirmCodCollection(order.orderNumber, 187800, actor)]);
  assert.equal((await db.payment.findUnique({ where: { id: payment.id } })).status, 'CAPTURED');
  assert.equal(await db.orderAuditEvent.count({ where: { orderId: order.id, eventType: 'PAYMENT_CAPTURED' } }), 1);
  assert.equal((await worker.candidates()).length, 0, 'resolved orders stop polling');
  console.log('PASS: real SQL six-hour schedule, multi-replica claims, restart safety, independent delivery/COD, audit deduplication and manual/automatic race');
} finally { await db.$disconnect(); }
