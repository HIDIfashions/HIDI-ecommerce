import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { deliveryEvidence, rupeesToPaise } from "../apps/api/src/delhivery/tracking-evidence.js";
import { DelhiveryService } from "../apps/api/src/delhivery/delhivery.service.js";
import { DelhiverySyncService, TRACKING_INTERVAL_HOURS, COD_AMOUNT_TOLERANCE_PAISE } from "../apps/api/src/delhivery/delhivery-sync.service.js";
import { AdminService } from "../apps/api/src/admin/admin.service.js";
import { AdminController } from "../apps/api/src/admin/admin.controller.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; });
const now = new Date("2026-10-25T12:00:00Z");
const candidate = { id: "shipment-1", orderId: "order-1", awb: "123456789012" };
function payload(changes: Record<string, any> = {}) {
  return { ShipmentData: [{ Shipment: { AWB: candidate.awb, OrderType: "COD", CODAmount: "1878.00", ReverseInTransit: false,
    Status: { Status: "Delivered", StatusType: "DL", StatusDateTime: "2026-10-24T12:45:00" }, ...changes } }] };
}
const evidence = deliveryEvidence(payload(), candidate.awb, now)!;
const actor: any = { id: "admin-1", displayName: "Test admin", role: "OWNER" };

function fixture(options: { status?: string; paymentStatus?: string; provider?: string; failPayment?: boolean; raw?: any } = {}) {
  process.env.DELHIVERY_SYNC_ENABLED = "true";
  let order: any = { id: candidate.orderId, orderNumber: "HIDI-TEST", status: options.status ?? "SHIPPED", currency: "INR",
    createdAt: new Date("2026-10-20T00:00:00Z"),
    shipments: [{ ...candidate, provider: options.provider ?? "DELHIVERY", status: options.status ?? "SHIPPED",
      createdAt: new Date("2026-10-21T00:00:00Z"), shippedAt: new Date("2026-10-21T00:00:00Z"), deliveredAt: null,
      trackingUrl: "https://example.test/tracking" }],
    payments: [{ id: "payment-1", provider: "COD", status: options.paymentStatus ?? "CREATED", amountPaise: 187800 }] };
  const events: any[] = [];
  let available = true, calls = 0, tail = Promise.resolve();
  const db: any = {
    $queryRaw: async () => [candidate],
    order: { findUnique: async () => structuredClone(order), update: async ({ data }: any) => Object.assign(order, data) },
    shipment: { update: async ({ data }: any) => Object.assign(order.shipments[0], data) },
    payment: { updateMany: async ({ where, data }: any) => {
      if (options.failPayment) throw new Error("Simulated payment database failure");
      const rows = order.payments.filter((p: any) => p.id === where.id && p.status === where.status);
      rows.forEach((p: any) => Object.assign(p, data)); return { count: rows.length };
    } },
    orderAuditEvent: { create: async ({ data }: any) => { events.push(data); return data; },
      findUnique: async ({ where }: any) => events.find(e => e.eventKey === where.eventKey) ?? null },
  };
  db.$transaction = async (fn: any) => {
    const prior = tail; let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await prior;
    const snapshot = structuredClone(order), eventCount = events.length;
    try { return await fn(db); }
    catch (error) { order = snapshot; events.length = eventCount; throw error; }
    finally { release(); }
  };
  const carrier: any = { trackingConfigured: () => true, track: async () => { calls++; return { raw: options.raw ?? payload() }; } };
  const service = new DelhiverySyncService(db, carrier);
  service.claim = async () => { if (!available) return false; available = false; return true; };
  return { service, db, carrier, events, get order() { return order; }, get calls() { return calls; }, due: () => { available = true; } };
}

test("six-hour interval and strict rupee amount conversion", () => {
  assert.equal(TRACKING_INTERVAL_HOURS, 6);
  assert.equal(rupeesToPaise("1878.50"), 187850);
  assert.equal(rupeesToPaise(1878), 187800);
  for (const value of [null, undefined, "", -1, "1878.001", "1e3", {}, true, "9".repeat(20)]) assert.equal(rupeesToPaise(value), null);
});

test("matches AWB and interprets courier local delivery time as IST", () => {
  assert.equal(evidence.deliveredAt.toISOString(), "2026-10-24T07:15:00.000Z");
  assert.equal(evidence.codAmountPaise, 187800);
  assert.equal(deliveryEvidence(payload({ AWB: "other" }), candidate.awb, now), null);
  const duplicate = payload(); duplicate.ShipmentData.push(duplicate.ShipmentData[0]);
  assert.equal(deliveryEvidence(duplicate, candidate.awb, now), null);
});

test("never treats RTO, DTO, undelivered, reverse, malformed or future scans as customer delivery", () => {
  for (const status of ["RTO", "DTO", "Dispatched", "Out for Delivery", "Undelivered"]) {
    assert.equal(deliveryEvidence(payload({ Status: { ...payload().ShipmentData[0].Shipment.Status, Status: status } }), candidate.awb, now), null);
  }
  for (const type of ["RTO", "RT", "DTO", "UD", undefined]) {
    assert.equal(deliveryEvidence(payload({ Status: { ...payload().ShipmentData[0].Shipment.Status, StatusType: type } }), candidate.awb, now), null);
  }
  assert.equal(deliveryEvidence(payload({ ReverseInTransit: true }), candidate.awb, now), null);
  for (const date of [null, "nonsense", "2027-01-01T12:00:00Z"]) {
    assert.equal(deliveryEvidence(payload({ Status: { ...payload().ShipmentData[0].Shipment.Status, StatusDateTime: date } }), candidate.awb, now), null);
  }
});

test("production token required and tracking does not need warehouse manifest configuration", async () => {
  const carrier = new DelhiveryService();
  process.env.DELHIVERY_API_TOKEN = "test-not-live";
  process.env.DELHIVERY_BASE_URL = "https://staging-express.delhivery.com";
  assert.equal(carrier.trackingConfigured(), false);
  process.env.DELHIVERY_BASE_URL = "https://track.delhivery.com";
  delete process.env.DELHIVERY_CLIENT_NAME; delete process.env.DELHIVERY_PICKUP_LOCATION;
  assert.equal(carrier.trackingConfigured(), true);
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /waybill=123456789012/);
    assert(options?.signal); return Response.json(payload());
  };
  assert.deepEqual((await carrier.track(candidate.awb)).raw, payload());
  delete process.env.DELHIVERY_API_TOKEN;
  assert.equal(carrier.trackingConfigured(), false);
});

test("delivery commits without capturing COD; reconciliation subsequently captures it once", async () => {
  const f = fixture();
  assert.deepEqual(await f.service.applyDelivery(candidate, evidence), { eligible: true, changed: true });
  assert.equal(f.order.status, "DELIVERED");
  assert.equal(f.order.payments[0].status, "CREATED");
  assert.equal(f.order.shipments[0].deliveredAt.toISOString(), evidence.deliveredAt.toISOString());
  const results = await Promise.all([f.service.reconcileCod(candidate, evidence), f.service.reconcileCod(candidate, evidence)]);
  assert.deepEqual(results, ["collected", "skipped"]);
  assert.equal(f.order.payments[0].status, "CAPTURED");
  assert.equal(f.events.filter(e => e.eventType === "PAYMENT_CAPTURED").length, 1);
  assert.equal(JSON.parse(f.events.at(-1).metadata).bankRemittanceConfirmed, false);
});

test("concurrent/repeated delivery updates create a single audit event", async () => {
  const f = fixture();
  await Promise.all([f.service.applyDelivery(candidate, evidence), f.service.applyDelivery(candidate, evidence)]);
  assert.equal(f.events.length, 1);
});

test("COD differences above one rupee or invalid evidence leave payment pending", async () => {
  for (const changes of [null, 187699, 187901, 0, -1, 187800.5, NaN, Infinity].map(codAmountPaise => ({ codAmountPaise })).concat([{ orderType: "Pre-paid" } as any])) {
    const f = fixture();
    await f.service.applyDelivery(candidate, evidence);
    assert.equal(await f.service.reconcileCod(candidate, { ...evidence, ...changes }), "review");
    assert.equal(f.order.status, "DELIVERED");
    assert.equal(f.order.payments[0].status, "CREATED");
    assert.equal(f.events.at(-1).eventType, "COD_COLLECTION_REVIEW_REQUIRED");
  }
});

test("COD accepts up to one rupee either way and audits actual collection without changing the payment amount", async () => {
  assert.equal(COD_AMOUNT_TOLERANCE_PAISE, 100);
  for (const differencePaise of [-100, -65, 0, 65, 100]) {
    const f = fixture({ status: "DELIVERED" });
    const reportedAmountPaise = 187800 + differencePaise;
    const results = await Promise.all([f.service.reconcileCod(candidate, { ...evidence, codAmountPaise: reportedAmountPaise }), f.service.reconcileCod(candidate, { ...evidence, codAmountPaise: reportedAmountPaise })]);
    assert.deepEqual(results, ["collected", "skipped"]);
    assert.equal(f.order.payments[0].amountPaise, 187800);
    const events = f.events.filter(e => e.eventType === "PAYMENT_CAPTURED");
    assert.equal(events.length, 1);
    const metadata = JSON.parse(events[0].metadata);
    assert.equal(metadata.expectedAmountPaise, 187800);
    assert.equal(metadata.reportedAmountPaise, reportedAmountPaise);
    assert.equal(metadata.differencePaise, differencePaise);
    assert.equal(metadata.tolerancePaise, 100);
    assert.equal(metadata.bankRemittanceConfirmed, false);
  }
});

test("COD reconciliation failure cannot roll back delivery", async () => {
  const f = fixture({ failPayment: true });
  await f.service.applyDelivery(candidate, evidence);
  await assert.rejects(f.service.reconcileCod(candidate, evidence));
  assert.equal(f.order.status, "DELIVERED");
  assert.equal(f.order.payments[0].status, "CREATED");
});

test("cancelled, returned, replaced AWB, other courier and old scan cannot update orders", async () => {
  for (const status of ["CANCELLED", "RETURNED", "RETURN_REQUESTED", "REFUNDED", "PACKED"]) {
    const f = fixture({ status });
    assert.equal((await f.service.applyDelivery(candidate, evidence)).eligible, false);
    assert.equal(await f.service.reconcileCod(candidate, evidence), "skipped");
  }
  for (const modify of [
    (f: ReturnType<typeof fixture>) => { f.order.shipments[0].awb = "changed"; },
    (f: ReturnType<typeof fixture>) => { f.order.shipments[0].provider = "DTDC"; },
    (f: ReturnType<typeof fixture>) => { f.order.shipments[0].id = "replacement"; },
    (f: ReturnType<typeof fixture>) => { f.order.shipments[0].shippedAt = new Date("2026-10-25T00:00:00Z"); },
  ]) { const f = fixture(); modify(f); assert.equal((await f.service.applyDelivery(candidate, evidence)).eligible, false); }
});

test("captured/refunded payments are never captured again", async () => {
  for (const paymentStatus of ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED", "FAILED"]) {
    const f = fixture({ status: "DELIVERED", paymentStatus });
    assert.equal(await f.service.reconcileCod(candidate, evidence), "skipped");
    assert.equal(f.order.payments[0].status, paymentStatus);
    assert.equal(f.events.length, 0);
  }
});

test("disabled worker and non-due claims never call the courier", async () => {
  const f = fixture(); process.env.DELHIVERY_SYNC_ENABLED = "false";
  assert.deepEqual(await f.service.runOnce(), { skipped: true }); assert.equal(f.calls, 0);
  process.env.DELHIVERY_SYNC_ENABLED = "true";
  await f.service.runOnce(); await f.service.runOnce();
  assert.equal(f.calls, 1); assert.equal(f.order.status, "DELIVERED");
  assert.equal(f.order.payments[0].status, "CAPTURED");
  f.service.onModuleDestroy(); assert.deepEqual(await f.service.runOnce(), { skipped: true });
});

test("worker resumes COD reconciliation for previously delivered orders", async () => {
  const f = fixture({ status: "DELIVERED" });
  await f.service.runOnce();
  assert.equal(f.order.payments[0].status, "CAPTURED");
  assert.equal(f.events.filter(e => e.eventType === "ORDER_DELIVERED").length, 0);
});

test("courier outage keeps both statuses unchanged and retries when due", async () => {
  const f = fixture();
  const originalTrack = f.carrier.track;
  f.carrier.track = async () => { throw new Error("Simulated timeout"); };
  assert.equal((await f.service.runOnce() as any).failed, 1);
  assert.equal(f.order.status, "SHIPPED"); assert.equal(f.order.payments[0].status, "CREATED");
  f.carrier.track = originalTrack; f.due();
  await f.service.runOnce(); assert.equal(f.order.status, "DELIVERED");
});

test("manual delivery is independent of COD confirmation; amount and status are validated", async () => {
  const f = fixture(); const admin = new AdminService(f.db, f.carrier);
  await assert.rejects(admin.confirmCodCollection("HIDI-TEST", 187800, actor), /Confirm delivery/);
  await admin.updateStatus("HIDI-TEST", "DELIVERED", actor);
  assert.equal(f.order.payments[0].status, "CREATED");
  await assert.rejects(admin.confirmCodCollection("HIDI-TEST", 1, actor), /details changed/);
  await assert.rejects(admin.confirmCodCollection("HIDI-TEST", 0, actor), /exact COD amount/);
  await Promise.all([admin.confirmCodCollection("HIDI-TEST", 187800, actor), f.service.reconcileCod(candidate, evidence)]);
  assert.equal(f.order.payments[0].status, "CAPTURED");
  assert.equal(f.events.filter(e => e.eventType === "PAYMENT_CAPTURED").length, 1);
});

test("COD endpoint requires explicit confirmation and rejects non-numeric amounts", () => {
  const controller = new AdminController({} as any, {} as any, {} as any, {} as any, {} as any);
  assert.throws(() => controller.confirmCodCollection(actor, "HIDI-TEST", { amountPaise: 187800 }), /Confirm the full/);
  assert.throws(() => controller.confirmCodCollection(actor, "HIDI-TEST", { confirmed: true, amountPaise: "187800" as any }), /Confirm the full/);
});
