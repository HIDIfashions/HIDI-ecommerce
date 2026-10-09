const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../apps/web/node_modules/typescript");

function harness(responses, env = {}, options = {}) {
  const calls = [];
  const storage = new Map();
  const exports = {};
  const firebaseCalls = [];
  const firebaseAuth = {
    signOut: async () => { firebaseCalls.push({ operation: "signOut" }); },
    signInWithPhoneNumber: async phone => {
      firebaseCalls.push({ operation: "send", phone });
      if (options.firebaseError || options.firebaseErrors?.shift()) throw new Error("Firebase unavailable");
      return { confirm: async code => {
        firebaseCalls.push({ operation: "verify", code });
        return { user: { getIdToken: async () => "test-firebase-id-token" } };
      } };
    },
  };
  const authFactory = () => firebaseAuth;
  authFactory.RecaptchaVerifier = class { async render() { return 1; } clear() {} };
  const source = fs.readFileSync(path.join(__dirname, "../apps/web/lib/supabase-auth.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(output, {
    exports, AbortSignal, CustomEvent,
    document: options.firebase ? { getElementById: () => ({}) } : undefined,
    process: { env: { NEXT_PUBLIC_API_URL: "https://old.test.invalid/api/store", ...env } },
    window: {
      location: { origin: "https://store.test.invalid" },
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
      dispatchEvent: () => undefined,
      ...(options.firebase ? { firebase: { apps: [{}], auth: authFactory } } : {}),
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      const response = responses.shift();
      assert.ok(response, `Unexpected request: ${url}`);
      if (response instanceof Error) throw response;
      return { ok: response.ok !== false, status: response.status ?? (response.ok === false ? 400 : 200), json: async () => response.body };
    },
  });
  return { auth: exports, calls, storage, firebaseCalls };
}

const whatsappConfig = { body: { phoneOtp: true, channel: "WHATSAPP", provider: "whatsapp" } };
const sent = { body: { phone: "+919999999999", channel: "WHATSAPP", expiresInSeconds: 300 } };
const smsFallbackConfig = { body: { phoneOtp: true, channel: "SMS", provider: "msg91", fallbackProvider: "firebase" } };
const firebaseFallback = { body: { phone: "+919999999999", channel: "FIREBASE", provider: "firebase", clientHandled: true, fallback: true } };
const firebaseEnv = { NEXT_PUBLIC_FIREBASE_API_KEY: "test-public-key", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test-project", NEXT_PUBLIC_FIREBASE_APP_ID: "test-app" };

test("MSG91 failure switches to Firebase and verifies the Firebase proof through HIDI", async () => {
  const h = harness([smsFallbackConfig, firebaseFallback, { body: { phoneOtp: true, channel: "SMS", provider: "msg91" } },
    { body: { access_token: "hidi_at_test", refresh_token: "hidi_rt_test", expires_in: 3600, user: { id: "customer-1" } } },
  ], firebaseEnv, { firebase: true });
  await h.auth.sendPhoneOtp("9999999999");
  assert.equal(h.calls[1].url, "https://store.test.invalid/api/store/auth/otp/request");
  assert.equal(h.firebaseCalls[0].phone, "+919999999999");
  await h.auth.loadAuthConfig();
  await h.auth.verifyPhoneOtp("9999999999", "123456");
  assert.deepEqual(JSON.parse(h.calls[3].init.body), { provider: "firebase", idToken: "test-firebase-id-token" });
  assert.equal(h.auth.getStoredSession().user.id, "customer-1");
});

for (const response of [
  { ok: false, body: { message: "Please wait before requesting another OTP" } },
  { body: { ...firebaseFallback.body, phone: "+918888888888" } },
  { body: { ...firebaseFallback.body, fallback: false } },
]) {
  test(`Firebase fallback rejects rate limits and invalid directives: ${JSON.stringify(response)}`, async () => {
    const h = harness([smsFallbackConfig, response], firebaseEnv, { firebase: true });
    await assert.rejects(h.auth.sendPhoneOtp("9999999999"));
    assert.equal(h.firebaseCalls.length, 0);
  });
}

test("Firebase fallback errors cannot be reported as a sent SMS", async () => {
  const h = harness([smsFallbackConfig, firebaseFallback], firebaseEnv, { firebase: true, firebaseError: true });
  await assert.rejects(h.auth.sendPhoneOtp("9999999999"), /Unable to send the verification code/);
  assert.equal(h.auth.getStoredSession(), null);
});

test("runtime MSG91 SMS replaces a baked Firebase provider and verifies through HIDI", async () => {
  const h = harness([
    { body: { phoneOtp: true, channel: "SMS", provider: "msg91" } },
    { body: { phone: "+919999999999", channel: "SMS", expiresInSeconds: 300 } },
    { body: { access_token: "hidi_at_test", refresh_token: "hidi_rt_test", expires_in: 3600,
      user: { id: "customer-1", phone: "+919999999999" } } },
  ], { NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER: "firebase", NEXT_PUBLIC_CUSTOMER_OTP_CHANNEL: "whatsapp" });
  await h.auth.sendPhoneOtp("9999999999");
  assert.equal(h.auth.authChannelLabel(), "SMS");
  assert.equal(h.calls[1].url, "https://store.test.invalid/api/store/auth/otp/request");
  const session = await h.auth.verifyPhoneOtp("9999999999", "123456");
  assert.equal(session.access_token, "hidi_at_test");
  assert.equal(h.calls[2].url, "https://store.test.invalid/api/store/auth/otp/verify");
  assert.equal(h.auth.getStoredSession().user.id, "customer-1");
});

test("runtime WhatsApp replaces a baked Firebase provider and SMS label", async () => {
  const h = harness([whatsappConfig, sent, { body: {
    access_token: "hidi_at_test", refresh_token: "hidi_rt_test", expires_in: 3600,
    user: { id: "customer-1", phone: "+919999999999" },
  } }], { NEXT_PUBLIC_CUSTOMER_AUTH_PROVIDER: "firebase", NEXT_PUBLIC_CUSTOMER_OTP_CHANNEL: "sms" });
  assert.equal(await h.auth.sendPhoneOtp("9999999999"), "+919999999999");
  assert.equal(h.auth.authChannelLabel(), "WhatsApp");
  assert.equal(h.auth.authConfigured(), true);
  assert.equal(h.calls[0].url, "https://store.test.invalid/api/store/auth/config");
  assert.equal(h.calls[0].init.cache, "no-store");
  assert.equal(h.calls[1].url, "https://store.test.invalid/api/store/auth/otp/request");
  assert.equal(JSON.parse(h.calls[1].init.body).phone, "+919999999999");
  const session = await h.auth.verifyPhoneOtp("9999999999", "123456");
  assert.equal(session.access_token, "hidi_at_test");
  assert.equal(JSON.parse(h.calls[2].init.body).otp, "123456");
  assert.equal(h.auth.getStoredSession().user.id, "customer-1");
});

test("unconfigured runtime refuses to send rather than using a baked provider", async () => {
  const h = harness([{ body: { ...whatsappConfig.body, phoneOtp: false } }]);
  await assert.rejects(h.auth.sendPhoneOtp("9999999999"), /temporarily unavailable/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.auth.authConfigured(), false);
});

for (const response of [
  { ok: false, body: {} },
  { body: { phoneOtp: true, channel: "SMS", provider: "whatsapp" } },
  { body: { phoneOtp: true, channel: "WHATSAPP", provider: "unknown" } },
]) {
  test(`invalid runtime configuration fails closed: ${JSON.stringify(response)}`, async () => {
    const h = harness([response]);
    await assert.rejects(h.auth.sendPhoneOtp("9999999999"), /temporarily unavailable/);
    assert.equal(h.calls.length, 1);
  });
}

test("a failed configuration request can be retried", async () => {
  const h = harness([new Error("offline"), whatsappConfig, sent]);
  await assert.rejects(h.auth.loadAuthConfig(), /offline/);
  await h.auth.sendPhoneOtp("9999999999");
  assert.equal(h.calls.length, 3);
  assert.equal(h.auth.authChannelLabel(), "WhatsApp");
});

test("the delivered channel overrides a configuration that changed during the request", async () => {
  const h = harness([whatsappConfig, { body: { ...sent.body, channel: "SMS" } }]);
  await h.auth.sendPhoneOtp("9999999999");
  assert.equal(h.auth.authChannelLabel(), "SMS");
});

test("a switch to client-handled Firebase cannot be reported as a sent WhatsApp code", async () => {
  const h = harness([whatsappConfig, { body: { channel: "FIREBASE", provider: "firebase", clientHandled: true } }]);
  await assert.rejects(h.auth.sendPhoneOtp("9999999999"), /settings changed/);
  assert.equal(h.auth.getStoredSession(), null);
});

test("verification keeps the provider that issued the pending OTP across a runtime switch", async () => {
  const h = harness([whatsappConfig, sent, {
    body: { phoneOtp: true, channel: "FIREBASE", provider: "firebase" },
  }, { body: {
    access_token: "hidi_at_test", refresh_token: "hidi_rt_test", expires_in: 3600,
    user: { id: "customer-1" },
  } }]);
  await h.auth.sendPhoneOtp("9999999999");
  await h.auth.loadAuthConfig();
  await h.auth.verifyPhoneOtp("9999999999", "123456");
  assert.equal(h.calls[3].url, "https://store.test.invalid/api/store/auth/otp/verify");
  assert.equal(JSON.parse(h.calls[3].init.body).otp, "123456");
});

const firebaseConfig = { body: { phoneOtp: true, channel: "FIREBASE", provider: "firebase" } };
const firebaseDirective = { body: { phone: "+919999999999", channel: "FIREBASE", provider: "firebase", clientHandled: true, retryAfterSeconds: 60 } };
const customerSession = { body: { access_token: "hidi_at_test", refresh_token: "hidi_rt_test", expires_in: 3600, user: { id: "customer-1" } } };

test("primary Firebase requires server send authorization before using the SDK", async () => {
  const h = harness([firebaseConfig, firebaseDirective, customerSession], firebaseEnv, { firebase: true });
  assert.equal(await h.auth.sendPhoneOtp("9999999999"), "+919999999999");
  assert.equal(h.calls[1].url, "https://store.test.invalid/api/store/auth/otp/request");
  assert.deepEqual(JSON.parse(h.calls[1].init.body), { phone: "+919999999999" });
  assert.equal(h.firebaseCalls[0].operation, "send");
  await h.auth.verifyPhoneOtp("9999999999", "123456");
  assert.deepEqual(JSON.parse(h.calls[2].init.body), { provider: "firebase", idToken: "test-firebase-id-token" });
});

test("server throttle applies to primary Firebase and exposes its retry deadline", async () => {
  const h = harness([firebaseConfig, { ok: false, status: 429, body: { message: "Please wait", retryAfterSeconds: 89.2 } }], firebaseEnv, { firebase: true });
  await assert.rejects(h.auth.sendPhoneOtp("9999999999"), error => error.message === "Please wait" && error.retryAfterSeconds === 90);
  assert.equal(h.firebaseCalls.length, 0);
});

for (const body of [
  { ...firebaseDirective.body, phone: "+918888888888" },
  { ...firebaseDirective.body, fallback: true },
  { ...firebaseDirective.body, clientHandled: false },
]) {
  test(`primary Firebase rejects mismatched send directives: ${JSON.stringify(body)}`, async () => {
    const h = harness([firebaseConfig, { body }], firebaseEnv, { firebase: true });
    await assert.rejects(h.auth.sendPhoneOtp("9999999999"), /settings changed/);
    assert.equal(h.firebaseCalls.length, 0);
  });
}

test("a failed resend retains the issuer proof and can verify the previous code", async () => {
  const h = harness([whatsappConfig, sent, firebaseConfig,
    { ok: false, status: 429, body: { message: "Please wait", retryAfterSeconds: 60 } }, customerSession,
  ], firebaseEnv, { firebase: true });
  await h.auth.sendPhoneOtp("9999999999");
  await assert.rejects(h.auth.sendPhoneOtp("9999999999"), error => error.retryAfterSeconds === 60);
  await h.auth.verifyPhoneOtp("9999999999", "123456");
  assert.deepEqual(JSON.parse(h.calls[4].init.body), { phone: "+919999999999", otp: "123456" });
  assert.equal(h.firebaseCalls.length, 0);
});

test("a successful resend refreshes runtime settings and replaces the issuing provider", async () => {
  const h = harness([whatsappConfig, sent, firebaseConfig, firebaseDirective, customerSession], firebaseEnv, { firebase: true });
  await h.auth.sendPhoneOtp("9999999999");
  await h.auth.sendPhoneOtp("9999999999");
  assert.equal(h.calls.filter(call => call.url.endsWith("/auth/config")).length, 2);
  await h.auth.verifyPhoneOtp("9999999999", "654321");
  assert.deepEqual(JSON.parse(h.calls[4].init.body), { provider: "firebase", idToken: "test-firebase-id-token" });
});

test("Firebase SDK resend failure preserves the prior confirmation", async () => {
  const h = harness([firebaseConfig, firebaseDirective, firebaseConfig, firebaseDirective, customerSession], firebaseEnv, { firebase: true, firebaseErrors: [false, true] });
  await h.auth.sendPhoneOtp("9999999999");
  await assert.rejects(h.auth.sendPhoneOtp("9999999999"), /Unable to send/);
  await h.auth.verifyPhoneOtp("9999999999", "123456");
  assert.deepEqual(JSON.parse(h.calls[4].init.body), { provider: "firebase", idToken: "test-firebase-id-token" });
  assert.equal(h.firebaseCalls.filter(call => call.operation === "verify").length, 1);
});

test("invalid retry metadata and non-throttle responses do not set a retry deadline", async () => {
  for (const response of [
    { ok: false, status: 429, body: { message: "Please wait", retryAfterSeconds: "invalid" } },
    { ok: false, status: 429, body: { message: "Please wait", retryAfterSeconds: -1 } },
    { ok: false, status: 503, body: { message: "Unavailable", retryAfterSeconds: 60 } },
  ]) {
    const h = harness([whatsappConfig, response]);
    await assert.rejects(h.auth.sendPhoneOtp("9999999999"), error => error.retryAfterSeconds === undefined);
  }
});
