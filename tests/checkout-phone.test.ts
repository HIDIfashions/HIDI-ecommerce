import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { CheckoutPhoneService } from "../apps/api/src/checkout/checkout-phone.service.js";
import { CheckoutPhoneController } from "../apps/api/src/checkout/checkout-phone.controller.js";
import { Msg91CheckoutOtpProvider } from "../apps/api/src/checkout/msg91-checkout-otp.provider.js";
import { CheckoutService } from "../apps/api/src/checkout/checkout.service.js";
import { checkoutPhone, checkoutSession } from "../apps/api/src/checkout/checkout-phone-policy.js";

// Isolated in-memory transaction model, NOT a real SQL Server/provider test.
const keys = ["CHECKOUT_PHONE_VERIFICATION_REQUIRED", "CHECKOUT_PHONE_HASH_KEY", "MSG91_AUTH_KEY", "MSG91_OTP_TEMPLATE_ID", "CHECKOUT_OTP_HOURLY_SEND_LIMIT"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.CHECKOUT_PHONE_VERIFICATION_REQUIRED = "true";
  process.env.CHECKOUT_PHONE_HASH_KEY = "synthetic-test-key-not-a-production-secret-12345";
  process.env.MSG91_AUTH_KEY = "synthetic-provider-key";
  process.env.MSG91_OTP_TEMPLATE_ID = "synthetic-template";
  delete process.env.CHECKOUT_OTP_HOURLY_SEND_LIMIT;
});
afterEach(() => { for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });

const sessionId = "checkout-fixture-session-0001";
const phone = "+919876543210"; // Never contacted: every provider call is a stub.
const request = (extra: any = {}) => ({ sessionId, phone, ...extra });
const checkout = (token?: string, extra: any = {}) => ({
  sessionId, checkoutToken: "synthetic-checkout-0001", customerPhone: phone,
  shippingAddress: { phone }, phoneVerificationToken: token, ...extra,
});
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((part: any) => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("lt" in value) return row[key] < value.lt;
      if ("gt" in value) return row[key] > value.gt;
      throw new Error("Unexpected fixture query");
    }
    return row[key] === value;
  });
}
function fixture() {
  let state: any = { challenges: [], rates: [], empty: false };
  const calls: any[] = [];
  const provider: any = {
    configured: () => true,
    send: async (...args: any[]) => { calls.push(["send", ...args]); },
    verify: async (...args: any[]) => { calls.push(["verify", ...args]); return args[1] === "123456"; },
  };
  const mutate = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data) as any) {
      if (value && typeof value === "object" && "increment" in value) row[key] += value.increment;
      else row[key] = value;
    }
  };
  const db: any = {
    cart: { findUnique: async () => state.empty ? { items: [] } : { items: [{ id: "synthetic-line" }] } },
    checkoutPhoneChallenge: {
      findUnique: async (q: any) => structuredClone(state.challenges.find((r: any) => matches(r, q.where)) ?? null),
      create: async (q: any) => { const row = { attempts: 0, grantHash: null, grantExpiresAt: null, checkoutTokenHash: null, createdAt: new Date(), ...q.data }; state.challenges.push(row); return structuredClone(row); },
      updateMany: async (q: any) => { const rows = state.challenges.filter((r: any) => matches(r, q.where)); for (const r of rows) mutate(r, q.data); return { count: rows.length }; },
    },
    checkoutPhoneRate: {
      findUnique: async (q: any) => structuredClone(state.rates.find((r: any) => matches(r, q.where)) ?? null),
      upsert: async (q: any) => { const row = state.rates.find((r: any) => matches(r, q.where)); if (row) mutate(row, q.update); else state.rates.push(structuredClone(q.create)); },
    },
  };
  let tail = Promise.resolve();
  db.$transaction = (fn: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    const result = tail.then(async () => {
      const before = structuredClone(state);
      try { return await fn(db); } catch (e) { state = before; throw e; }
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const service = new CheckoutPhoneService(db, provider);
  return { db, service, provider, calls, state: () => state,
    advanceCooldown: () => { for (const row of state.rates) row.lastSentAt = new Date(Date.now() - 61_000); } };
}
async function grant(f: ReturnType<typeof fixture>, auth: any = null) {
  const sent = await f.service.send(request(), auth);
  return f.service.verify(request({ challengeId: sent.challengeId, otp: "123456" }), auth);
}
const status = (code: number) => (e: any) => e.getStatus?.() === code;

test("phone parser accepts local/+91 forms but rejects letters, short, long and invalid prefixes", () => {
  for (const value of ["9876543210", phone, "919876543210", ` ${phone} `]) assert.equal(checkoutPhone(value), phone);
  for (const value of ["987654321", "98765432100", "+449876543210", "1234567890", "98765abc43210", "98765 43210", null, 9876543210]) assert.throws(() => checkoutPhone(value), /10-digit/);
  assert.equal(checkoutSession(sessionId), sessionId);
  for (const value of ["short", "../../bad", null, "a".repeat(129)]) assert.throws(() => checkoutSession(value));
});
test("gate defaults off and makes no database/provider request; enabled but unconfigured fails closed", async () => {
  const f = fixture(); delete process.env.CHECKOUT_PHONE_VERIFICATION_REQUIRED;
  assert.deepEqual(f.service.policy(), { required: false, available: false, otpLength: 6, expiresInSeconds: 300, resendAfterSeconds: 60 });
  assert.equal(await f.service.authorize(checkout(), null), null);
  assert.equal(f.calls.length, 0);
  process.env.CHECKOUT_PHONE_VERIFICATION_REQUIRED = "true"; delete process.env.CHECKOUT_PHONE_HASH_KEY;
  assert.equal(f.service.policy().available, false);
  await assert.rejects(f.service.authorize(checkout(), null), status(503));
});
test("send requires a nonempty cart and never creates verification merely because delivery was accepted", async () => {
  const f = fixture(); f.state().empty = true;
  await assert.rejects(f.service.send(request()), status(400)); assert.equal(f.calls.length, 0);
  f.state().empty = false;
  const sent = await f.service.send(request());
  assert.equal(f.calls.length, 1); assert.equal(f.state().challenges[0].status, "SENT");
  assert(!("otp" in sent)); assert(!("token" in sent)); assert.match(sent.maskedPhone, /3210$/);
  await assert.rejects(f.service.authorize(checkout(), null), status(401));
});
test("wrong code is rejected, correct code creates a checkout-only proof with no User or sign-in", async () => {
  const f = fixture(); const sent = await f.service.send(request());
  await assert.rejects(f.service.verify(request({ challengeId: sent.challengeId, otp: "654321" })), status(400));
  const proof = await f.service.verify(request({ challengeId: sent.challengeId, otp: "123456" }));
  assert.equal(proof.verified, true); assert.equal(proof.phone, phone);
  assert(await f.service.authorize(checkout(proof.token), null));
  const stored = JSON.stringify(f.state());
  for (const secret of [phone, "123456", proof.token, sessionId, "synthetic-provider-key"]) assert(!stored.includes(secret));
});
test("malformed OTP, wrong phone, other session and another actor never reach the provider verifier", async () => {
  const f = fixture(); const sent = await f.service.send(request());
  for (const extra of [{ otp: "12345" }, { otp: "12a456" }, { phone: "+919876543211" }, { sessionId: "different-session-0002" }]) {
    await assert.rejects(f.service.verify(request({ challengeId: sent.challengeId, otp: "123456", ...extra })), status(400));
  }
  await assert.rejects(f.service.verify(request({ challengeId: sent.challengeId, otp: "123456" }), { id: "other-user", metadata: {} } as any), status(400));
  assert.equal(f.calls.filter(c => c[0] === "verify").length, 0);
});
test("maximum five guesses and expired code fail before provider call", async () => {
  const f = fixture(); const sent = await f.service.send(request());
  for (let i = 0; i < 5; i++) await assert.rejects(f.service.verify(request({ challengeId: sent.challengeId, otp: "654321" })), status(400));
  await assert.rejects(f.service.verify(request({ challengeId: sent.challengeId, otp: "123456" })), status(400));
  assert.equal(f.calls.filter(c => c[0] === "verify").length, 5);
  const other = fixture(); const expired = await other.service.send(request()); other.state().challenges[0].expiresAt = new Date(Date.now() - 1);
  await assert.rejects(other.service.verify(request({ challengeId: expired.challengeId, otp: "123456" })), status(400));
  assert.equal(other.calls.filter(c => c[0] === "verify").length, 0);
});
test("parallel verification claims only one attempt", async () => {
  const f = fixture(); const sent = await f.service.send(request()); let release!: () => void;
  f.provider.verify = async () => { f.calls.push(["verify"]); await new Promise<void>(r => release = r); return true; };
  const first = f.service.verify(request({ challengeId: sent.challengeId, otp: "123456" }));
  await new Promise(r => setImmediate(r));
  await assert.rejects(f.service.verify(request({ challengeId: sent.challengeId, otp: "123456" })), status(400));
  release(); await first; assert.equal(f.calls.filter(c => c[0] === "verify").length, 1);
});
test("sixty-second cooldown and five sends/hour are durable across service instances", async () => {
  const f = fixture(); const replica = new CheckoutPhoneService(f.db, f.provider);
  await f.service.send(request());
  await assert.rejects(replica.send(request()), status(429));
  for (let i = 1; i < 5; i++) { f.advanceCooldown(); await replica.send(request()); }
  f.advanceCooldown(); await assert.rejects(replica.send(request()), status(429));
  assert.equal(f.calls.filter(c => c[0] === "send").length, 5);
});
test("global hourly ceiling cannot be bypassed with new phone and session", async () => {
  process.env.CHECKOUT_OTP_HOURLY_SEND_LIMIT = "1";
  const f = fixture(); await f.service.send(request());
  await assert.rejects(f.service.send(request({ sessionId: "different-session-0002", phone: "+919876543211" })), status(429));
  assert.equal(f.calls.length, 1);
});
test("resend invalidates an earlier code and grant even across browsers", async () => {
  const f = fixture(); const proof = await grant(f);
  f.advanceCooldown(); await f.service.send(request({ sessionId: "different-session-0002" }));
  await assert.rejects(f.service.authorize(checkout(proof.token), null), status(401));
  assert.equal(f.state().challenges[0].status, "INVALIDATED");
});
test("a resend racing a provider verification cannot grant stale success", async () => {
  const f = fixture(); const sent = await f.service.send(request()); let release!: () => void;
  f.provider.verify = async () => { await new Promise<void>(r => release = r); return true; };
  const verifying = f.service.verify(request({ challengeId: sent.challengeId, otp: "123456" }));
  await new Promise(r => setImmediate(r)); f.advanceCooldown();
  await f.service.send(request({ sessionId: "different-session-0002" }));
  release(); await assert.rejects(verifying, status(400));
});
test("grant rejects a changed phone, session, actor, forged token, forged boolean and expiry", async () => {
  const f = fixture(); const proof = await grant(f);
  for (const input of [
    checkout(proof.token, { sessionId: "different-session-0002" }),
    checkout(proof.token, { customerPhone: "+919876543211", shippingAddress: { phone: "+919876543211" } }),
    checkout(proof.token.slice(0, -1) + (proof.token.endsWith("a") ? "b" : "a")),
    checkout(undefined, { phoneVerified: true }),
  ]) await assert.rejects(f.service.authorize(input, null), status(401));
  await assert.rejects(f.service.authorize(checkout(proof.token), { id: "other-user", metadata: {} } as any), status(401));
  f.state().challenges[0].grantExpiresAt = new Date(Date.now() - 1);
  await assert.rejects(f.service.authorize(checkout(proof.token), null), status(401));
});
test("contact and delivery numbers must match; only trusted verified sign-in phone bypasses guest challenge", async () => {
  const f = fixture();
  await assert.rejects(f.service.authorize(checkout(undefined, { shippingAddress: { phone: "+919876543211" } }), null), status(400));
  const auth = { id: "trusted-user", metadata: {}, phone, phoneVerified: true };
  assert.equal(await f.service.authorize(checkout(), auth), null);
  await assert.rejects(f.service.authorize(checkout(), { ...auth, phone: "+919876543211" }), status(401));
  await assert.rejects(f.service.authorize(checkout(), { ...auth, phoneVerified: false }), status(401));
  await assert.rejects(f.service.authorize(checkout(), { id: "email-user", metadata: {}, email: "synthetic@example.test" }), status(401));
});
test("proof consumed atomically for one checkout; same checkout retry allowed, different checkout rejected", async () => {
  const f = fixture(); const proof = await grant(f);
  const authorized = await f.service.authorize(checkout(proof.token), null);
  await f.db.$transaction(async (tx: any) => f.service.consume(tx, authorized, "synthetic-checkout-0001"), { isolationLevel: "Serializable" });
  assert(await f.service.authorize(checkout(proof.token), null));
  await assert.rejects(f.service.authorize(checkout(proof.token, { checkoutToken: "synthetic-checkout-0002" }), null), status(401));
  await assert.rejects(f.service.consume(f.db, authorized, "synthetic-checkout-0002"), status(401));
});
test("order transaction rollback restores unused verification grant", async () => {
  const f = fixture(); const proof = await grant(f); const authorized = await f.service.authorize(checkout(proof.token), null);
  await assert.rejects(f.db.$transaction(async (tx: any) => { await f.service.consume(tx, authorized, "synthetic-checkout-0001"); throw Error("Stock conflict"); }, { isolationLevel: "Serializable" }));
  assert.equal(f.state().challenges[0].status, "VERIFIED"); assert.equal(f.state().challenges[0].checkoutTokenHash, null);
  assert(await f.service.authorize(checkout(proof.token, { checkoutToken: "synthetic-checkout-0002" }), null));
});
test("provider failures invalidate the challenge without giving proof, logging secrets or skipping cooldown", async () => {
  const f = fixture(); f.provider.send = async () => { throw Error("private provider detail"); };
  await assert.rejects(f.service.send(request()), (e: any) => e.getStatus() === 503 && !e.message.includes("private"));
  assert.equal(f.state().challenges[0].status, "FAILED");
  await assert.rejects(f.service.send(request()), status(429));
  const g = fixture(); const sent = await g.service.send(request());
  g.provider.verify = async () => { throw Error("private code and key"); };
  await assert.rejects(g.service.verify(request({ challengeId: sent.challengeId, otp: "123456" })), status(503));
  assert.equal(g.state().challenges[0].status, "FAILED");
});
test("existing prepare rejects an unverified guest before user, order, wallet, inventory or payment work", async () => {
  const fail = () => assert.fail("No business-state access before phone authorization");
  const db: any = new Proxy({}, { get: fail });
  const service = new CheckoutService(db, {} as any, {} as any, new CheckoutPhoneService(db, new Msg91CheckoutOtpProvider()));
  await assert.rejects(service.prepare({
    ...checkout(), customerEmail: "synthetic@example.test",
    shippingAddress: { phone, firstName: "Test", line1: "Synthetic street", city: "Hyderabad", state: "Telangana", postalCode: "500001" },
  }), status(401));
});
test("controller rejects a supplied invalid bearer; never downgrades it to guest", async () => {
  const controller = new CheckoutPhoneController({ send: () => assert.fail("Must authenticate supplied bearer"), verify: () => assert.fail("Must authenticate supplied bearer") } as any,
    { requireUser: async () => { throw Error("Invalid bearer"); } } as any);
  await assert.rejects(controller.send(request(), "Bearer forged"), /Invalid bearer/);
  await assert.rejects(controller.verify(request(), "Bearer forged"), /Invalid bearer/);
});
test("MSG91 adapter uses backend credential/header, six digits and five minutes; send acceptance is not verification", async t => {
  const calls: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => { calls.push({ url: new URL(url), init }); return { ok: true, json: async () => ({ type: "success", request_id: "synthetic-request" }) } as any; });
  const provider = new Msg91CheckoutOtpProvider(); assert.equal(await provider.send(phone), undefined);
  assert.equal(calls[0].url.origin, "https://control.msg91.com");
  assert.equal(calls[0].init.headers.authkey, "synthetic-provider-key");
  assert.equal(calls[0].url.searchParams.get("authkey"), null);
  assert.equal(calls[0].url.searchParams.get("otp_length"), "6"); assert.equal(calls[0].url.searchParams.get("otp_expiry"), "5");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(await provider.verify(phone, "123456"), false);
});
test("MSG91 verifier only accepts explicit fresh success; already-verified and malformed replies cannot bypass OTP", async t => {
  let payload: any; t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => payload }) as any);
  const provider = new Msg91CheckoutOtpProvider();
  for (const data of [{ type: "success", message: "Mobile no. already verified" }, { type: "error", message: "OTP verified success" }, { type: "success" }, { verified: true }]) {
    payload = data; assert.equal(await provider.verify(phone, "123456"), false);
  }
  payload = { type: "success", message: "OTP verified success" }; assert.equal(await provider.verify(phone, "123456"), true);
});
