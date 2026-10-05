import assert from "node:assert/strict";
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
let proxy;
let unavailable;
let healthy = true;
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
  proxy = await launch({ STOREFRONT_ORIGIN: `http://127.0.0.1:${fixture.address().port}` });
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
  if (folder) await rm(folder, { recursive: true, force: true });
});

test("landing root and files retain range and cache semantics", async () => {
  const root = await send(proxy.url, "/?campaign=launch");
  assert.equal(root.status, 200);
  assert.equal(root.body, "<h1>Original landing</h1>");
  assert.equal(root.headers["cache-control"], "no-cache");
  const head = await send(proxy.url, "/", { method: "HEAD" });
  assert.equal(head.body, "");
  assert.equal(head.headers["content-length"], String(root.body.length));
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
  assert.equal(updated.body, newHtml);
  assert.notEqual(previous.headers.etag, updated.headers.etag);
  assert.equal(updated.headers["last-modified"], "Thu, 01 Jan 1970 00:00:00 GMT");
  assert.equal((await send(newBuild.url, "/", { headers: { "If-None-Match": updated.headers.etag } })).status, 304);
  assert.equal((await send(newBuild.url, "/", { headers: { "If-Modified-Since": previous.headers["last-modified"] } })).status, 200);
  const datedRange = await send(newBuild.url, "/assets/video/hero.mp4", {
    headers: { Range: "bytes=2-5", "If-Range": previous.headers["last-modified"] },
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

test("hero control route stays on the landing runtime and public hero config safely falls back", async () => {
  const control = await send(proxy.url, "/admin/hero-media");
  assert.equal(control.status, 200);
  assert.match(control.body, /Hero Media Control/);
  const config = await send(proxy.url, "/api/hidi/hero-config");
  assert.equal(config.status, 200);
  assert.equal(config.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(config.body).active, false);
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

    if (incoming.method === "GET") {
      const saved = blobs.get(incoming.url);
      if (!saved) {
        response.writeHead(404).end("missing");
        return;
      }
      response.writeHead(200, { "Content-Type": saved.headers["x-ms-blob-content-type"] || "application/octet-stream" });
      response.end(saved.body);
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
      MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
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
    assert.match(asset.url, /^https:\/\/media\.example\.test\/brand\/hero\/media\/\d{8}\/.+\.png$/);
    assert.match(asset.storagePath, /^azure:\/\/unitstore\/hero\/brand\/hero\/media\/\d{8}\/.+\.png$/);

    const mediaPath = new URL(asset.url).pathname;
    assert.equal(blobs.get(`/hero${mediaPath}`).body.toString(), "hero image bytes");
    assert.equal(blobs.get(`/hero${mediaPath}`).headers["x-ms-blob-content-type"], "image/png");

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
