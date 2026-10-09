import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const runtime = fileURLToPath(new URL("./server.mjs", import.meta.url));
let folder;
let fixture;
let apiFixture;
let proxy;
let unavailable;
let healthy = true;
let collectionPerfHits = 0;
const processes = [];

function send(base, path, options = {}) {
  return new Promise((resolve, reject) => {
    const destination = new URL(base);
    const outgoing = request({ hostname: destination.hostname, port: destination.port,
      method: options.method || "GET", path, headers: options.headers }, incoming => {
      const chunks = [];
      incoming.on("data", chunk => chunks.push(chunk));
      incoming.on("end", () => resolve({ status: incoming.statusCode,
        headers: incoming.headers, body: Buffer.concat(chunks).toString() }));
      incoming.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end(options.body);
  });
}

async function launch(extra = {}) {
  const child = spawn(process.execPath, [runtime], {
    cwd: folder,
    env: { ...process.env, PORT: "0", LANDING_DIST_DIR: join(folder, "dist"),
      STOREFRONT_SERVER_PATH: join(folder, "missing-server.js"), ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.push(child);
  let output = "";
  let stderr = "";
  child.stderr.on("data", data => { stderr += data; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Runtime startup timed out: ${stderr}`)), 5000);
    child.stdout.on("data", data => {
      output += data;
      const match = /listening on (\d+)/.exec(output);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.once("exit", code => { clearTimeout(timeout); reject(new Error(`Runtime exited ${code}: ${stderr}`)); });
  });
  return { child, url, stderr: () => stderr };
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  folder = await mkdtemp(join(tmpdir(), "hidi-combined-runtime-"));
  await mkdir(join(folder, "dist/assets/video"), { recursive: true });
  await mkdir(join(folder, "dist/api"), { recursive: true });
  await mkdir(join(folder, "dist/_next"), { recursive: true });
  await writeFile(join(folder, "dist/index.html"), "<h1>Original landing</h1>");
  await writeFile(join(folder, "dist/hero-control.html"), "<h1>Hero Media Control</h1>");
  await writeFile(join(folder, "dist/landing-media-control.html"), "<h1>Landing Media Control</h1>");
  await writeFile(join(folder, "dist/assets/video/hero.mp4"), "0123456789abcdefghij");
  await writeFile(join(folder, "dist/assets/app-abcdefgh.js"), "console.log('landing');");
  await writeFile(join(folder, "dist/api/collision"), "wrong API static response");
  await writeFile(join(folder, "dist/_next/collision"), "wrong Next static response");
  await writeFile(join(folder, "secret.txt"), "never public");
  await symlink(join(folder, "secret.txt"), join(folder, "dist/escape.txt"));

  fixture = createServer(async (incoming, response) => {
    if (incoming.url === "/healthz") {
      response.writeHead(healthy ? 200 : 503).end(healthy ? "ready" : "not ready");
      return;
    }
    if (incoming.url === "/account/deep/missing") {
      response.writeHead(404).end("Storefront route not found");
      return;
    }
    if (incoming.url === "/account/redirect") {
      response.writeHead(307, { Location: "https://thidigk.thehidi.com/account" }).end();
      return;
    }
    if (incoming.url === "/admin" || incoming.url === "/admin/products") {
      const body = "<!doctype html><html><body><nav>Admin Portal</nav><main>Products</main></body></html>";
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        ETag: '"admin-fixture"',
      });
      response.end(body);
      return;
    }
    if (incoming.url === "/products/demo") {
      const body = '<!doctype html><html><head><link rel="canonical" href="https://thidigk.thehidi.com/products/demo"><meta property="og:url" content="https://thidigk.thehidi.com/products/demo"><meta name="robots" content="index, follow"></head><body><main>Demo product</main></body></html>';
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Server": "unit-storefront",
        "X-Powered-By": "unit-framework",
      });
      response.end(body);
      return;
    }
    if (incoming.url === "/collections/perf") {
      collectionPerfHits += 1;
      const body = '<!doctype html><html><head><title>Perf collection</title></head><body><main>Collection</main></body></html>';
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      response.end(body);
      return;
    }
    if (incoming.url === "/sitemap.xml") {
      const body = '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://thidigk.thehidi.com/</loc></url><url><loc>https://thidigk.thehidi.com/products/demo</loc></url></urlset>';
      response.writeHead(200, {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      response.end(body);
      return;
    }
    if (incoming.url === "/api/stream") {
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      response.write("data: first\n\n");
      setTimeout(() => response.end("data: second\n\n"), 100);
      return;
    }
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    response.writeHead(incoming.method === "POST" ? 201 : 200, {
      "Content-Type": "application/json",
      "Set-Cookie": ["session=fixture; Path=/; Secure; HttpOnly", "csrf=fixture; Path=/; SameSite=Lax"],
    });
    response.end(JSON.stringify({ url: incoming.url, method: incoming.method,
      headers: incoming.headers, body: Buffer.concat(chunks).toString() }));
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");

  apiFixture = createServer(async (incoming, response) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      url: incoming.url,
      method: incoming.method,
      headers: incoming.headers,
      body: Buffer.concat(chunks).toString(),
    }));
  });
  apiFixture.listen(0, "127.0.0.1");
  await once(apiFixture, "listening");

  proxy = await launch({
    STOREFRONT_ORIGIN: `http://127.0.0.1:${fixture.address().port}`,
    INTERNAL_API_URL: `http://127.0.0.1:${apiFixture.address().port}/v1`,
  });
  unavailable = await launch({ STOREFRONT_ORIGIN: "" });
});

after(async () => {
  await Promise.all(processes.map(async child => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }));
  if (fixture) await new Promise(resolve => fixture.close(resolve));
  if (apiFixture) await new Promise(resolve => apiFixture.close(resolve));
  if (folder) await rm(folder, { recursive: true, force: true });
});

test("landing root and files retain range and cache semantics", async () => {
  const root = await send(proxy.url, "/?campaign=launch");
  assert.equal(root.status, 200);
  assert.match(root.body, /<h1>Original landing<\/h1>/);
  assert.match(root.body, /rel="canonical" href="https:\/\/thehidi\.com\//);
  assert.match(root.body, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.equal(root.headers["x-robots-tag"], "noindex, nofollow, noarchive");
  assert.equal(root.headers["cache-control"], "no-cache");
  const head = await send(proxy.url, "/", { method: "HEAD" });
  assert.equal(head.body, "");
  assert.equal(head.headers["content-length"], String(Buffer.byteLength(root.body)));
  const video = await send(proxy.url, "/assets/video/hero.mp4", { headers: { Range: "bytes=2-5" } });
  assert.equal(video.status, 206);
  assert.equal(video.body, "2345");
  assert.equal(video.headers["content-range"], "bytes 2-5/20");
  const suffix = await send(proxy.url, "/assets/video/hero.mp4", { headers: { Range: "bytes=-3" } });
  assert.equal(suffix.body, "hij");
  assert.equal(suffix.status, 206);
  assert.equal((await send(proxy.url, "/assets/video/hero.mp4", { headers: { Range: "bytes=99-" } })).status, 416);
  assert.equal((await send(proxy.url, "/assets/video/hero.mp4", { headers: { "If-None-Match": video.headers.etag } })).status, 304);
  const bundle = await send(proxy.url, "/assets/app-abcdefgh.js");
  assert.equal(bundle.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal((await send(proxy.url, "/assets/missing.mp4")).status, 404);
});

test("same-size reproducible builds have distinct ETags and never reuse zero-mtime date validators", async () => {
  const oldRoot = join(folder, "old-build");
  const newRoot = join(folder, "new-build");
  await mkdir(oldRoot);
  await mkdir(join(newRoot, "assets/video"), { recursive: true });
  const oldHtml = "<h1>Original landing</h1>";
  const newHtml = "<h1>Replaced landing</h1>";
  assert.equal(Buffer.byteLength(oldHtml), Buffer.byteLength(newHtml));
  await writeFile(join(oldRoot, "index.html"), oldHtml);
  await writeFile(join(newRoot, "index.html"), newHtml);
  await writeFile(join(newRoot, "assets/video/hero.mp4"), "0123456789abcdefghij");
  for (const file of [join(oldRoot, "index.html"), join(newRoot, "index.html"), join(newRoot, "assets/video/hero.mp4")]) {
    await utimes(file, 0, 0);
  }
  const upstream = `http://127.0.0.1:${fixture.address().port}`;
  const oldBuild = await launch({ LANDING_DIST_DIR: oldRoot, STOREFRONT_ORIGIN: upstream });
  const newBuild = await launch({ LANDING_DIST_DIR: newRoot, STOREFRONT_ORIGIN: upstream });
  const previous = await send(oldBuild.url, "/");
  const updated = await send(newBuild.url, "/", { headers: { "If-None-Match": previous.headers.etag } });
  assert.equal(updated.status, 200);
  assert.match(updated.body, /<h1>Replaced landing<\/h1>/);
  assert.match(updated.body, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.notEqual(previous.headers.etag, updated.headers.etag);
  assert.equal(updated.headers["last-modified"], undefined);
  assert.equal((await send(newBuild.url, "/", { headers: { "If-None-Match": updated.headers.etag } })).status, 304);
  assert.equal((await send(newBuild.url, "/", { headers: { "If-Modified-Since": "Thu, 01 Jan 1970 00:00:00 GMT" } })).status, 200);
  const datedRange = await send(newBuild.url, "/assets/video/hero.mp4", {
    headers: { Range: "bytes=2-5", "If-Range": "Thu, 01 Jan 1970 00:00:00 GMT" },
  });
  assert.equal(datedRange.status, 200);
  assert.equal(datedRange.body, "0123456789abcdefghij");
  const taggedRange = await send(newBuild.url, "/assets/video/hero.mp4", {
    headers: { Range: "bytes=2-5", "If-Range": datedRange.headers.etag },
  });
  assert.equal(taggedRange.status, 206);
  assert.equal(taggedRange.body, "2345");
});

test("commerce routes preserve method, raw URL, body, cookies and original HTTPS host", async () => {
  const body = '{"mobile":"9000000000"}';
  const response = await send(proxy.url, "/api/store/session?return=%2Fcheckout&x=one&x=two", {
    method: "POST", body, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
      Host: "thidigk.thehidi.com", "X-Forwarded-Proto": "https", Cookie: "hidi-session=old; csrf=test",
      "X-Request-Id": "flow-1", Connection: "keep-alive, x-hop-test", "X-Hop-Test": "remove-me" },
  });
  const received = JSON.parse(response.body);
  assert.equal(response.status, 201);
  assert.equal(received.url, "/api/store/session?return=%2Fcheckout&x=one&x=two");
  assert.equal(received.method, "POST");
  assert.equal(received.body, body);
  assert.equal(received.headers.cookie, "hidi-session=old; csrf=test");
  assert.equal(received.headers.host, "thidigk.thehidi.com");
  assert.equal(received.headers["x-forwarded-host"], "thidigk.thehidi.com");
  assert.equal(received.headers["x-forwarded-proto"], "https");
  assert.equal(received.headers["x-request-id"], "flow-1");
  assert.equal(received.headers["x-hop-test"], undefined);
  assert.deepEqual(response.headers["set-cookie"], ["session=fixture; Path=/; Secure; HttpOnly", "csrf=fixture; Path=/; SameSite=Lax"]);
});

test("provider webhooks on /v1 proxy directly to the API with signatures and raw body", async () => {
  const getWebhook = await send(proxy.url, "/v1/payments/razorpay/webhook");
  assert.equal(getWebhook.status, 405);
  assert.equal(getWebhook.headers.allow, "POST");
  assert.match(getWebhook.body, /POST only/);

  const body = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}';
  const response = await send(proxy.url, "/v1/payments/razorpay/webhook?attempt=1", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      Host: "thidigk.thehidi.com",
      "X-Forwarded-Proto": "https",
      "X-Razorpay-Signature": "signed-body",
      Connection: "keep-alive, x-hop-test",
      "X-Hop-Test": "remove-me",
    },
  });
  const received = JSON.parse(response.body);
  assert.equal(response.status, 202);
  assert.equal(received.url, "/v1/payments/razorpay/webhook?attempt=1");
  assert.equal(received.method, "POST");
  assert.equal(received.body, body);
  assert.equal(received.headers["x-razorpay-signature"], "signed-body");
  assert.equal(received.headers["x-forwarded-host"], "thidigk.thehidi.com");
  assert.equal(received.headers["x-forwarded-proto"], "https");
  assert.equal(received.headers["x-hop-test"], undefined);
  assert.equal(received.headers.host, `127.0.0.1:${apiFixture.address().port}`);
});

test("media control routes stay on the landing runtime and public media config safely falls back", async () => {
  const control = await send(proxy.url, "/admin/hero-media");
  assert.equal(control.status, 200);
  assert.match(control.body, /Hero Media Control/);
  const landingControl = await send(proxy.url, "/admin/landing-media");
  assert.equal(landingControl.status, 200);
  assert.match(landingControl.body, /Landing Media Control/);
  const config = await send(proxy.url, "/api/hidi/hero-config");
  assert.equal(config.status, 200);
  assert.equal(config.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(config.body).active, false);
  const landingConfig = await send(proxy.url, "/api/hidi/landing-media-config");
  assert.equal(landingConfig.status, 200);
  assert.equal(landingConfig.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(landingConfig.body).slots["range-occasion"].active, false);
});

test("preview stays noindex while production requests receive canonical SEO metadata", async () => {
  const preview = await send(proxy.url, "/products/demo", { headers: { Host: "thidigk.thehidi.com" } });
  assert.equal(preview.status, 200);
  assert.match(preview.headers["x-robots-tag"], /noindex/);
  assert.match(preview.body, /rel="canonical" href="https:\/\/thehidi\.com\/products\/demo"/);
  assert.match(preview.body, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(preview.body, /src="\/hidi-analytics\.js"/);
  assert.doesNotMatch(preview.body, /canonical" href="https:\/\/thidigk/);

  const production = await send(proxy.url, "/products/demo", { headers: { Host: "thehidi.com" } });
  assert.equal(production.status, 200);
  assert.equal(production.headers["x-robots-tag"], undefined);
  assert.match(production.body, /rel="canonical" href="https:\/\/thehidi\.com\/products\/demo"/);
  assert.match(production.body, /name="robots" content="index, follow/);
});

test("robots and sitemap isolate preview while publishing production URLs", async () => {
  const previewRobots = await send(proxy.url, "/robots.txt", { headers: { Host: "thidigk.thehidi.com" } });
  assert.equal(previewRobots.status, 200);
  assert.match(previewRobots.body, /Disallow: \/$/m);
  assert.equal((await send(proxy.url, "/sitemap.xml", { headers: { Host: "thidigk.thehidi.com" } })).status, 404);

  const productionRobots = await send(proxy.url, "/robots.txt", { headers: { Host: "thehidi.com" } });
  assert.equal(productionRobots.status, 200);
  assert.match(productionRobots.body, /Sitemap: https:\/\/thehidi\.com\/sitemap\.xml/);
  assert.match(productionRobots.body, /Disallow: \/checkout/);

  const sitemap = await send(proxy.url, "/sitemap.xml", { headers: { Host: "thehidi.com" } });
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.body, /<loc>https:\/\/thehidi\.com\/products\/demo<\/loc>/);
  assert.doesNotMatch(sitemap.body, /thidigk\.thehidi\.com/);
});

test("analytics configuration is public-safe and disabled on preview", async () => {
  const preview = await send(proxy.url, "/api/hidi/analytics-config", { headers: { Host: "thidigk.thehidi.com" } });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(preview.body).enabled, false);
});

test("security headers protect storefront pages and private routes do not cache", async () => {
  const publicPage = await send(proxy.url, "/products/demo", {
    headers: {
      Host: "thehidi.com",
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(publicPage.status, 200);
  assert.equal(publicPage.headers["x-content-type-options"], "nosniff");
  assert.equal(publicPage.headers["x-frame-options"], "DENY");
  assert.equal(publicPage.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.match(publicPage.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(publicPage.headers["x-permitted-cross-domain-policies"], "none");
  assert.equal(publicPage.headers["strict-transport-security"], "max-age=31536000");
  assert.equal(publicPage.headers.server, undefined);
  assert.equal(publicPage.headers["x-powered-by"], undefined);
  assert.notEqual(publicPage.headers["cache-control"], "no-store, max-age=0");

  const privatePage = await send(proxy.url, "/api/admin/session", {
    headers: {
      Host: "thehidi.com",
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(privatePage.status, 200);
  assert.equal(privatePage.headers["cache-control"], "no-store, max-age=0");
  assert.equal(privatePage.headers.pragma, "no-cache");
  assert.equal(privatePage.headers["x-frame-options"], "DENY");

  const checkoutPayload = "{}";
  const checkoutApi = await send(proxy.url, "/v1/checkout/prepare", {
    method: "POST",
    body: checkoutPayload,
    headers: {
      Host: "thehidi.com",
      "X-Forwarded-Proto": "https",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(checkoutPayload),
    },
  });
  assert.equal(checkoutApi.status, 202);
  assert.equal(checkoutApi.headers["cache-control"], "no-store, max-age=0");
  assert.equal(checkoutApi.headers["strict-transport-security"], "max-age=31536000");
});

test("static landing HTML receives the same anti-framing and HTTPS headers", async () => {
  const landing = await send(proxy.url, "/", {
    headers: {
      Host: "thehidi.com",
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(landing.status, 200);
  assert.equal(landing.headers["x-frame-options"], "DENY");
  assert.match(landing.headers["content-security-policy"], /object-src 'none'/);
  assert.equal(landing.headers["strict-transport-security"], "max-age=31536000");
});

test("Search Console verification is injected only for production when configured", async () => {
  const verified = await launch({
    STOREFRONT_ORIGIN: `http://127.0.0.1:${fixture.address().port}`,
    GOOGLE_SITE_VERIFICATION: "google-verification-token_1234567890",
  });
  const production = await send(verified.url, "/products/demo", { headers: { Host: "thehidi.com" } });
  assert.match(production.body, /name="google-site-verification"/);
  assert.match(production.body, /google-verification-token_1234567890/);
  const preview = await send(verified.url, "/products/demo", { headers: { Host: "thidigk.thehidi.com" } });
  assert.doesNotMatch(preview.body, /google-site-verification/);
  const productionHome = await send(verified.url, "/", { headers: { Host: "thehidi.com" } });
  assert.match(productionHome.body, /name="google-site-verification"/);
  assert.match(productionHome.body, /google-verification-token_1234567890/);
  assert.doesNotMatch(productionHome.body, /noindex, nofollow/);
});

test("anonymous collection HTML uses a short in-process cache and cookie requests bypass it", async () => {
  collectionPerfHits = 0;
  const first = await send(proxy.url, "/collections/perf", { headers: { Host: "thidigk.thehidi.com" } });
  assert.equal(first.status, 200);
  assert.equal(first.headers["x-hidi-cache"], "MISS");
  const second = await send(proxy.url, "/collections/perf", { headers: { Host: "thidigk.thehidi.com" } });
  assert.equal(second.status, 200);
  assert.equal(second.headers["x-hidi-cache"], "HIT");
  assert.equal(collectionPerfHits, 1);

  const personalised = await send(proxy.url, "/collections/perf", {
    headers: { Host: "thidigk.thehidi.com", Cookie: "hidi-session=customer" },
  });
  assert.equal(personalised.status, 200);
  assert.equal(personalised.headers["x-hidi-cache"], undefined);
  assert.equal(collectionPerfHits, 2);
});

test("proxied admin portal pages expose the landing media control link", async () => {
  const admin = await send(proxy.url, "/admin/products", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(admin.status, 200);
  assert.match(admin.body, /Admin Portal/);
  assert.match(admin.body, /data-hidi-landing-media-link="true"/);
  const script = admin.body.match(/<script data-hidi-landing-media-link="true">([\s\S]*?)<\/script>/)?.[1];
  assert(script, "Admin navigation enhancement is present");
  const links = [];
  const nav = {
    querySelector(selector) { return links.find(link => selector.includes(`"${link.dataset.hidiAdminTab}"`)); },
    appendChild(link) { links.push(link); },
  };
  let observe;
  runInNewContext(script, {
    document: { readyState: "complete", documentElement: {}, querySelector: () => nav, createElement: () => ({ dataset: {} }) },
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {} },
  });
  observe();
  assert.deepEqual(links.map(link => [link.href, link.textContent]), [
    ["/admin/landing-media", "Media Upload"], ["/admin/packing-scanner", "Packing Scanner"],
  ]);
  assert.equal(admin.headers.etag, undefined);
  assert.equal(admin.headers["content-length"], String(Buffer.byteLength(admin.body)));

  const api = await send(proxy.url, "/api/admin/session");
  assert.equal(api.status, 200);
  assert.doesNotMatch(api.body, /data-hidi-landing-media-link/);
});

test("hero media stores uploads and live config in Azure Blob with managed identity", async () => {
  const tokenRequests = [];
  const blobRequests = [];
  const blobs = new Map();

  const identity = createServer((incoming, response) => {
    tokenRequests.push({ url: incoming.url, headers: incoming.headers });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      access_token: "unit-managed-identity-token",
      expires_on: String(Math.floor(Date.now() / 1000) + 3600),
    }));
  });

  const blob = createServer(async (incoming, response) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    blobRequests.push({ method: incoming.method, url: incoming.url, headers: incoming.headers, body });

    if (incoming.headers.authorization !== "Bearer unit-managed-identity-token") {
      response.writeHead(401).end("missing bearer");
      return;
    }

    if (incoming.method === "GET" || incoming.method === "HEAD") {
      const saved = blobs.get(incoming.url);
      if (!saved) {
        response.writeHead(404).end("missing");
        return;
      }
      const range = incoming.headers.range || incoming.headers["x-ms-range"];
      const match = /^bytes=(\d*)-(\d*)$/.exec(range || "");
      let status = 200;
      let body = saved.body;
      const headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": saved.headers["x-ms-blob-content-type"] || "application/octet-stream",
      };
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : saved.body.length - 1;
        body = saved.body.subarray(start, end + 1);
        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${saved.body.length}`;
      }
      headers["Content-Length"] = body.length;
      response.writeHead(status, headers);
      response.end(incoming.method === "HEAD" ? undefined : body);
      return;
    }

    if (incoming.method === "PUT") {
      blobs.set(incoming.url, { headers: incoming.headers, body });
      response.writeHead(201).end();
      return;
    }

    response.writeHead(405).end();
  });

  const identityUrl = await listen(identity);
  const blobUrl = await listen(blob);
  try {
    const azure = await launch({
      STOREFRONT_ORIGIN: `http://127.0.0.1:${fixture.address().port}`,
      MEDIA_STORAGE_PROVIDER: "azure",
      AZURE_STORAGE_ACCOUNT: "unitstore",
      AZURE_STORAGE_CONTAINER: "hero",
      AZURE_CLIENT_ID: "client-id-123",
      MEDIA_PUBLIC_BASE_URL: "/api/hidi/hero-asset",
      AZURE_IMDS_ENDPOINT: `${identityUrl}/metadata/identity/oauth2/token`,
      AZURE_STORAGE_BLOB_ENDPOINT: blobUrl,
    });

    const media = Buffer.from("hero image bytes");
    const uploaded = await send(azure.url, "/api/hidi/hero-upload", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "Content-Length": media.length,
        "X-HIDI-Filename": encodeURIComponent("Launch Banner.png"),
        Cookie: "session=fixture",
      },
      body: media,
    });
    assert.equal(uploaded.status, 201, uploaded.body);
    const asset = JSON.parse(uploaded.body).asset;
    assert.equal(asset.type, "image");
    assert.equal(asset.mimeType, "image/png");
    assert.equal(asset.originalName, "Launch Banner.png");
    assert.match(asset.url, /^\/api\/hidi\/hero-asset\/brand\/hero\/media\/\d{8}\/.+\.png$/);
    assert.match(asset.storagePath, /^azure:\/\/unitstore\/hero\/brand\/hero\/media\/\d{8}\/.+\.png$/);

    const mediaPath = new URL(asset.url, azure.url).pathname.replace("/api/hidi/hero-asset", "");
    assert.equal(blobs.get(`/hero${mediaPath}`).body.toString(), "hero image bytes");
    assert.equal(blobs.get(`/hero${mediaPath}`).headers["x-ms-blob-content-type"], "image/png");

    const proxied = await send(azure.url, asset.url);
    assert.equal(proxied.status, 200);
    assert.equal(proxied.headers["content-type"], "image/png");
    assert.equal(proxied.body, "hero image bytes");

    const ranged = await send(azure.url, asset.url, { headers: { Range: "bytes=0-3" } });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers["content-range"], "bytes 0-3/16");
    assert.equal(ranged.body, "hero");

    const library = await send(azure.url, "/api/hidi/hero-library");
    assert.equal(library.status, 200, library.body);
    assert.equal(JSON.parse(library.body).assets[0].id, asset.id);

    const publishBody = JSON.stringify({
      assetId: asset.id,
      desktopPosition: "38% 42%",
      mobilePosition: "51% 24%",
    });
    const published = await send(azure.url, "/api/hidi/hero-publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(publishBody),
        Cookie: "session=fixture",
      },
      body: publishBody,
    });
    assert.equal(published.status, 200, published.body);
    assert.equal(JSON.parse(published.body).current.desktopPosition, "38% 42%");

    const config = await send(azure.url, "/api/hidi/hero-config");
    assert.equal(config.status, 200);
    const live = JSON.parse(config.body);
    assert.equal(live.active, true);
    assert.equal(live.assetId, asset.id);
    assert.equal(live.mobilePosition, "51% 24%");

    const landingMedia = Buffer.from("landing image bytes");
    const landingUploaded = await send(azure.url, "/api/hidi/landing-media-upload", {
      method: "POST",
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": landingMedia.length,
        "X-HIDI-Filename": encodeURIComponent("Range Occasion.webp"),
        Cookie: "session=fixture",
      },
      body: landingMedia,
    });
    assert.equal(landingUploaded.status, 201, landingUploaded.body);
    const landingAsset = JSON.parse(landingUploaded.body).asset;
    assert.equal(landingAsset.type, "image");
    assert.match(landingAsset.url, /^\/api\/hidi\/hero-asset\/brand\/landing-media\/media\/\d{8}\/.+\.webp$/);
    assert.match(landingAsset.storagePath, /^azure:\/\/unitstore\/hero\/brand\/landing-media\/media\/\d{8}\/.+\.webp$/);

    const landingMediaPath = new URL(landingAsset.url, azure.url).pathname.replace("/api/hidi/hero-asset", "");
    assert.equal(blobs.get(`/hero${landingMediaPath}`).body.toString(), "landing image bytes");
    assert.equal((await send(azure.url, landingAsset.url)).body, "landing image bytes");

    const landingPublishBody = JSON.stringify({
      slotId: "range-occasion",
      assetId: landingAsset.id,
      desktopPosition: "42% 38%",
      mobilePosition: "50% 22%",
      fitMode: "contain",
      altText: "Orange range card",
    });
    const landingPublished = await send(azure.url, "/api/hidi/landing-media-publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(landingPublishBody),
        Cookie: "session=fixture",
      },
      body: landingPublishBody,
    });
    assert.equal(landingPublished.status, 200, landingPublished.body);

    const landingLive = await send(azure.url, "/api/hidi/landing-media-config");
    assert.equal(landingLive.status, 200);
    const liveSlot = JSON.parse(landingLive.body).slots["range-occasion"];
    assert.equal(liveSlot.active, true);
    assert.equal(liveSlot.assetId, landingAsset.id);
    assert.equal(liveSlot.fitMode, "contain");
    assert.equal(liveSlot.altText, "Orange range card");

    const post = async (path, value) => {
      const body=JSON.stringify(value);
      return send(azure.url,path,{method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body),Cookie:"session=fixture"},body});
    };
    const upload = async (path, mime, name) => {
      const result=await send(azure.url,path,{method:"POST",headers:{"Content-Type":mime,"X-HIDI-Filename":encodeURIComponent(name),Cookie:"session=fixture"},body:Buffer.from(name)});
      assert.equal(result.status,201,result.body);return JSON.parse(result.body).asset;
    };
    const secondHero=await upload("/api/hidi/hero-upload","video/mp4","Second hero.mp4");
    const heroList={items:[{assetId:secondHero.id,desktopPosition:"38% 42%",mobilePosition:"66% 50%"},{assetId:asset.id,desktopPosition:"50% 22%"}],autoPlay:false,intervalSeconds:3};
    assert.equal((await post("/api/hidi/hero-publish",heroList)).status,200);
    const publishedList=JSON.parse((await send(azure.url,"/api/hidi/hero-config")).body);
    assert.deepEqual(publishedList.items.map(item=>item.assetId),[secondHero.id,asset.id]);
    assert.equal(publishedList.type,"video");assert.equal(publishedList.url,secondHero.url);
    assert.equal(publishedList.autoPlay,false);assert.equal(publishedList.items[1].desktopPosition,"50% 22%");
    for(const items of [[],Array(21).fill({assetId:asset.id}),[{assetId:asset.id},{assetId:asset.id}],[{assetId:"unknown"}]]) {
      const rejected=await post("/api/hidi/hero-publish",{items});assert.equal(rejected.status,400,rejected.body);
      assert.deepEqual(JSON.parse((await send(azure.url,"/api/hidi/hero-config")).body),publishedList);
    }
    assert.equal((await post("/api/hidi/hero-reset",{})).status,200);
    assert.equal(JSON.parse((await send(azure.url,"/api/hidi/hero-config")).body).active,false);
    assert.equal((await post("/api/hidi/hero-restore",{})).status,200);
    assert.deepEqual(JSON.parse((await send(azure.url,"/api/hidi/hero-config")).body).items,publishedList.items);

    // Migrate the existing single photo only when an admin publishes a new list.
    assert.equal((await post("/api/hidi/landing-media-publish",{slotId:"ananya-green",assetId:landingAsset.id,desktopPosition:"58% 38%"})).status,200);
    const photos=[landingAsset];
    for(let i=2;i<=5;i++) photos.push(await upload("/api/hidi/landing-media-upload","image/webp",`Ananya ${i}.webp`));
    const photoOrder=[photos[4],photos[0],photos[2],photos[1],photos[3]];
    const ananyaList={items:photoOrder.map((item,index)=>({assetId:item.id,desktopPosition:index===0?"101% 120%":"58% 38%",mobilePosition:"66% 50%",fitMode:index===1?"contain":"cover",altText:`Ananya full outfit ${index+1}`})),autoPlay:true,intervalSeconds:999};
    assert.equal((await post("/api/hidi/landing-media-ananya-publish",ananyaList)).status,200);
    const listConfig=JSON.parse((await send(azure.url,"/api/hidi/landing-media-config")).body);
    assert.deepEqual(listConfig.ananya.items.map(item=>item.assetId),photoOrder.map(item=>item.id));
    assert.equal(listConfig.ananya.items[0].desktopPosition,"100% 100%");
    assert.equal(listConfig.ananya.items[1].fitMode,"contain");assert.equal(listConfig.ananya.intervalSeconds,30);
    assert.equal(listConfig.slots["range-occasion"].assetId,landingAsset.id);
    assert(!JSON.stringify(listConfig.ananya).includes("storagePath"),"Public config excludes private storage details");
    assert.equal((await post("/api/hidi/landing-media-ananya-publish",{items:[{assetId:asset.id}]})).status,400,"Hero library cannot be used as Ananya photos");
    assert.equal((await post("/api/hidi/landing-media-publish",{slotId:"range-occasion",assetId:photos[1].id})).status,200);
    assert.deepEqual(JSON.parse((await send(azure.url,"/api/hidi/landing-media-config")).body).ananya,listConfig.ananya,"Editing another slot preserves the photo list");
    assert.equal((await post("/api/hidi/landing-media-restore",{slotId:"range-occasion"})).status,200);
    assert.deepEqual(JSON.parse((await send(azure.url,"/api/hidi/landing-media-config")).body).ananya,listConfig.ananya,"Restoring another slot preserves the photo list");
    assert.equal((await post("/api/hidi/landing-media-ananya-restore",{})).status,200);
    const restoredLegacy=JSON.parse((await send(azure.url,"/api/hidi/landing-media-config")).body);
    assert.deepEqual(restoredLegacy.ananya.items.map(item=>item.assetId),[landingAsset.id],"Previous single photo is restorable");
    assert.equal((await post("/api/hidi/landing-media-ananya-restore",{})).status,200);
    assert.deepEqual(JSON.parse((await send(azure.url,"/api/hidi/landing-media-config")).body).ananya.items,listConfig.ananya.items);
    assert.equal((await post("/api/hidi/landing-media-ananya-reset",{})).status,200);
    assert.equal(JSON.parse((await send(azure.url,"/api/hidi/landing-media-config")).body).ananya.active,false);
    assert.equal((await post("/api/hidi/landing-media-ananya-restore",{})).status,200);
    assert.deepEqual(JSON.parse((await send(azure.url,"/api/hidi/landing-media-config")).body).ananya.items,listConfig.ananya.items);

    assert.equal(tokenRequests.length, 1);
    assert.match(tokenRequests[0].url, /resource=https%3A%2F%2Fstorage\.azure\.com%2F/);
    assert.match(tokenRequests[0].url, /client_id=client-id-123/);
    assert.equal(tokenRequests[0].headers.metadata, "true");
    assert.ok(blobRequests.every(item => item.headers["x-ms-version"]));
  } finally {
    await Promise.all([
      new Promise(resolve => identity.close(resolve)),
      new Promise(resolve => blob.close(resolve)),
    ]);
  }
});

test("media lists and libraries require an authenticated admin", async () => {
  const denied=createServer((request,response)=>response.writeHead(401).end());
  const origin=await listen(denied);
  try {
    const web=await launch({STOREFRONT_ORIGIN:origin});
    for(const path of ["/api/hidi/hero-publish","/api/hidi/hero-reset","/api/hidi/hero-restore","/api/hidi/landing-media-ananya-publish","/api/hidi/landing-media-ananya-reset","/api/hidi/landing-media-ananya-restore"])
      assert.equal((await send(web.url,path,{method:"POST",body:"{}"})).status,401,path);
    for(const path of ["/api/hidi/hero-library","/api/hidi/landing-media-library"])
      assert.equal((await send(web.url,path)).status,401,path);
  } finally { await new Promise(resolve=>denied.close(resolve)); }
});

test("Next assets and API beat static collisions; genuine deep links retain upstream responses", async () => {
  for (const path of ["/api/collision", "/_next/collision", "/account", "/checkout", "/products/aara?size=M"]) {
    const response = await send(proxy.url, path);
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).url, path);
  }
  const missing = await send(proxy.url, "/account/deep/missing");
  assert.equal(missing.status, 404);
  assert.equal(missing.body, "Storefront route not found");
  const redirect = await send(proxy.url, "/account/redirect");
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.location, "https://thidigk.thehidi.com/account");
});

test("proxy forwards response chunks before completion", async () => {
  const chunks = [];
  await new Promise((resolve, reject) => {
    request(`${proxy.url}/api/stream`, incoming => {
      assert.equal(incoming.headers["content-type"], "text/event-stream");
      incoming.on("data", chunk => chunks.push(chunk.toString()));
      incoming.on("end", resolve);
      incoming.on("error", reject);
    }).on("error", reject).end();
  });
  assert.equal(chunks[0], "data: first\n\n");
  assert.equal(chunks.join(""), "data: first\n\ndata: second\n\n");
});

test("readiness depends on the storefront and no-upstream commerce never receives landing HTML", async () => {
  assert.equal((await send(proxy.url, "/health")).status, 200);
  healthy = false;
  assert.equal((await send(proxy.url, "/health")).status, 503);
  healthy = true;
  assert.equal((await send(proxy.url, "/health", { method: "HEAD" })).status, 200);
  assert.equal((await send(unavailable.url, "/health")).status, 503);
  assert.equal((await send(unavailable.url, "/")).status, 200);
  for (const path of ["/account", "/checkout", "/api/store/session", "/_next/main.js"]) {
    const response = await send(unavailable.url, path);
    assert.equal(response.status, 503);
    assert.equal(response.body, "Storefront unavailable");
  }
  assert.equal((await send(unavailable.url, "/assets/missing.js")).status, 404);
});

test("invalid paths, traversal and escaped symlinks cannot select another origin or file", async () => {
  for (const path of ["//example.com/account", "http://example.com/account", "/%00", "/%5csecret", "/%broken"]) {
    assert.equal((await send(proxy.url, path)).status, 400, path);
  }
  assert.equal((await send(proxy.url, "/%2e%2e%2fsecret.txt")).status, 403);
  assert.equal((await send(proxy.url, "/escape.txt")).status, 403);
});

test("SIGTERM drains an active proxied response before the wrapper exits", async () => {
  const draining = await launch({ STOREFRONT_ORIGIN: `http://127.0.0.1:${fixture.address().port}` });
  let received = "";
  const exited = once(draining.child, "exit");
  await new Promise((resolve, reject) => {
    request(`${draining.url}/api/stream`, incoming => {
      incoming.on("data", chunk => {
        received += chunk.toString();
        if (received === "data: first\n\n") draining.child.kill("SIGTERM");
      });
      incoming.on("end", resolve);
      incoming.on("error", reject);
    }).on("error", reject).end();
  });
  assert.equal(received, "data: first\n\ndata: second\n\n");
  const [code] = await exited;
  assert.equal(code, 0);
});

test("wrapper launches the existing standalone child and exits on unexpected child failure", async () => {
  const standalone = join(folder, "standalone-fixture.cjs");
  await writeFile(standalone, `const http = require('node:http');
    if(process.env.PORT !== '3001' || process.env.HOSTNAME !== '127.0.0.1') process.exit(8);
    const server = http.createServer((request, response) => {
      if(request.url === '/healthz') return response.end('ready');
      if(request.url === '/crash') { response.end('bye'); setTimeout(() => process.exit(9), 20); return; }
      response.end('standalone');
    }).listen(Number(process.env.PORT), process.env.HOSTNAME);
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  `);
  const launched = await launch({ STOREFRONT_ORIGIN: "", STOREFRONT_SERVER_PATH: standalone });
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await send(launched.url, "/health")).status === 200) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal((await send(launched.url, "/health")).status, 200);
  assert.equal((await send(launched.url, "/account")).body, "standalone");
  const exited = once(launched.child, "exit");
  await send(launched.url, "/crash");
  const [code] = await exited;
  assert.equal(code, 1);
  assert.match(launched.stderr(), /Storefront exited unexpectedly/);
});
