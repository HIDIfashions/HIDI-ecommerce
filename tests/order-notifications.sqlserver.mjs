// Runs only against the disposable CI SQL Server. Never accepts an Azure host.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { OrderNotificationStore } from '../apps/api/dist/order-notifications/order-notification.store.js';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const sql = require('mssql');
assert.equal(process.env.NOTIFICATION_TEST_SQL_HOST, '127.0.0.1');
const config = { server: '127.0.0.1', user: 'sa', password: process.env.NOTIFICATION_TEST_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }, requestTimeout: 30000, pool: { max: 10 } };
let pool;
for (let attempt = 0; attempt < 30; attempt++) {
  try { pool = await new sql.ConnectionPool(config).connect(); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 2000)); }
}
assert(pool, 'Disposable SQL Server did not become ready');
try {
  await pool.request().batch("CREATE DATABASE notification_regression COLLATE Latin1_General_100_BIN2; ALTER DATABASE notification_regression SET READ_COMMITTED_SNAPSHOT ON;");
} finally { await pool.close(); }
pool = await new sql.ConnectionPool({ ...config, database: 'notification_regression' }).connect();
function adapter(connection) {
  const query = async (parts, values) => {
    let text = parts[0]; const request = new sql.Request(connection);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      request.input('p' + i, v instanceof Date ? sql.DateTime2 : typeof v === 'number' ? sql.Int : sql.NVarChar(sql.MAX), v);
      text += '@p' + i + parts[i + 1];
    }
    return request.query(text);
  };
  return { $executeRaw: async (parts, ...values) => (await query(parts, values)).rowsAffected.reduce((a,b) => a+b, 0),
    $queryRaw: async (parts, ...values) => (await query(parts, values)).recordset,
    $transaction: async (callback, options) => {
      const tx = new sql.Transaction(pool); await tx.begin(options.isolationLevel === "ReadCommitted" ? sql.ISOLATION_LEVEL.READ_COMMITTED : sql.ISOLATION_LEVEL.SERIALIZABLE);
      try { const result = await callback(adapter(tx)); await tx.commit(); return result; }
      catch (error) { await tx.rollback().catch(() => {}); throw error; }
    } };
}
const store = new OrderNotificationStore(adapter(pool));
try {
  await pool.request().batch(await readFile(new URL('../apps/api/prisma/migrations-sqlserver/20260927153000_azure_sql_baseline/migration.sql', import.meta.url), 'utf8'));
  const before = (await pool.request().query('SELECT COUNT(*) AS n FROM sys.tables')).recordset[0].n;
  await pool.request().batch(await readFile(new URL('../apps/api/prisma/migrations-sqlserver/20261010090000_order_notifications/migration.sql', import.meta.url), 'utf8'));
  assert.equal((await pool.request().query('SELECT COUNT(*) AS n FROM sys.tables')).recordset[0].n, before + 1);
  const fixtures = [
    ['paid', 'CONFIRMED', 'CAPTURED', 'RAZORPAY', '2026-10-10T09:00:01'],
    ['wallet', 'CONFIRMED', 'CAPTURED', 'WALLET', '2026-10-10T09:00:02'],
    ['failed', 'PENDING_PAYMENT', 'FAILED', 'RAZORPAY', '2026-10-10T09:00:03'],
    ['review', 'PAYMENT_REVIEW', 'CAPTURED', 'RAZORPAY', '2026-10-10T09:00:03'],
    ['unpaid', 'CONFIRMED', 'CREATED', 'RAZORPAY', '2026-10-10T09:00:03'],
    ['old', 'CONFIRMED', 'CAPTURED', 'RAZORPAY', '2026-10-09T09:00:00'],
  ];
  for (const [id, status, paymentStatus, provider, createdAt] of fixtures) {
    await pool.request().input('id', sql.NVarChar(64), id).input('status', sql.NVarChar(40), status)
      .input('paymentStatus', sql.NVarChar(40), paymentStatus).input('provider', sql.NVarChar(40), provider)
      .input('createdAt', sql.DateTime2, new Date(createdAt + 'Z')).batch(`
        INSERT dbo.[Order] (id,orderNumber,status,currency,subtotalPaise,totalPaise,customerPhone,shippingAddress,updatedAt)
        VALUES (@id,@id,@status,'INR',100,100,'919876543210','{}',SYSUTCDATETIME());
        INSERT dbo.Payment (id,orderId,provider,status,amountPaise,updatedAt)
        VALUES (@id,@id,@provider,@paymentStatus,100,SYSUTCDATETIME());
        INSERT dbo.OrderAuditEvent (id,orderId,eventType,actorType,toStatus,createdAt)
        VALUES (@id,@id,'ORDER_CONFIRMED','SYSTEM','CONFIRMED',@createdAt);`);
  }
  const start = new Date('2026-10-10T09:00:00Z');
  await Promise.allSettled(Array.from({ length: 5 }, () => store.enqueue('EMAIL', start)));
  await store.enqueue('EMAIL', start); await store.enqueue('EMAIL', start);
  const queued = (await pool.request().query('SELECT orderId,COUNT(*) AS n FROM dbo.OrderNotificationOutbox GROUP BY orderId ORDER BY orderId')).recordset;
  assert.deepEqual(queued, [{ orderId: 'paid', n: 1 }, { orderId: 'wallet', n: 1 }]);
  console.log('PASS: real SQL deduplicates concurrent discovery and excludes failed, unpaid, review and historical orders');
  const jobs = (await Promise.all(Array.from({ length: 8 }, (_, i) => store.claim('worker-' + i)))).filter(Boolean);
  assert.equal(jobs.length, 2); assert.equal(new Set(jobs.map(j => j.id)).size, 2);
  assert.equal(await store.beginSend({ ...jobs[0], leaseOwner: 'wrong-owner' }, 'RESEND', '{}'), false);
  assert.equal(await store.beginSend(jobs[0], 'RESEND', '{}'), true);
  await store.finish(jobs[0], 'SENT', null, 'provider-id');
  await store.finish(jobs[1], 'WAITING_CONFIG', 'PROVIDER_NOT_CONFIGURED', null, 300);
  assert.equal(await store.claim('another-worker'), null);
  console.log('PASS: Azure-style snapshot isolation, exclusive claims, fencing and durable send status');
  await pool.request().query("UPDATE dbo.OrderNotificationOutbox SET status='SENDING',provider='MSG91',leaseUntil=DATEADD(MINUTE,-3,SYSUTCDATETIME()),firstAttemptAt=SYSUTCDATETIME() WHERE orderId='wallet'");
  await store.recover();
  assert.equal((await pool.request().query("SELECT status FROM dbo.OrderNotificationOutbox WHERE orderId='wallet'")).recordset[0].status, 'UNKNOWN');
  await pool.request().query("UPDATE dbo.OrderNotificationOutbox SET status='SENDING',provider='RESEND',leaseUntil=DATEADD(MINUTE,-3,SYSUTCDATETIME()),firstAttemptAt=SYSUTCDATETIME() WHERE orderId='wallet'");
  await store.recover();
  assert.equal((await pool.request().query("SELECT status FROM dbo.OrderNotificationOutbox WHERE orderId='wallet'")).recordset[0].status, 'RETRY');
  await pool.request().query("UPDATE dbo.OrderNotificationOutbox SET status='SENDING',provider='RESEND',leaseUntil=DATEADD(MINUTE,-3,SYSUTCDATETIME()),firstAttemptAt=DATEADD(HOUR,-24,SYSUTCDATETIME()) WHERE orderId='wallet'");
  await store.recover();
  assert.equal((await pool.request().query("SELECT status FROM dbo.OrderNotificationOutbox WHERE orderId='wallet'")).recordset[0].status, 'UNKNOWN');
  assert.deepEqual((await pool.request().query('SELECT id,status FROM dbo.[Order] ORDER BY id')).recordset,
    fixtures.map(([id,status]) => ({id,status})).sort((a,b) => a.id.localeCompare(b.id)));
  console.log('PASS: crash recovery respects provider deduplication limits; original order/payment data remain unchanged');
  await pool.request().batch(`
    INSERT dbo.[User] (id,updatedAt) VALUES ('opted-in-user',SYSUTCDATETIME());
    INSERT dbo.RetentionProfile (id,authSubject,userId,whatsappOptIn,updatedAt)
      VALUES ('consent','consent-subject','opted-in-user',1,SYSUTCDATETIME());
    UPDATE dbo.[Order] SET userId='opted-in-user' WHERE id='paid';`);
  await store.enqueue('WHATSAPP',start);
  assert.deepEqual((await pool.request().query("SELECT orderId FROM dbo.OrderNotificationOutbox WHERE channel='WHATSAPP'")).recordset,[{orderId:'paid'}]);
  console.log('PASS: WhatsApp queues only existing opted-in customers; email remains independent');
} finally { await pool.close(); }
