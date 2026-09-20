// Run: node --test tests/wallet-frontend.test.cjs
// Local, synthetic wallet/auth/payment tests. No provider or database is contacted.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../apps/web/node_modules/typescript");

function loadModule(file, imports, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => { if (!(name in imports)) throw Error(`Unexpected dependency: ${name}`); return imports[name]; }, AbortController, CustomEvent, Intl, URL, URLSearchParams, ...globals });
  return exports;
}

const summary = (overrides = {}) => ({
  enabled: true, currency: "INR", balancePaise: 100000, reservedPaise: 0, availablePaise: 100000, debtPaise: 0, pendingPaise: 2000, heldPaise: 0,
  history: [], historyTruncated: false,
  policy: { pointsPerComplete100Rupees: 2, paisePerPoint: 100, returnWindowDays: 7, redemptionCapPaise: null, expiry: null, basis: "MERCHANDISE_AFTER_DISCOUNT_AND_WALLET" },
  ...overrides,
});

const prepare = (overrides = {}) => ({
  provider: "RAZORPAY", captured: false, orderNumber: "HIDI-TEST-1", status: "PENDING_PAYMENT", currency: "INR",
  amountPaise: 100000, totalPaise: 100000, subtotalPaise: 100000, walletAppliedPaise: 0, razorpayKeyId: "test-key", providerOrderId: "test-order", ...overrides,
});

function clientHarness({ enabled = true, userId = "customer-a" } = {}) {
  const state = { userId, calls: [], token: async () => "test-token", payload: summary(), status: 200 };
  const auth = { getStoredSession: () => state.userId ? { user: { id: state.userId, email: `${state.userId}@example.test` } } : null, getAccessToken: () => state.token() };
  const client = loadModule("apps/web/lib/wallet-client.ts", {
    "@/lib/supabase-auth": auth,
    "@/lib/browser-api": { BROWSER_API_URL: "http://test.invalid/v1" },
  }, {
    process: { env: { NEXT_PUBLIC_WALLET_ENABLED: String(enabled), NEXT_PUBLIC_API_URL: "http://test.invalid/v1" } },
    fetch: async (url, init) => { state.calls.push({ url, init }); return { ok: state.status < 400, status: state.status, json: async () => typeof state.payload === "function" ? state.payload() : state.payload }; },
  });
  return { state, auth, client, signal: new AbortController().signal };
}

test("wallet feature off or anonymous session never fetches balances", async () => {
  for (const options of [{ enabled: false }, { userId: null }]) {
    const h = clientHarness(options);
    await assert.rejects(h.client.getWalletSummary("customer-a", h.signal));
    assert.equal(h.state.calls.length, 0);
  }
});

test("wallet request is authenticated/no-store and 404 is unavailable, not a zero balance", async () => {
  const h = clientHarness();
  h.state.status = 404;
  assert.equal(await h.client.getWalletSummary("customer-a", h.signal), null);
  assert.equal(h.state.calls[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(h.state.calls[0].init.cache, "no-store");
});

test("stale wallet response cannot publish another customer's balance", async () => {
  const h = clientHarness();
  h.state.payload = () => { h.state.userId = "customer-b"; return summary(); };
  await assert.rejects(h.client.getWalletSummary("customer-a", h.signal));
});

test("account switch during token refresh makes no wallet request", async () => {
  const h = clientHarness();
  h.state.token = async () => { h.state.userId = "customer-b"; return "stale-token"; };
  await assert.rejects(h.client.getWalletSummary("customer-a", h.signal));
  assert.equal(h.state.calls.length, 0);
});

test("wallet amounts are exact paise and allow full order coverage without percentage cap", () => {
  const { client } = clientHarness();
  assert.equal(client.walletAmountPaise("1000", 100000, 100000), 100000);
  assert.equal(client.walletAmountPaise("19.99", 2000, 5000), 1999);
  assert.equal(client.walletAmountPaise("0.01", 1, 100), 1);
  for (const value of ["0", "-1", "2.999", "NaN", "1e3", "1000.01", ""]) assert.equal(client.walletAmountPaise(value, 100000, 100000), null);
  assert.equal(client.walletAmountPaise("2", 100, 10000), null);
});

test("malformed wallet balances fail closed; disabled real ledger is retained", () => {
  const { client } = clientHarness();
  assert.throws(() => client.parseWalletSummary(summary({ availablePaise: -1 })));
  assert.throws(() => client.parseWalletSummary(summary({ balancePaise: NaN })));
  const paused = client.parseWalletSummary(summary({ enabled: false, availablePaise: 0 }));
  assert.equal(paused.balancePaise, 100000);
  assert.equal(paused.enabled, false);
});

test("payment response enforces cash + rewards = gross, including full-wallet capture", () => {
  const { client } = clientHarness();
  const full = client.parsePreparedCheckout(prepare({ provider: "WALLET", captured: true, amountPaise: 0, walletAppliedPaise: 100000, status: "CONFIRMED" }));
  assert.equal(full.amountPaise, 0);
  assert.throws(() => client.parsePreparedCheckout(prepare({ amountPaise: 50000, walletAppliedPaise: 60000 })));
  assert.throws(() => client.parsePreparedCheckout(prepare({ provider: "WALLET", amountPaise: 0, walletAppliedPaise: 100000, captured: false })));
  assert.equal(client.parsePreparedCheckout(prepare({ captured: true, status: "CONFIRMED" })).captured, true);
});

test("retry fingerprint changes with account, cart, wallet or delivery but not object key order", () => {
  const { client } = clientHarness();
  const base = { userId: "customer-a", sessionId: "bag-a", cartSignature: "cart-a", walletPaise: 100, details: { email: "a@example.test", city: "Hyderabad" } };
  const key = client.checkoutFingerprint(base);
  for (const change of [{ userId: "customer-b" }, { sessionId: "bag-b" }, { cartSignature: "cart-b" }, { walletPaise: 200 }, { details: { city: "Vijayawada" } }]) assert.notEqual(client.checkoutFingerprint({ ...base, ...change }), key);
  assert.equal(client.checkoutFingerprint({ ...base, details: { city: "Hyderabad", email: "a@example.test" } }), key);
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

function checkoutHarness({ sdk = true, userId = "customer-a", enabled = true } = {}) {
  const h = clientHarness({ userId, enabled });
  const window = new EventTarget();
  window.location = { search: "", pathname: "/checkout" };
  window.history = { replaceState() {} };
  const state = { prepareCalls: [], redirects: [], paymentOptions: [], walletRefreshes: 0, nextToken: 0, walletData: summary(), prepareResult: prepare(), prepareStatus: 200, prepareImpl: null, newBagCalls: 0 };
  if (sdk) window.Razorpay = class { constructor(options) { state.paymentOptions.push(options); } open() {} close() {} on() {} };
  const hooks = [];
  let cursor = 0;
  let effects = [];
  const react = {
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial; return [hooks[index], (value) => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useEffect(effect, deps) { const index = cursor++; const previous = hooks[index]; if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) { effects.push(() => { previous?.cleanup?.(); hooks[index] = { deps, cleanup: effect() }; }); } },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const checkout = loadModule("apps/web/components/checkout-client.tsx", {
    react, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/link": "Link", "next/script": "Script", "next/navigation": { useRouter: () => ({ push: (url) => state.redirects.push(url) }) },
    "@/lib/cart-session": {
      getCartSession: () => "bag-a",
      newCheckoutToken: () => `token-${++state.nextToken}`,
      startNewCartSession: () => { state.newBagCalls++; return "bag-new"; },
      adoptCartSession: () => true,
    },
    "@/lib/supabase-auth": h.auth,
    "@/lib/browser-api": { BROWSER_API_URL: "http://test.invalid/v1" },
    "@/lib/wallet-client": h.client,
    "@/components/catalog-image": { CatalogImage: (props) => jsx("img", props) },
    "@/components/wallet-balance": { useWalletSummary: () => ({ userId: h.state.userId, summary: state.walletData, loading: false, error: "", unavailable: !state.walletData.enabled, refresh: async () => { state.walletRefreshes++; return state.walletData; } }) },
    "./wallet.module.css": new Proxy({}, { get: (_, key) => key }),
  }, {
    window, process: { env: { NEXT_PUBLIC_API_URL: "http://test.invalid/v1" } },
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form[key] ?? ""; } },
    fetch: async (url, init = {}) => {
      if (url.includes("/carts/")) return { ok: true, json: async () => ({ subtotalPaise: 100000, itemCount: 1, items: [{ id: "line-1", quantity: 1, lineTotalPaise: 100000, variant: { id: "v1" } }] }) };
      if (url.endsWith("/checkout/prepare")) {
        state.prepareCalls.push({ url, init, body: JSON.parse(init.body) });
        if (state.prepareImpl) return state.prepareImpl();
        return { ok: state.prepareStatus < 400, status: state.prepareStatus, json: async () => state.prepareResult };
      }
      throw Error(`Unexpected URL ${url}`);
    },
  });
  let tree;
  function render() { cursor = 0; tree = checkout.CheckoutClient(); const pendingEffects = effects; effects = []; pendingEffects.forEach((effect) => effect()); return tree; }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const child of node) { const result = find(predicate, child); if (result) return result; } return null; }
    if (predicate(node)) return node;
    return find(predicate, node.props?.children ?? null);
  }
  function changeWallet(checked, value) {
    find((node) => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked } });
    find((node) => node.type === "form").props.onChange(); render();
    if (value !== undefined) { find((node) => node.type === "input" && node.props.type === "number").props.onChange({ target: { value } }); find((node) => node.type === "form").props.onChange(); render(); }
  }
  function submit() { return find((node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { email: "customer-a@example.test", phone: "9000000000", firstName: "Test", line1: "Test address", postalCode: "500001", city: "Hyderabad", state: "Telangana" } }); }
  async function ready() { render(); await settle(); render(); }
  return { ...h, state, session: h.state, window, render, find, changeWallet, submit, ready };
}

test("wallet checkbox starts unchecked; full-wallet checkout works without Razorpay SDK", async () => {
  const h = checkoutHarness({ sdk: false }); await h.ready();
  assert.equal(h.find((node) => node.type === "input" && node.props.type === "checkbox").props.checked, false);
  h.changeWallet(true);
  h.state.prepareResult = prepare({ provider: "WALLET", captured: true, amountPaise: 0, walletAppliedPaise: 100000, status: "CONFIRMED" });
  await h.submit();
  assert.equal(h.state.prepareCalls.length, 1);
  assert.equal(h.state.prepareCalls[0].body.walletPaise, 100000);
  assert.equal(h.state.prepareCalls[0].body.expectedTotalPaise, 100000);
  assert.equal(h.state.prepareCalls[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(h.state.walletRefreshes, 1);
  assert.equal(h.state.paymentOptions.length, 0);
  assert.match(h.state.redirects[0], /order-confirmed/);
});

test("cash checkout does not create an order before SDK is available", async () => {
  const h = checkoutHarness({ sdk: false }); await h.ready(); await h.submit();
  assert.equal(h.state.prepareCalls.length, 0);
});

test("partial redemption sends only the server-authoritative cash amount to Razorpay", async () => {
  const h = checkoutHarness(); await h.ready(); h.changeWallet(true, "250");
  h.state.prepareResult = prepare({ walletAppliedPaise: 25000, amountPaise: 75000 });
  await h.submit();
  assert.equal(h.state.paymentOptions[0].amount, 75000);
  assert.equal(h.state.prepareCalls[0].body.walletPaise, 25000);
});

test("double submit creates only one prepare request", async () => {
  const h = checkoutHarness(); await h.ready();
  let resolve;
  h.state.prepareImpl = () => new Promise((done) => { resolve = done; });
  const first = h.submit(); await settle(); const second = h.submit();
  assert.equal(h.state.prepareCalls.length, 1);
  resolve({ ok: true, json: async () => prepare() });
  await Promise.all([first, second]);
});

test("a lower freshly loaded wallet balance blocks new checkout instead of silently increasing cash", async () => {
  const h = checkoutHarness(); await h.ready(); h.changeWallet(true, "500");
  h.state.walletData = summary({ availablePaise: 1000 });
  await h.submit(); assert.equal(h.state.prepareCalls.length, 0); assert.equal(h.state.paymentOptions.length, 0);
});

test("identical retry reuses checkout token even when its wallet funds are reserved", async () => {
  const h = checkoutHarness(); await h.ready(); h.changeWallet(true, "500");
  h.state.prepareResult = prepare({ walletAppliedPaise: 50000, amountPaise: 50000 });
  await h.submit(); h.state.paymentOptions[0].modal.ondismiss(); h.render();
  h.state.walletData = summary({ availablePaise: 0, reservedPaise: 50000 });
  await h.submit();
  assert.equal(h.state.prepareCalls.length, 2);
  assert.equal(h.state.prepareCalls[0].body.checkoutToken, h.state.prepareCalls[1].body.checkoutToken);
});

test("changed wallet choice creates a new idempotency key", async () => {
  const h = checkoutHarness(); await h.ready(); h.changeWallet(true, "250");
  h.state.prepareResult = prepare({ walletAppliedPaise: 25000, amountPaise: 75000 });
  await h.submit(); h.state.paymentOptions[0].modal.ondismiss(); h.render(); h.changeWallet(false);
  h.state.prepareResult = prepare(); await h.submit();
  assert.notEqual(h.state.prepareCalls[0].body.checkoutToken, h.state.prepareCalls[1].body.checkoutToken);
});

test("captured cash retry redirects without opening a second Razorpay payment", async () => {
  const h = checkoutHarness(); await h.ready(); await h.submit(); h.state.paymentOptions[0].modal.ondismiss(); h.render();
  delete h.window.Razorpay;
  h.state.prepareResult = prepare({ captured: true, status: "CONFIRMED" }); await h.submit();
  assert.equal(h.state.paymentOptions.length, 1);
  assert.equal(h.state.redirects.length, 1);
});

test("account switch cancels a late full-wallet response and resets checkbox", async () => {
  const h = checkoutHarness({ sdk: false }); await h.ready(); h.changeWallet(true);
  let resolve;
  h.state.prepareImpl = () => new Promise((done) => { resolve = done; });
  const pending = h.submit(); await settle();
  h.session.userId = "customer-b"; h.window.dispatchEvent(new Event("hidi-auth-updated")); h.render();
  resolve({ ok: true, json: async () => prepare({ provider: "WALLET", captured: true, amountPaise: 0, walletAppliedPaise: 100000, status: "CONFIRMED" }) });
  await pending;
  assert.equal(h.state.redirects.length, 0);
  assert.equal(h.find((node) => node.type === "input" && node.props.type === "checkbox").props.checked, false);
});

test("guest cash checkout has no Authorization and wallet flag off renders no rewards controls", async () => {
  const h = checkoutHarness({ userId: null, enabled: false }); await h.ready();
  assert.equal(h.find((node) => node.type === "input" && node.props.type === "checkbox"), null);
  await h.submit();
  assert.equal(h.state.prepareCalls[0].init.headers.Authorization, undefined);
  assert.equal(h.state.prepareCalls[0].body.walletPaise, 0);
});

test("bag ownership conflict offers explicit new-bag action without automatic replacement", async () => {
  const h = checkoutHarness(); await h.ready();
  h.state.prepareStatus = 400; h.state.prepareResult = { message: "This bag belongs to another account" };
  await h.submit(); h.render();
  assert.equal(h.state.newBagCalls, 0);
  const button = h.find((node) => node.type === "button" && node.props.children === "Start a new bag");
  assert.ok(button); button.props.onClick();
  assert.equal(h.state.newBagCalls, 1);
});
