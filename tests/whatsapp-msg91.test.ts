import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Msg91WhatsAppService } from "../apps/api/src/whatsapp/msg91.service.js";
import { WhatsAppService } from "../apps/api/src/whatsapp/whatsapp.service.js";
import { WhatsAppController } from "../apps/api/src/whatsapp/whatsapp.controller.js";
import { parseMsg91Inbound, sendMsg91Text, SESSION_MS, verifyMsg91Token } from "../apps/api/src/whatsapp/msg91-protocol.js";

const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch; });
const sender = "919000000001", phone = "919000000002", token = "fixture-token-".repeat(4);
function configure() {
  Object.assign(process.env, { WHATSAPP_CHATBOT_ENABLED: "true", WHATSAPP_CHATBOT_PROVIDER: "msg91",
    MSG91_WHATSAPP_INTEGRATED_NUMBER: sender, MSG91_WHATSAPP_AUTHKEY: "fixture-auth",
    MSG91_WHATSAPP_WEBHOOK_TOKEN: token, WHATSAPP_CHATBOT_START_AT: new Date(Date.now() - 60_000).toISOString(), WEB_ORIGIN: "https://shop.example" });
  delete process.env.WHATSAPP_CHATBOT_TEST_NUMBERS;
}
function payload(text = "HI", id = "one", at = Date.now()) {
  return { direction: "0", eventName: "delivered", integratedNumber: sender, customerNumber: phone, contentType: "text",
    messages: JSON.stringify([{ from: phone, id: "wamid." + id, type: "text", text: { body: text }, timestamp: String(Math.floor(at / 1000)) }]) };
}
function fixture() {
  configure();
  let state: any = { messages: [], conversations: [], carts: [], items: [], optIn: true };
  let next = 0, tail = Promise.resolve();
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  const variant: any = { id: "variant", productId: "product", sku: "HIDI-TEST-M", color: "Blue", size: "M", pricePaise: 100000,
    active: true, product: { name: "Fixture top", status: "ACTIVE" }, inventory: { onHand: 10, reserved: 0, safetyStock: 0 } };
  let failItems = false;
  const db: any = {
    whatsAppConversation: {
      upsert: async ({ where, create }: any) => {
        let row = state.conversations.find((r: any) => matches(r, where));
        if (!row) { row = { id: "c" + ++next, state: "IDLE", context: null, lastInboundAt: null, ...create }; state.conversations.push(row); }
        return structuredClone(row);
      },
      update: async ({ where, data }: any) => structuredClone(Object.assign(state.conversations.find((r: any) => matches(r, where)), data)),
    },
    whatsAppMessage: {
      create: async ({ data }: any) => {
        if (state.messages.some((r: any) => r.providerMessageSid === data.providerMessageSid)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
        const row = { id: "m" + String(++next).padStart(5, "0"), createdAt: new Date(next), ...data }; state.messages.push(row); return structuredClone(row);
      },
      upsert: async ({ where, create }: any) => state.messages.find((r: any) => matches(r, where)) ?? db.whatsAppMessage.create({ data: create }),
      findUnique: async ({ where }: any) => structuredClone(state.messages.find((r: any) => matches(r, where)) ?? null),
      findFirst: async ({ where }: any) => structuredClone(state.messages.find((r: any) => matches(r, where)) ?? null),
      findMany: async ({ where, take }: any) => structuredClone(state.messages.filter((r: any) => matches(r, where)).slice(0, take)),
      update: async ({ where, data }: any) => Object.assign(state.messages.find((r: any) => matches(r, where)), data),
      updateMany: async ({ where, data }: any) => {
        const rows = state.messages.filter((r: any) => matches(r, where)); rows.forEach((r: any) => Object.assign(r, data)); return { count: rows.length };
      },
    },
    productVariant: { findUnique: async ({ where }: any) => where.sku === variant.sku || where.id === variant.id ? structuredClone(variant) : null },
    cart: { create: async ({ data }: any) => { const row = { id: "cart" + ++next, ...data }; state.carts.push(row); return row; } },
    cartItem: { create: async ({ data }: any) => { if (failItems) throw new Error("fixture failure"); state.items.push(data); return data; } },
    retentionProfile: { updateMany: async () => { state.optIn = false; } },
    order: { findFirst: async () => null },
  };
  db.$transaction = async (fn: any) => {
    const previous = tail; let release!: () => void; tail = new Promise<void>(r => { release = r; }); await previous;
    const before = structuredClone(state);
    try { return await fn(db); } catch (error) { state = before; throw error; } finally { release(); }
  };
  const service = new Msg91WhatsAppService(db);
  const receive = async (text: string, id: string) => {
    await service.inbound(token, payload(text, id));
    const row = state.messages.find((r: any) => r.status === "MSG91_PENDING");
    if (row) await service.processQueued(row.id, row.conversationId);
  };
  return { service, db, receive, variant, get state() { return state; }, failItems: (value: boolean) => { failItems = value; } };
}

test("callback authentication fails closed and disabled/misconfigured bots cannot enqueue", async () => {
  const f = fixture();
  for (const bad of [undefined, "", "bad", token + "a"]) await assert.rejects(f.service.inbound(bad, payload()), /credentials/);
  assert.throws(() => verifyMsg91Token("short", "short"));
  process.env.WHATSAPP_CHATBOT_ENABLED = "false";
  await assert.rejects(f.service.inbound(token, payload()), /not ready/);
  process.env.WHATSAPP_CHATBOT_ENABLED = "true"; delete process.env.WHATSAPP_CHATBOT_START_AT;
  await assert.rejects(f.service.inbound(token, payload()), /not ready/);
  assert.equal(f.state.messages.length, 0);
});

test("strict inbound contract rejects wrong sender and malformed data; ignores outbound/media/old events", () => {
  const now = new Date(), cutoff = new Date(now.getTime() - 60000), valid = payload();
  assert.equal(parseMsg91Inbound(valid, sender, cutoff, now)?.phone, "+" + phone);
  assert.throws(() => parseMsg91Inbound({ ...valid, integratedNumber: phone }, sender, cutoff, now));
  for (const changes of [{ direction: "1" }, { direction: undefined }, { eventName: "read" }, { contentType: "image" }]) {
    assert.equal(parseMsg91Inbound({ ...valid, ...changes }, sender, cutoff, now), null);
  }
  for (const changes of [{ messages: "bad-json" }, { messages: "[]" }, { customerNumber: "123" }, { messages: [{}] }]) {
    assert.throws(() => parseMsg91Inbound({ ...valid, ...changes }, sender, cutoff, now));
  }
  assert.equal(parseMsg91Inbound(payload("HI", "old", now.getTime() - 120000), sender, cutoff, now), null);
  assert.equal(parseMsg91Inbound(payload("HI", "old", now.getTime() - SESSION_MS), sender, new Date(0), now), null);
  assert.throws(() => parseMsg91Inbound(payload("HI", "future", now.getTime() + 120000), sender, cutoff, now));
});

test("concurrent duplicate callbacks create one durable inbound row and return without contacting provider", async () => {
  const f = fixture(); globalThis.fetch = async () => { throw new Error("must not send in webhook"); };
  await Promise.all(Array.from({ length: 8 }, () => f.service.inbound(token, payload())));
  assert.equal(f.state.messages.length, 1); assert.equal(f.state.messages[0].status, "MSG91_PENDING");
  process.env.WHATSAPP_CHATBOT_TEST_NUMBERS = "919000000003";
  await f.service.inbound(token, payload("HI", "other")); assert.equal(f.state.messages.length, 1);
});

test("product selection then concurrent YES processing creates one cart and one checkout reply", async () => {
  const f = fixture(); await f.receive("SKU: HIDI-TEST-M\nQuantity: 2", "selection");
  assert.equal(f.state.conversations[0].state, "AWAITING_ORDER_CONFIRMATION");
  await f.service.inbound(token, payload("YES", "yes")); const row = f.state.messages.at(-1);
  await Promise.all([f.service.processQueued(row.id, row.conversationId), f.service.processQueued(row.id, row.conversationId)]);
  assert.equal(f.state.carts.length, 1); assert.equal(f.state.items[0].quantity, 2);
  assert.equal(f.state.conversations[0].state, "CHECKOUT_READY");
  assert.match(f.state.messages.at(-1).body, /https:\/\/shop.example\/checkout\?waCart=/);
  assert.equal(f.state.messages.at(-1).status, "MSG91_PENDING_SEND");
  await f.receive("YES", "second-yes"); assert.equal(f.state.carts.length, 1);
});

test("cart/item/reply/state changes roll back together, and pending inbound can recover", async () => {
  const f = fixture(); await f.receive("SKU: HIDI-TEST-M", "selection");
  await f.service.inbound(token, payload("YES", "yes")); const row = f.state.messages.at(-1); f.failItems(true);
  await assert.rejects(f.service.processQueued(row.id, row.conversationId));
  assert.equal(f.state.carts.length, 0); assert.equal(f.state.conversations[0].state, "AWAITING_ORDER_CONFIRMATION");
  assert.equal(f.state.messages.at(-1).status, "MSG91_PENDING"); f.failItems(false);
  await f.service.processQueued(row.id, row.conversationId); assert.equal(f.state.carts.length, 1);
});

test("stock is rechecked and human handoff stays quiet until MENU; STOP withdraws consent", async () => {
  const f = fixture(); await f.receive("SKU: HIDI-TEST-M", "select"); f.variant.inventory.onHand = 0;
  await f.receive("YES", "yes"); assert.equal(f.state.carts.length, 0); assert.match(f.state.messages.at(-1).body, /Availability changed/);
  await f.receive("4", "human"); assert.equal(f.state.conversations[0].state, "HUMAN_HANDOFF");
  const replies = f.state.messages.filter((r: any) => r.direction === "OUTBOUND").length;
  await f.receive("please help with my dress", "help");
  assert.equal(f.state.messages.filter((r: any) => r.direction === "OUTBOUND").length, replies);
  await f.receive("MENU", "menu"); assert.equal(f.state.conversations[0].state, "IDLE");
  await f.receive("STOP", "stop"); assert.equal(f.state.optIn, false);
});

test("replicas claim one send; expired replies and uncertain submissions never resend automatically", async () => {
  const f = fixture(); await f.receive("HI", "hi"); const reply = f.state.messages.at(-1); let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ status: "success", hasError: false, errors: null }); };
  await Promise.all([f.service.sendQueued(reply.id), f.service.sendQueued(reply.id)]);
  assert.equal(calls, 1); assert.equal(reply.status, "MSG91_ACCEPTED");
  await f.service.sendQueued(reply.id); assert.equal(calls, 1);
  await f.receive("HI", "timeout"); const timeoutReply = f.state.messages.at(-1);
  globalThis.fetch = async () => { calls++; throw new Error("timeout"); };
  await f.service.sendQueued(timeoutReply.id); await f.service.sendQueued(timeoutReply.id);
  assert.equal(timeoutReply.status, "MSG91_UNKNOWN"); assert.equal(calls, 2);
  await f.receive("HI", "expiry"); const expired = f.state.messages.at(-1), inbound = f.state.messages.at(-2);
  inbound.body = JSON.stringify({ ...JSON.parse(inbound.body), receivedAt: new Date(Date.now() - SESSION_MS).toISOString() });
  await f.service.sendQueued(expired.id); assert.equal(expired.status, "MSG91_EXPIRED"); assert.equal(calls, 2);
});

test("MSG91 request uses documented parameters, secret header, timeout and no redirects; handles provider errors", async () => {
  let observed: URL | undefined;
  globalThis.fetch = async (url: any, options: any) => {
    observed = new URL(url); assert.equal(options.method, "POST"); assert.equal(options.redirect, "error");
    assert.equal(options.headers.authkey, "fixture-key"); assert(options.signal);
    return Response.json({ status: "success", hasError: false, errors: null });
  };
  assert.equal(await sendMsg91Text("fixture-key", sender, "+" + phone, "Hello & welcome"), "MSG91_ACCEPTED");
  assert.equal(observed!.searchParams.get("recipient_number"), phone); assert.equal(observed!.searchParams.get("text"), "Hello & welcome");
  assert.equal(observed!.searchParams.has("authkey"), false);
  for (const [response, expected] of [
    [new Response("denied", { status: 401 }), "MSG91_REJECTED"],
    [new Response("unknown", { status: 502 }), "MSG91_UNKNOWN"],
    [new Response("invalid-json"), "MSG91_UNKNOWN"],
    [Response.json({ hasError: true }), "MSG91_REJECTED"],
  ] as const) {
    globalThis.fetch = async () => response;
    assert.equal(await sendMsg91Text("fixture-key", sender, phone, "HI"), expected);
  }
});

test("Twilio response format stays XML and Twilio endpoint is disabled when MSG91 is selected", async () => {
  const f = fixture(); const legacy = new WhatsAppService(f.db);
  const xml = await legacy.handleInbound({ From: "whatsapp:+" + phone, Body: "HI", MessageSid: "SMfixture" });
  assert.match(xml, /^<\?xml/); assert.match(xml, /<Message>Welcome to HIDI/);
  await assert.rejects(new WhatsAppController(legacy, f.service).inbound(undefined, {}), /not enabled/);
});
