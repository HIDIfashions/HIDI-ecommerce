// Disposable local SQL Server only. Never contacts MSG91 or production SQL.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PrismaMssql } from '../apps/api/node_modules/@prisma/adapter-mssql/dist/index.mjs';
import { PrismaClient } from '../apps/api/dist/generated/prisma/client.js';
import { Msg91WhatsAppService } from '../apps/api/dist/whatsapp/msg91.service.js';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url)), sql = require('mssql');
assert.equal(process.env.WHATSAPP_TEST_SQL_HOST, '127.0.0.1');
const config = { server: '127.0.0.1', port: 1433, user: 'sa', password: process.env.WHATSAPP_TEST_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }, pool: { max: 10 } };
let pool;
for (let i = 0; i < 30; i++) {
  try { pool = await new sql.ConnectionPool(config).connect(); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 2000)); }
}
assert(pool, 'Disposable SQL Server is required');
await pool.request().batch('CREATE DATABASE whatsapp_regression COLLATE Latin1_General_100_BIN2; ALTER DATABASE whatsapp_regression SET READ_COMMITTED_SNAPSHOT ON;');
await pool.close();
pool = await new sql.ConnectionPool({ ...config, database: 'whatsapp_regression' }).connect();
const root = new URL('../apps/api/prisma/migrations-sqlserver/', import.meta.url);
for (const name of (await readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()) {
  await pool.request().batch(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
}
const db = new PrismaClient({ adapter: new PrismaMssql({ ...config, database: 'whatsapp_regression' }, { schema: 'dbo' }) });
await db.$connect();
const sender = '919000000001', phone = '919000000002', token = 'fixture-token-'.repeat(4);
Object.assign(process.env, { WHATSAPP_CHATBOT_ENABLED: 'true', WHATSAPP_CHATBOT_PROVIDER: 'msg91',
  MSG91_WHATSAPP_INTEGRATED_NUMBER: sender, MSG91_WHATSAPP_AUTHKEY: 'fixture-key', MSG91_WHATSAPP_WEBHOOK_TOKEN: token,
  WHATSAPP_CHATBOT_START_AT: new Date(Date.now() - 60000).toISOString(), WEB_ORIGIN: 'https://shop.example' });
const worker = new Msg91WhatsAppService(db), replica = new Msg91WhatsAppService(db);
let sends = 0;
globalThis.fetch = async () => { sends++; return Response.json({ status: 'success', hasError: false, errors: null }); };
const payload = (text, id) => ({ direction: '0', eventName: 'delivered', integratedNumber: sender, customerNumber: phone, contentType: 'text',
  messages: JSON.stringify([{ from: phone, id: 'wamid.' + id, type: 'text', text: { body: text }, timestamp: String(Math.floor(Date.now() / 1000)) }]) });
async function processNext() {
  const row = await db.whatsAppMessage.findFirst({ where: { status: 'MSG91_PENDING' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  assert(row); await worker.processQueued(row.id, row.conversationId); return row;
}
try {
  await db.product.create({ data: { name: 'Fixture top', slug: 'wa-fixture', status: 'ACTIVE', variants: { create: {
    sku: 'WA-FIXTURE-M', size: 'M', color: 'Blue', mrpPaise: 100000, pricePaise: 100000, inventory: { create: { onHand: 10 } },
  } } } });
  // Seed the phone so duplicate-message testing does not conflate first-contact
  // upsert deadlock retries with duplicate webhook idempotency.
  await db.whatsAppConversation.create({ data: { phone: '+' + phone } });
  await Promise.all([worker.inbound(token, payload('SKU: WA-FIXTURE-M\nQuantity: 2', 'select')),
    replica.inbound(token, payload('SKU: WA-FIXTURE-M\nQuantity: 2', 'select'))]);
  assert.equal(await db.whatsAppMessage.count({ where: { direction: 'INBOUND' } }), 1);
  await processNext();
  await worker.inbound(token, payload('YES', 'yes'));
  const yes = await db.whatsAppMessage.findFirst({ where: { status: 'MSG91_PENDING' } });
  await Promise.all([worker.processQueued(yes.id, yes.conversationId), replica.processQueued(yes.id, yes.conversationId)]);
  assert.equal(await db.cart.count(), 1); assert.equal(await db.cartItem.count(), 1);
  assert.equal((await db.cartItem.findFirst()).quantity, 2);
  const reply = await db.whatsAppMessage.findUnique({ where: { providerMessageSid: yes.providerMessageSid + ':reply' } });
  assert.match(reply.body, /checkout\?waCart=/);
  await Promise.all([worker.sendQueued(reply.id), replica.sendQueued(reply.id)]);
  assert.equal(sends, 1); assert.equal((await db.whatsAppMessage.findUnique({ where: { id: reply.id } })).status, 'MSG91_ACCEPTED');
  // Force a real SQL failure after cart creation, then verify rollback and replay.
  await worker.inbound(token, payload('SKU: WA-FIXTURE-M', 'select-again')); await processNext();
  await worker.inbound(token, payload('YES', 'yes-rollback'));
  const pending = await db.whatsAppMessage.findFirst({ where: { status: 'MSG91_PENDING' } });
  await pool.request().batch("CREATE TRIGGER wa_fixture_fail ON dbo.CartItem AFTER INSERT AS BEGIN THROW 51000, 'fixture rollback', 1; END;");
  await assert.rejects(worker.processQueued(pending.id, pending.conversationId));
  assert.equal(await db.cart.count(), 1); assert.equal(await db.cartItem.count(), 1);
  assert.equal((await db.whatsAppMessage.findUnique({ where: { id: pending.id } })).status, 'MSG91_PENDING');
  await pool.request().batch('DROP TRIGGER dbo.wa_fixture_fail;');
  await replica.processQueued(pending.id, pending.conversationId);
  assert.equal(await db.cart.count(), 2); assert.equal(await db.cartItem.count(), 2);
  assert.equal(await db.order.count(), 0); assert.equal(await db.payment.count(), 0);
  console.log('PASS: real SQL callback deduplication, replica conversation locking, single send claim, atomic checkout rollback/recovery; no orders/payments created');
} finally { await db.$disconnect(); await pool.close(); }
