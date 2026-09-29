// Run: node --test tests/auth-refresh.test.cjs
// Synthetic sessions and mocked HTTP only; no real auth provider or credentials.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../apps/web/node_modules/typescript");

const STORAGE_KEY = "hidi_supabase_session";
const session = (userId = "customer-a", refreshToken = "original-refresh") => ({
  access_token: "expired-access", refresh_token: refreshToken, expires_at: 0, user: { id: userId },
});
const refreshed = (userId = "customer-a", refreshToken = "rotated-refresh") => ({
  access_token: "fresh-access", refresh_token: refreshToken, expires_in: 3600, user: { id: userId },
});

function harness() {
  const storage = new Map([[STORAGE_KEY, JSON.stringify(session())]]);
  const state = { requests: [], writes: 0, clears: 0, events: 0 };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "../apps/web/lib/supabase-auth.ts"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(output, {
    exports, CustomEvent,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://auth.test.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key" } },
    window: {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => { state.writes += 1; storage.set(key, value); },
        removeItem: (key) => { state.clears += 1; storage.delete(key); },
      },
      dispatchEvent: () => { state.events += 1; },
    },
    fetch: () => new Promise((resolve) => { state.requests.push(resolve); }),
  });
  function respond(index, payload, ok = true) { state.requests[index]({ ok, json: async () => payload }); }
  return { auth: exports, storage, state, respond };
}

test("a matching refresh rotates the active session", async () => {
  const h = harness();
  const pending = h.auth.getAccessToken();
  h.respond(0, refreshed());
  assert.equal(await pending, "fresh-access");
  assert.equal(h.auth.getStoredSession().refresh_token, "rotated-refresh");
  assert.equal(h.state.writes, 1);
});

test("a late successful refresh cannot undo logout", async () => {
  const h = harness();
  const pending = h.auth.getAccessToken();
  h.auth.clearStoredSession();
  h.respond(0, refreshed());
  assert.equal(await pending, null);
  assert.equal(h.auth.getStoredSession(), null);
  assert.equal(h.state.writes, 0);
});

test("a late successful refresh cannot replace another customer's session", async () => {
  const h = harness();
  const pending = h.auth.getAccessToken();
  h.storage.set(STORAGE_KEY, JSON.stringify(session("customer-b", "customer-b-refresh")));
  h.respond(0, refreshed());
  assert.equal(await pending, null);
  assert.equal(h.auth.getStoredSession().user.id, "customer-b");
  assert.equal(h.state.writes, 0);
  assert.equal(h.state.clears, 0);
});

test("a late failed refresh cannot clear another customer's session", async () => {
  const h = harness();
  const pending = h.auth.getAccessToken();
  h.storage.set(STORAGE_KEY, JSON.stringify(session("customer-b", "customer-b-refresh")));
  h.respond(0, {}, false);
  assert.equal(await pending, null);
  assert.equal(h.auth.getStoredSession().user.id, "customer-b");
  assert.equal(h.state.clears, 0);
});

test("a late failed refresh after logout does not mutate storage again", async () => {
  const h = harness();
  const pending = h.auth.getAccessToken();
  h.auth.clearStoredSession();
  h.respond(0, {}, false);
  assert.equal(await pending, null);
  assert.equal(h.state.clears, 1);
  assert.equal(h.state.events, 1);
});

test("a failed refresh of the still-active original session clears it", async () => {
  const h = harness();
  const pending = h.auth.getAccessToken();
  h.respond(0, {}, false);
  assert.equal(await pending, null);
  assert.equal(h.auth.getStoredSession(), null);
  assert.equal(h.state.clears, 1);
});

test("a response for an unrelated user cannot be saved", async () => {
  const h = harness();
  const pending = h.auth.getAccessToken();
  h.respond(0, refreshed("customer-b"));
  assert.equal(await pending, null);
  assert.equal(h.auth.getStoredSession().user.id, "customer-a");
  assert.equal(h.state.writes, 0);
});

test("a session switch during JSON parsing also prevents a stale save", async () => {
  const h = harness();
  const pending = h.auth.getAccessToken();
  h.state.requests[0]({ ok: true, json: async () => {
    h.storage.set(STORAGE_KEY, JSON.stringify(session("customer-b", "customer-b-refresh")));
    return refreshed();
  } });
  assert.equal(await pending, null);
  assert.equal(h.auth.getStoredSession().user.id, "customer-b");
  assert.equal(h.state.writes, 0);
});

test("concurrent refresh success cannot overwrite the first rotated token", async () => {
  const h = harness();
  const first = h.auth.getAccessToken();
  const second = h.auth.getAccessToken();
  h.respond(0, refreshed("customer-a", "first-rotated-token"));
  assert.equal(await first, "fresh-access");
  h.respond(1, refreshed("customer-a", "second-rotated-token"));
  assert.equal(await second, null);
  assert.equal(h.auth.getStoredSession().refresh_token, "first-rotated-token");
  assert.equal(h.state.writes, 1);
});

test("concurrent refresh failure cannot clear the first rotated token", async () => {
  const h = harness();
  const first = h.auth.getAccessToken();
  const second = h.auth.getAccessToken();
  h.respond(0, refreshed("customer-a", "first-rotated-token"));
  await first;
  h.respond(1, {}, false);
  assert.equal(await second, null);
  assert.equal(h.auth.getStoredSession().refresh_token, "first-rotated-token");
  assert.equal(h.state.clears, 0);
});
