import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { orderMessage, recipient, type NotificationOrder } from "../apps/api/src/order-notifications/order-message.js";
import { OrderNotificationSender } from "../apps/api/src/order-notifications/order-notification.sender.js";
import { notificationConfig, OrderNotificationService } from "../apps/api/src/order-notifications/order-notification.service.js";
import { OrderNotificationStore } from "../apps/api/src/order-notifications/order-notification.store.js";
const env = { ...process.env };
const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.ORDER_NOTIFICATIONS_ENABLED = "true";
  process.env.ORDER_NOTIFICATIONS_START_AT = "2026-10-10T09:00:00Z";
  process.env.ORDER_EMAIL_ENABLED = "true";
  process.env.ORDER_WHATSAPP_ENABLED = "false";
  process.env.RESEND_API_KEY = "test-key-never-live";
  process.env.ORDER_FROM_EMAIL = "HIDI <orders@example.com>";
});
afterEach(() => { process.env = { ...env }; globalThis.fetch = originalFetch; });
const order: NotificationOrder = {
  id: "order-1", orderNumber: "HIDI-123", status: "CONFIRMED", currency: "INR",
  customerEmail: "customer@example.com", customerPhone: "9876543210",
  shippingAddress: JSON.stringify({ firstName: "Customer", line1: "12 Test Road", city: "Chennai", state: "TN", postalCode: "600001" }),
  subtotalPaise: 100000, discountPaise: 10000, shippingPaise: 5000, taxPaise: 0,
  totalPaise: 95000, walletAppliedPaise: 5000,
  items: [{ id: "item-1", productName: "Shirt", size: "L", color: "Blue", quantity: 1, totalPaise: 90000 }],
};
function fixture(options: { order?: NotificationOrder | null; attempts?: number; payload?: string; firstAttemptAt?: Date; failBegin?: boolean } = {}) {
  const job: any = { id: "job-1", orderId: "order-1", channel: "EMAIL", provider: null, payload: options.payload ?? null,
    attempts: options.attempts ?? 0, firstAttemptAt: options.firstAttemptAt ?? null, leaseOwner: "worker-1" };
  const states: any[] = []; let claimed = false; let sends = 0; let begin = 0; const queued: any[] = [];
  const store: any = {
    enqueue: async (channel: string, date: Date) => queued.push([channel, date]), recover: async () => {},
    claim: async () => { if (claimed) return null; claimed = true; return job; },
    order: async () => options.order === null ? null : options.order ?? order,
    beginSend: async (_job: any, provider: string, payload: string) => { begin++; job.provider = provider; job.payload = payload; return !options.failBegin; },
    finish: async (_job: any, ...state: any[]) => states.push(state), summary: async () => [], schemaReady: async () => false,
  };
  const sender = new OrderNotificationSender();
  const realSend = sender.send.bind(sender);
  sender.send = async (...args) => { sends++; return realSend(...args); };
  return { job, states, queued, get sends() { return sends; }, get begin() { return begin; },
    service: new OrderNotificationService(store, sender) };
}
test("feature stays disabled without an explicit UTC activation cutoff", async () => {
  delete process.env.ORDER_NOTIFICATIONS_START_AT;
  assert.equal(notificationConfig().enabled, false);
  const f = fixture(); await f.service.runOnce(); assert.equal(f.queued.length, 0);
  process.env.ORDER_NOTIFICATIONS_START_AT = "October 10, 2026";
  assert.equal(notificationConfig().enabled, false);
});
test("confirmation includes products, variants, totals, wallet split and shipping address", () => {
  const m = orderMessage(order);
  for (const text of ["HIDI-123", "Shirt", "L / Blue", "INR 950.00", "HIDI wallet: INR 50.00", "Payment gateway: INR 900.00", "12 Test Road"]) assert.ok(m.text.includes(text));
  assert.equal(m.whatsappVariables.length, 5);
  assert.equal(m.text.includes("example.com"), false);
});
test("message HTML escapes customer and product input and subject strips newlines", () => {
  const m = orderMessage({ ...order, orderNumber: "HIDI\r\nBcc: bad", shippingAddress: { firstName: '<img src=x onerror="bad">' },
    items: [{ ...order.items[0], productName: "<script>bad</script>" }] });
  assert.equal(m.html.includes("<script>bad"), false); assert.equal(m.html.includes("<img"), false);
  assert.ok(m.html.includes("&lt;script&gt;")); assert.equal(/[\r\n]/.test(m.subject), false);
});
test("invalid recipients are rejected and Indian mobile numbers are normalized", () => {
  assert.equal(recipient(order, "WHATSAPP"), "919876543210");
  assert.equal(recipient({ ...order, customerPhone: "+91 98765 43210" }, "WHATSAPP"), "919876543210");
  assert.equal(recipient({ ...order, customerPhone: "123" }, "WHATSAPP"), null);
  assert.equal(recipient({ ...order, customerEmail: "customer@example.com\r\nBcc:x@example.com" }, "EMAIL"), null);
});
test("provider accepts one confirmation; rerunning the worker cannot reclaim it", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  const f = fixture(); await f.service.runOnce(); await f.service.runOnce();
  assert.equal(f.sends, 1); assert.deepEqual(f.states[0].slice(0, 3), ["SENT", null, "email-1"]);
});
test("pending, review, cancelled, refunded and missing orders send no confirmation", async () => {
  for (const status of ["PENDING_PAYMENT", "PAYMENT_REVIEW", "CANCELLED", "REFUNDED", "RETURNED"]) {
    const f = fixture({ order: { ...order, status } }); await f.service.runOnce();
    assert.equal(f.sends, 0); assert.equal(f.states[0][0], "SKIPPED");
  }
  const f = fixture({ order: null }); await f.service.runOnce(); assert.equal(f.sends, 0);
});
test("missing email and provider configuration are handled without provider submissions", async () => {
  const absent = fixture({ order: { ...order, customerEmail: null } }); await absent.service.runOnce();
  assert.equal(absent.states[0][0], "SKIPPED");
  delete process.env.RESEND_API_KEY;
  const f = fixture(); await f.service.runOnce(); assert.equal(f.sends, 0); assert.equal(f.begin, 0);
  assert.deepEqual(f.states[0], ["WAITING_CONFIG", "PROVIDER_NOT_CONFIGURED", null, 300]);
});
test("a lost claim lease prevents submission", async () => {
  const f = fixture({ failBegin: true }); await f.service.runOnce(); assert.equal(f.sends, 0);
});
test("email timeout retries the same saved payload and idempotency key after customer data changes", async () => {
  const sender = new OrderNotificationSender(); const payload = JSON.stringify(sender.prepare(order, "EMAIL"));
  let request: any; globalThis.fetch = async (_url, options) => { request = options; throw new Error("timeout"); };
  const f = fixture({ payload, order: { ...order, customerEmail: "changed@example.com", totalPaise: 100 } });
  await f.service.runOnce(); assert.equal(f.states[0][0], "RETRY");
  assert.deepEqual(JSON.parse(request.body).to, ["customer@example.com"]);
  assert.equal(request.headers["Idempotency-Key"], "hidi-order-confirmation/job-1");
  assert.ok(JSON.parse(request.body).text.includes("INR 950.00")); assert.equal(f.job.payload, payload);
});
test("idempotency expiry and exhausted retries do not resubmit", async () => {
  for (const options of [{ firstAttemptAt: new Date(Date.now() - 23 * 3600000 - 1) }, { attempts: 6 }]) {
    const f = fixture(options); await f.service.runOnce(); assert.equal(f.sends, 0);
    assert.ok(["UNKNOWN", "FAILED"].includes(f.states[0][0]));
  }
});
test("rate limits retry; invalid credentials fail without retaining provider text", async () => {
  for (const [http, expected] of [[429, "RETRY"], [401, "FAILED"], [500, "RETRY"]] as const) {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "secret-key customer@example.com" }), { status: http });
    const f = fixture(); await f.service.runOnce(); assert.equal(f.states[0][0], expected);
    assert.equal(JSON.stringify(f.states).includes("secret-key"), false);
    assert.equal(JSON.stringify(f.states).includes("customer@example.com"), false);
  }
});
test("WhatsApp uses a separate approved order utility template, never the SMS OTP template", async () => {
  process.env.MSG91_AUTHKEY = "test-key"; process.env.MSG91_SMS_OTP_TEMPLATE_ID = "otp-only";
  const sender = new OrderNotificationSender(); assert.equal(sender.prepare(order, "WHATSAPP"), null);
  process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER = "919999999999";
  process.env.MSG91_ORDER_TEMPLATE_NAME = "hidi_order_confirmed"; process.env.MSG91_ORDER_TEMPLATE_NAMESPACE = "test-namespace";
  const prepared = sender.prepare(order, "WHATSAPP")!;
  assert.equal((prepared.body.payload as any).template.name, "hidi_order_confirmed");
  assert.equal(JSON.stringify(prepared).includes("otp-only"), false);
  assert.equal((prepared.body.payload as any).template.to_and_components[0].components.body_2.value, "HIDI-123");
  globalThis.fetch = async () => { throw new Error("timeout after submission"); };
  assert.deepEqual(await sender.send("job-1", prepared), { status: "UNKNOWN", error: "PROVIDER_NETWORK_UNCLEAR" });
});
test("overlapping worker ticks are serialized within a process", async () => {
  let release!: () => void; const pending = new Promise<void>(resolve => release = resolve);
  globalThis.fetch = async () => { await pending; return new Response(JSON.stringify({ id: "email-1" })); };
  const f = fixture(); const first = f.service.runOnce();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await f.service.runOnce(), { skipped: true }); release(); await first; assert.equal(f.sends, 1);
});
test("queue discovers only committed confirmation audit events with captured payment after cutoff", async () => {
  let query = ""; let params: any[] = [];
  const db: any = { $transaction: async (fn: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    return fn({ $executeRaw: async (parts: TemplateStringsArray, ...values: any[]) => { query = parts.join("?"); params = values; } });
  } };
  await new OrderNotificationStore(db).enqueue("EMAIL", new Date("2026-10-10T09:00:00Z"));
  assert.ok(query.includes("ORDER_CONFIRMED")); assert.ok(query.includes("p.[status]='CAPTURED'"));
  assert.ok(query.includes("a.[createdAt]>=?")); assert.ok(query.includes("NOT EXISTS"));
  assert.ok(params.some(p => p instanceof Date));
});

test("WhatsApp remains separate from email and requires recorded opt-in", async () => {
  process.env.ORDER_WHATSAPP_ENABLED = "true";
  const f = fixture(); f.job.channel = "WHATSAPP";
  await f.service.runOnce(); assert.equal(f.sends, 0);
  assert.equal(f.states[0][1], "WHATSAPP_CONSENT_NOT_PRESENT");
});
test("WhatsApp consent must be verified, current and match the order recipient", async () => {
  const consent = { whatsappOptIn: true, verifiedPhone: "+919876543210", phoneVerifiedAt: new Date(), consentVersion: "hidi-retention-v1" };
  for (const [profile, expected] of [
    [consent, true], [{ ...consent, verifiedPhone: "+919999999999" }, false],
    [{ ...consent, phoneVerifiedAt: null }, false], [{ ...consent, consentVersion: "old" }, false],
    [{ ...consent, whatsappOptIn: false }, false], [null, false],
  ] as const) {
    const db: any = { order: { findUnique: async () => ({ ...order, user: { retentionProfile: profile } }) } };
    assert.equal((await new OrderNotificationStore(db).order(order.id))?.whatsappOptIn, expected);
  }
});
test("admin readiness reports an absent additive table without querying it", async () => {
  const f = fixture(); const status = await f.service.status();
  assert.equal(status.schemaReady, false); assert.deepEqual(status.counts, []);
});
test("a queued WhatsApp retry cannot send to a previous phone number", async () => {
  process.env.ORDER_WHATSAPP_ENABLED = "true";
  process.env.MSG91_AUTHKEY = "test-key";
  const payload = JSON.stringify({ provider: "MSG91", body: { payload: { template: { to_and_components: [{ to: ["919999999999"] }] } } } });
  const f = fixture({ payload, order: { ...order, whatsappOptIn: true } });
  f.job.channel = "WHATSAPP";
  await f.service.runOnce();
  assert.equal(f.sends, 0); assert.equal(f.states[0][1], "WHATSAPP_RECIPIENT_CHANGED");
});
