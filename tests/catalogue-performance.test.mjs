import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { readPublicJson, PublicReadError } from "../apps/web/lib/public-read.ts";

// Exercise the actual API module without installing Next.js or modifying source.
// Only the extensionless local import is resolved to an absolute file URL.
const apiSource = await readFile(new URL("../apps/web/lib/api.ts", import.meta.url), "utf8");
const helperUrl = new URL("../apps/web/lib/public-read.ts", import.meta.url).href;
const executableApi = stripTypeScriptTypes(apiSource).replace(
  'from "./public-read"', `from "${helperUrl}"`,
);
process.env.NODE_ENV = "production";
process.env.API_URL = "https://catalogue.test/v1";
const api = await import(`data:text/javascript;base64,${Buffer.from(executableApi).toString("base64")}`);

const fast = { totalTimeoutMs: 200, attemptTimeoutMs: 80, retryDelayMs: 1 };
function fakeFetch(t, fn) { t.mock.method(globalThis, "fetch", fn); }
function quietErrors(t) { t.mock.method(console, "error", () => {}); }
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json" },
});
const products = ["current", "a", "b", "c", "d"].map((slug) => ({ slug }));

async function localServer(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("successful catalogue GET stays uncached and sends no customer headers", async (t) => {
  let calls = 0;
  fakeFetch(t, async (url, options) => {
    calls++;
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers, undefined);
    assert.equal(options.method, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return json([{ id: "p1", available: 2 }]);
  });
  assert.deepEqual(await readPublicJson("https://catalogue.test/products", fast), [{ id: "p1", available: 2 }]);
  assert.equal(calls, 1);
});

test("successfully empty catalogue is not an error", async (t) => {
  fakeFetch(t, async () => json([]));
  assert.deepEqual(await readPublicJson("https://catalogue.test/products", { ...fast, validate: Array.isArray }), []);
});

test("503 retries once and can recover", async (t) => {
  let calls = 0;
  fakeFetch(t, async () => ++calls === 1 ? json({}, 503) : json(["recovered"]));
  assert.deepEqual(await readPublicJson("https://catalogue.test/products", fast), ["recovered"]);
  assert.equal(calls, 2);
});

test("persistent 500 stops at the attempt limit", async (t) => {
  let calls = 0;
  fakeFetch(t, async () => { calls++; return json({}, 500); });
  await assert.rejects(readPublicJson("https://catalogue.test/products", fast), { status: 500 });
  assert.equal(calls, 2);
});

for (const status of [400, 401, 403, 404, 429, 501]) {
  test(`HTTP ${status} is not retried`, async (t) => {
    let calls = 0;
    fakeFetch(t, async () => { calls++; return json({}, status); });
    await assert.rejects(readPublicJson("https://catalogue.test/products", fast), { status });
    assert.equal(calls, 1);
  });
}

test("network failures retry within the same budget", async (t) => {
  let calls = 0;
  fakeFetch(t, async () => {
    if (++calls === 1) throw new TypeError("connection reset");
    return json(["ok"]);
  });
  assert.deepEqual(await readPublicJson("https://catalogue.test/products", fast), ["ok"]);
  assert.equal(calls, 2);
});

test("malformed JSON is not retried or reported as an empty list", async (t) => {
  let calls = 0;
  fakeFetch(t, async () => { calls++; return new Response("{invalid"); });
  await assert.rejects(readPublicJson("https://catalogue.test/products", fast), { code: "invalid-response" });
  assert.equal(calls, 1);
});

test("non-array catalogue shape fails validation without retrying", async (t) => {
  let calls = 0;
  fakeFetch(t, async () => { calls++; return json({ error: "not a catalogue" }); });
  await assert.rejects(readPublicJson("https://catalogue.test/products", { ...fast, validate: Array.isArray }), { code: "invalid-response" });
  assert.equal(calls, 1);
});

test("a stuck response body is aborted, not just a slow header response", async (t) => {
  const base = await localServer(t, (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write("["); // Intentionally never finish the JSON body.
  });
  const start = performance.now();
  await assert.rejects(readPublicJson(`${base}/body`, {
    totalTimeoutMs: 120, attemptTimeoutMs: 80, maxAttempts: 1,
  }), { code: "timeout" });
  assert.ok(performance.now() - start < 700, "body decoding must have a deadline");
});

test("slow response headers are aborted", async (t) => {
  const base = await localServer(t, () => {});
  const start = performance.now();
  await assert.rejects(readPublicJson(`${base}/headers`, {
    totalTimeoutMs: 100, attemptTimeoutMs: 60, maxAttempts: 1,
  }), { code: "timeout" });
  assert.ok(performance.now() - start < 700);
});

test("deadline survives a fetch adapter that ignores abort", async (t) => {
  let signal;
  fakeFetch(t, async (_url, options) => { signal = options.signal; return new Promise(() => {}); });
  await assert.rejects(readPublicJson("https://catalogue.test/stuck", {
    totalTimeoutMs: 70, attemptTimeoutMs: 40, maxAttempts: 1,
  }), { code: "timeout" });
  assert.equal(signal.aborted, true);
});

test("retry attempts share one total time budget", async (t) => {
  let calls = 0;
  fakeFetch(t, async () => { calls++; return new Promise(() => {}); });
  const start = performance.now();
  await assert.rejects(readPublicJson("https://catalogue.test/stuck", {
    totalTimeoutMs: 90, attemptTimeoutMs: 65, maxAttempts: 15, retryDelayMs: 1,
  }), { code: "timeout" });
  assert.ok(performance.now() - start < 450);
  assert.ok(calls <= 2, `unexpected retry count: ${calls}`);
});

test("invalid budgets are rejected before requesting", async (t) => {
  let calls = 0;
  fakeFetch(t, async () => { calls++; return json([]); });
  for (const opts of [{ totalTimeoutMs: 0 }, { maxAttempts: 0 }, { attemptTimeoutMs: NaN }, { retryDelayMs: -1 }]) {
    await assert.rejects(readPublicJson("https://catalogue.test/products", opts), RangeError);
  }
  assert.equal(calls, 0);
});

test("featured-products failures propagate to the homepage failure state", async (t) => {
  quietErrors(t);
  fakeFetch(t, async () => json({}, 403));
  await assert.rejects(api.getFeaturedProducts(), (error) => error instanceof PublicReadError && error.status === 403);
});

test("featured-products success and server-side limit are preserved", async (t) => {
  fakeFetch(t, async (url) => {
    assert.equal(new URL(url).searchParams.get("limit"), "4");
    return json(products.slice(0, 4));
  });
  assert.deepEqual(await api.getFeaturedProducts(), products.slice(0, 4));
});

test("existing full-catalogue callers retain their current failure contract", async (t) => {
  quietErrors(t);
  fakeFetch(t, async () => json({}, 403));
  assert.deepEqual(await api.getProducts(), []);
});

test("a successful related response avoids any fallback query", async (t) => {
  let calls = 0;
  fakeFetch(t, async () => { calls++; return json(products.slice(1)); });
  assert.deepEqual(await api.getRelatedProducts("current"), products.slice(1));
  assert.equal(calls, 1);
});

test("empty related response uses a bounded fallback and excludes the current product", async (t) => {
  const urls = [];
  fakeFetch(t, async (url) => {
    urls.push(new URL(url));
    return json(urls.length === 1 ? [] : products);
  });
  assert.deepEqual(await api.getRelatedProducts("current", 4), products.slice(1));
  assert.equal(urls.length, 2);
  assert.equal(urls[1].pathname, "/v1/products");
  assert.equal(urls[1].searchParams.get("limit"), "5");
});

test("missing legacy related endpoint can use the bounded fallback", async (t) => {
  quietErrors(t);
  let calls = 0;
  fakeFetch(t, async () => ++calls === 1 ? json({}, 404) : json(products));
  assert.deepEqual(await api.getRelatedProducts("current", 4), products.slice(1));
  assert.equal(calls, 2);
});

test("related-service outage does not trigger a full catalogue request", async (t) => {
  quietErrors(t);
  const urls = [];
  fakeFetch(t, async (url) => { urls.push(url); return json({}, 503); });
  assert.deepEqual(await api.getRelatedProducts("current"), []);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.includes("/current/related")));
});

test("rate-limited recommendations do not retry or fall back", async (t) => {
  quietErrors(t);
  let calls = 0;
  fakeFetch(t, async () => { calls++; return json({}, 429); });
  assert.deepEqual(await api.getRelatedProducts("current"), []);
  assert.equal(calls, 1);
});

test("homepage source has a synchronous shell and a local Suspense boundary", async () => {
  const source = await readFile(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /export default function Home\(\)/);
  const home = source.slice(source.indexOf("export default function Home()"));
  assert.doesNotMatch(home, /await\s+getFeaturedProducts/);
  assert.match(home, /<Suspense fallback=\{<FeaturedProductsLoading \/>\}>\s*<FeaturedProducts \/>\s*<\/Suspense>/);
  assert.match(source, /aria-busy="true"/);
  assert.match(source, /We couldn&apos;t load the HIDI Edit/);
  assert.match(source, /hidi-hero-green-garden-fullbody\.webp/);
  assert.match(source, /\bpriority\b/);
});

test("API controller passes an optional bounded limit and preserves the unbounded default", async () => {
  const source = await readFile(new URL("../apps/api/src/products/products.controller.ts", import.meta.url), "utf8");
  assert.match(source, /@Query\("limit"\) rawLimit\?: string/);
  // Execute the unchanged JavaScript body of the controller method, without
  // loading Nest decorators; full framework compilation belongs to CI.
  const start = source.indexOf("    const parsedLimit =");
  const end = source.indexOf("\n  }", start);
  const list = new Function("category", "rawLimit", source.slice(start, end));
  const target = { products: { listPublished: (category, limit) => ({ category, limit }) } };
  for (const [raw, expected] of [[undefined, undefined], ["5", 5], ["100", 24], ["0", 1], ["bad", undefined], ["3.2", undefined]]) {
    assert.deepEqual(list.call(target, "work-edit", raw), { category: "work-edit", limit: expected });
  }
});
