// Run: node --test tests/retention-frontend.test.cjs
// Isolated consent/auth tests: no network, database, WhatsApp, or real customer data.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../apps/web/node_modules/typescript");

function moduleFromSource(relativePath, imports, globals) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require(name) { if (!(name in imports)) throw Error(`Unexpected dependency: ${name}`); return imports[name]; },
    AbortController, CustomEvent, ...globals,
  });
  return exports;
}

const preferences = (overrides = {}) => ({
  enabled: true, sendingEnabled: false, consentVersion: "hidi-retention-v1",
  whatsappOptIn: false, personalizationOptIn: false, phoneVerified: false, maskedPhone: null,
  ...overrides,
});

function clientHarness({ enabled = true, userId = "customer-a" } = {}) {
  const state = { userId, calls: [], responses: [], token: async () => "test-token" };
  const events = new EventTarget();
  const client = moduleFromSource("apps/web/lib/retention-client.ts", {
    "@/lib/supabase-auth": { getStoredSession: () => state.userId ? { user: { id: state.userId } } : null, getAccessToken: () => state.token() },
  }, {
    process: { env: { NEXT_PUBLIC_RETENTION_ENABLED: String(enabled), NEXT_PUBLIC_API_URL: "http://test.invalid/v1" } },
    window: events,
    fetch: async (url, init) => {
      state.calls.push({ url, init });
      const data = state.responses.shift() ?? preferences();
      return { ok: true, json: async () => typeof data === "function" ? data() : data };
    },
  });
  return { state, events, client, signal: new AbortController().signal };
}

test("feature off and anonymous sessions make no API requests", async () => {
  const off = clientHarness({ enabled: false });
  await assert.rejects(off.client.getRetentionPreferences("customer-a", off.signal));
  assert.equal(off.state.calls.length, 0);
  const anonymous = clientHarness({ userId: null });
  await assert.rejects(anonymous.client.getRetentionPreferences("customer-a", anonymous.signal));
  assert.equal(anonymous.state.calls.length, 0);
});

test("independent choices and consent version are sent, without storing browsing history", async () => {
  const h = clientHarness();
  let notified = false;
  h.events.addEventListener("hidi-retention-preferences-updated", (event) => { notified = event.detail.userId === "customer-a"; });
  await h.client.updateRetentionPreferences("customer-a", { personalizationOptIn: true, whatsappOptIn: false }, h.signal);
  const { url, init } = h.state.calls[0];
  assert.equal(url, "http://test.invalid/v1/retention/preferences");
  assert.equal(init.method, "PATCH");
  assert.equal(init.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(init.body), { personalizationOptIn: true, whatsappOptIn: false, consentVersion: "hidi-retention-v1" });
  assert.equal(notified, true);
});

test("a paused server still permits a preference withdrawal request", async () => {
  const h = clientHarness();
  h.state.responses.push(preferences({ enabled: false }));
  const result = await h.client.updateRetentionPreferences("customer-a", { personalizationOptIn: false, whatsappOptIn: false }, h.signal);
  assert.equal(result.enabled, false);
  assert.equal(h.state.calls.length, 1);
});

test("switching identity while token resolves prevents the old customer's request", async () => {
  const h = clientHarness();
  let resolveToken;
  h.state.token = () => new Promise((resolve) => { resolveToken = resolve; });
  const pending = h.client.getRetentionPreferences("customer-a", h.signal);
  h.state.userId = "customer-b";
  resolveToken("old-token");
  await assert.rejects(pending);
  assert.equal(h.state.calls.length, 0);
});

test("switching identity while response resolves rejects stale preferences", async () => {
  const h = clientHarness();
  h.state.responses.push(() => { h.state.userId = "customer-b"; return preferences({ personalizationOptIn: true }); });
  await assert.rejects(h.client.getRetentionPreferences("customer-a", h.signal));
});

test("invalid preference response fails closed", async () => {
  const h = clientHarness();
  h.state.responses.push({ personalizationOptIn: true });
  await assert.rejects(h.client.getRetentionPreferences("customer-a", h.signal));
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

function trackerHarness({ enabled = true, userId = "customer-a", consent = preferences() } = {}) {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const state = { userId, consent, events: [], preferenceCalls: 0, now: 0, timers: new Map(), nextTimer: 1, cleanup: null };
  const tracker = moduleFromSource("apps/web/components/retention-tracker.tsx", {
    react: { useEffect: (effect) => { state.cleanup = effect(); } },
    "@/lib/product-sharing": { PRODUCT_VARIANT_EVENT: "hidi-product-variant-selected" },
    "@/lib/retention-client": {
      retentionEnabled: enabled,
      retentionAccountId: () => state.userId,
      RETENTION_PREFERENCES_EVENT: "hidi-retention-preferences-updated",
      getRetentionPreferences: async () => { state.preferenceCalls += 1; return typeof state.consent === "function" ? state.consent() : state.consent; },
      recordRetentionEvent: async (userId, event) => { state.events.push({ userId, ...event }); },
    },
  }, {
    window, document,
    performance: { now: () => state.now },
    setTimeout(callback, delay) { const id = state.nextTimer++; state.timers.set(id, { at: state.now + delay, callback }); return id; },
    clearTimeout(id) { state.timers.delete(id); },
  });
  tracker.RetentionTracker({ productId: "p1", slug: "sage-kurta" });
  function advance(ms) {
    state.now += ms;
    for (const [id, task] of [...state.timers]) if (task.at <= state.now) { state.timers.delete(id); task.callback(); }
  }
  function select(variantId = "v1", slug = "sage-kurta") {
    window.dispatchEvent(new CustomEvent("hidi-product-variant-selected", { detail: { slug, variantId, size: "M", color: "Sage" } }));
  }
  function visibility(value) { document.visibilityState = value; document.dispatchEvent(new Event("visibilitychange")); }
  return { state, window, advance, select, visibility };
}

test("tracker stays silent when disabled, anonymous, or personalization not opted in", async () => {
  for (const setup of [{ enabled: false }, { userId: null }, {}]) {
    const h = trackerHarness(setup);
    await settle();
    h.select(); h.advance(60_000);
    assert.equal(h.state.events.length, 0);
    if (setup.enabled === false || setup.userId === null) assert.equal(h.state.preferenceCalls, 0);
    h.state.cleanup?.();
  }
});

test("only 30 visible seconds qualify, and each product detail is recorded once", async () => {
  const h = trackerHarness({ consent: preferences({ personalizationOptIn: true }) });
  await settle();
  h.advance(10_000); h.visibility("hidden"); h.advance(100_000);
  assert.equal(h.state.events.length, 0);
  h.visibility("visible"); h.advance(19_999);
  assert.equal(h.state.events.length, 0);
  h.advance(1); h.advance(60_000);
  assert.equal(h.state.events.length, 1);
  assert.equal(h.state.events[0].kind, "DETAIL_VIEW");
  h.state.cleanup();
});

test("size events require consent and matching product; repeated size event is deduplicated", async () => {
  const h = trackerHarness({ consent: preferences({ personalizationOptIn: true }) });
  h.select(); // Consent has not resolved yet.
  await settle();
  h.select("other", "other-product"); h.select(); h.select();
  assert.equal(h.state.events.length, 1);
  assert.equal(h.state.events[0].kind, "SIZE_SELECT");
  h.state.cleanup();
});

test("logout cancels the clock and suppresses further size events", async () => {
  const h = trackerHarness({ consent: preferences({ personalizationOptIn: true }) });
  await settle();
  h.advance(20_000);
  h.state.userId = null; h.window.dispatchEvent(new Event("hidi-auth-updated"));
  h.select(); h.advance(60_000);
  assert.equal(h.state.events.length, 0);
  h.state.cleanup();
});

test("old customer's late consent cannot enable tracking for a new customer", async () => {
  let resolveOld;
  const h = trackerHarness({ consent: () => new Promise((resolve) => { resolveOld = resolve; }) });
  h.state.userId = "customer-b"; h.state.consent = preferences();
  h.window.dispatchEvent(new Event("hidi-auth-updated"));
  await settle();
  resolveOld(preferences({ personalizationOptIn: true }));
  await settle(); h.select(); h.advance(60_000);
  assert.equal(h.state.events.length, 0);
  h.state.cleanup();
});

test("withdrawing consent immediately resets tracking pending server confirmation", async () => {
  const h = trackerHarness({ consent: preferences({ personalizationOptIn: true }) });
  await settle(); h.advance(20_000);
  h.state.consent = preferences();
  h.window.dispatchEvent(new CustomEvent("hidi-retention-preferences-updated", { detail: { userId: "customer-a" } }));
  h.select(); h.advance(60_000); await settle();
  assert.equal(h.state.events.length, 0);
  h.state.cleanup();
});
