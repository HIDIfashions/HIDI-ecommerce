import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { OrderNotificationSender } from "../apps/api/src/order-notifications/order-notification.sender.js";
import { notificationConfig, OrderNotificationService } from "../apps/api/src/order-notifications/order-notification.service.js";
import type { NotificationOrder } from "../apps/api/src/order-notifications/order-message.js";
const savedEnv = { ...process.env }, savedFetch = globalThis.fetch;
const order: NotificationOrder = {
  id: "order", orderNumber: "HIDI-20261017-ABC123", status: "CONFIRMED", currency: "INR",
  customerPhone: "+91 98765 43210", customerEmail: null, shippingAddress: {},
  subtotalPaise: 149950, discountPaise: 0, shippingPaise: 0, taxPaise: 0,
  totalPaise: 149950, walletAppliedPaise: 0, items: [],
};
beforeEach(() => {
  process.env.ORDER_NOTIFICATIONS_ENABLED = "true";
  process.env.ORDER_NOTIFICATIONS_START_AT = "2026-10-17T09:00:00Z";
  process.env.ORDER_EMAIL_ENABLED = "false";
  process.env.ORDER_WHATSAPP_ENABLED = "false";
  process.env.ORDER_SMS_ENABLED = "true";
  process.env.ORDER_SMS_START_AT = "2026-10-17T10:00:00Z";
  process.env.ORDER_SMS_PROVIDER_VERIFIED = "true";
  process.env.MSG91_AUTHKEY = "test-sms-key";
  process.env.MSG91_ORDER_SMS_TEMPLATE_ID = "6ad3197ba8dca687a20f1e62";
});
afterEach(() => { process.env = { ...savedEnv }; globalThis.fetch = savedFetch; });
test("SMS requires explicit channel and provider clearance", () => {
  assert.deepEqual(notificationConfig().channels, ["SMS"]);
  delete process.env.ORDER_SMS_ENABLED;
  assert.deepEqual(notificationConfig().channels, []);
  process.env.ORDER_SMS_PROVIDER_VERIFIED = "false";
  assert.equal(new OrderNotificationSender().prepare(order, "SMS"), null);
});
test("SMS uses Flow ID, exact variable names, normalized mobile and unrounded amount", () => {
  assert.deepEqual(new OrderNotificationSender().prepare(order, "SMS"), {
    provider: "MSG91_SMS", body: { template_id: "6ad3197ba8dca687a20f1e62", short_url: "0",
      recipients: [{ mobiles: "919876543210", order_number: "HIDI-20261017-ABC123", amount: "1499.50" }] },
  });
  for (const patch of [{ customerPhone: "123" }, { orderNumber: "bad\norder" },
    { orderNumber: "x".repeat(41) }, { totalPaise: -1 }, { totalPaise: 1.1 }]) {
    assert.equal(new OrderNotificationSender().prepare({ ...order, ...patch }, "SMS"), null);
  }
});
test("SMS refuses a missing cutoff and uses its own later activation time", async () => {
  delete process.env.ORDER_SMS_START_AT;
  assert.equal(notificationConfig().channels.includes("SMS"), false);
  process.env.ORDER_SMS_START_AT = "2026-10-17T10:00:00Z";
  const cutoffs: Date[] = [];
  const store: any = { enqueue: async (_channel: string, cutoff: Date) => cutoffs.push(cutoff),
    recover: async () => {}, claim: async () => null };
  await new OrderNotificationService(store, new OrderNotificationSender()).runOnce();
  assert.equal(cutoffs[0].toISOString(), "2026-10-17T10:00:00.000Z");
  process.env.ORDER_SMS_START_AT = "2026-10-16T10:00:00Z";
  await new OrderNotificationService(store, new OrderNotificationSender()).runOnce();
  assert.equal(cutoffs[1].toISOString(), "2026-10-17T09:00:00.000Z");
});
test("SMS acceptance requires explicit success and provider reference; timeouts never auto retry", async () => {
  const sender = new OrderNotificationSender(), prepared = sender.prepare(order, "SMS")!;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://control.msg91.com/api/v5/flow");
    assert.equal((init!.headers as any).authkey, "test-sms-key");
    assert.equal((init!.headers as any)["Idempotency-Key"], undefined);
    return new Response(JSON.stringify({ type: "success", message: "request-reference" }));
  };
  assert.deepEqual(await sender.send("job", prepared), { status: "SENT", error: null, messageId: "request-reference" });
  globalThis.fetch = async () => new Response(JSON.stringify({ type: "error", message: "CTA failed" }));
  assert.equal((await sender.send("job", prepared)).status, "FAILED");
  globalThis.fetch = async () => new Response("{}");
  assert.equal((await sender.send("job", prepared)).status, "UNKNOWN");
  globalThis.fetch = async () => { throw Error("timeout"); };
  assert.equal((await sender.send("job", prepared)).status, "UNKNOWN");
});
test("queued SMS cannot bypass provider clearance or send to an old phone", async () => {
  const sender = new OrderNotificationSender(), prepared = sender.prepare(order, "SMS")!;
  for (const verified of [false, true]) {
    process.env.ORDER_SMS_PROVIDER_VERIFIED = String(verified);
    let claimed = false, sends = 0; const states: any[] = [];
    const store: any = { enqueue: async () => {}, recover: async () => {},
      claim: async () => claimed ? null : (claimed = true, { id: "j", channel: "SMS", orderId: "order",
        attempts: 0, payload: JSON.stringify(prepared), firstAttemptAt: null }),
      order: async () => ({ ...order, customerPhone: "9999999999" }),
      finish: async (_job: any, ...state: any[]) => states.push(state),
      beginSend: async () => { sends++; return true; } };
    await new OrderNotificationService(store, sender).runOnce();
    assert.equal(sends, 0);
    assert.equal(states[0][1], verified ? "SMS_RECIPIENT_CHANGED" : "SMS_PROVIDER_NOT_VERIFIED");
  }
});
