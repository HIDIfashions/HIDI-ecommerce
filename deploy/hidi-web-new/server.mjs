import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createHeroMediaHandler } from "./hero-media.mjs";

const root = resolve(process.env.LANDING_DIST_DIR || resolve(process.cwd(), "dist"));
const port = Number(process.env.PORT || 3000);
const storefrontServer = resolve(process.env.STOREFRONT_SERVER_PATH || resolve(process.cwd(), "apps/web/server.js"));
const configuredOrigin = process.env.STOREFRONT_ORIGIN;
const origin = new URL(configuredOrigin || "http://127.0.0.1:3001");
if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password
    || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("STOREFRONT_ORIGIN must be a fixed HTTP(S) origin");
}
const configuredApiOrigin = process.env.INTERNAL_API_URL || process.env.API_URL || "";
const apiOrigin = configuredApiOrigin ? new URL(configuredApiOrigin) : null;
if (apiOrigin && (!["http:", "https:"].includes(apiOrigin.protocol) || apiOrigin.username
    || apiOrigin.password || apiOrigin.search || apiOrigin.hash)) {
  throw new Error("INTERNAL_API_URL/API_URL must be a fixed HTTP(S) URL");
}
const hasStorefront = Boolean(configuredOrigin || existsSync(storefrontServer));
const requestUpstream = origin.protocol === "https:" ? httpsRequest : httpRequest;
const requestApi = apiOrigin?.protocol === "https:" ? httpsRequest : httpRequest;
const hopHeaders = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];
const contentEtags = new Map();
const handleHeroMedia = createHeroMediaHandler({ origin, hasStorefront });
const adminHtmlInjectionLimit = Number(process.env.ADMIN_HTML_INJECTION_MAX_BYTES || 2 * 1024 * 1024);
const adminHeroMediaLink = `
<a data-hidi-hero-media-link="true" href="/admin/hero-media" aria-label="Open HIDI hero media admin"
  style="position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:10px 14px;border-radius:999px;background:#602124;color:#fff;text-decoration:none;font:600 13px Arial,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.18)">Hero Media</a>
`;
const storefrontLayerFix = `
<style data-hidi-storefront-layer-fix="true">
  .announcement {
    position: sticky !important;
    top: 0 !important;
    z-index: 2147483000 !important;
    isolation: isolate !important;
  }
  .site-header {
    position: sticky !important;
    z-index: 2147482999 !important;
    isolation: isolate !important;
  }
</style>
`;

function contentEtag(filePath, stat) {
  const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  const cached = contentEtags.get(filePath);
  if (cached?.identity === identity) return cached.etag;
  const etag = `"sha256-${createHash("sha256").update(readFileSync(filePath)).digest("hex")}"`;
  contentEtags.set(filePath, { identity, etag });
  return etag;
}

const types = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function error(response, status, message) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(message),
  });
  response.end(message);
}

function cleanHeaders(headers) {
  const clean = { ...headers };
  const connectionHeaders = typeof clean.connection === "string" ? clean.connection.split(",") : [];
  for (const name of [...hopHeaders, ...connectionHeaders]) delete clean[name.trim().toLowerCase()];
  return clean;
}

function shouldInjectAdminHeroLink(request, pathname) {
  return request.method === "GET"
    && pathname !== "/admin/hero-media"
    && (pathname === "/admin" || pathname.startsWith("/admin/"));
}

function injectAdminHeroLink(html) {
  if (html.includes("data-hidi-hero-media-link") || html.includes("/admin/hero-media")) return html;
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${adminHeroMediaLink}</body>`)
    : `${html}${adminHeroMediaLink}`;
}

function shouldInjectStorefrontLayerFix(request, pathname) {
  return request.method === "GET"
    && !pathname.startsWith("/api/")
    && pathname !== "/api"
    && !pathname.startsWith("/_next/")
    && pathname !== "/_next"
    && pathname !== "/admin/hero-media";
}

function injectStorefrontLayerFix(html) {
  if (html.includes("data-hidi-storefront-layer-fix")) return html;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${storefrontLayerFix}</head>`)
    : `${storefrontLayerFix}${html}`;
}

function forwardedProto(request) {
  const value = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return ["http", "https"].includes(value)
    ? value : request.socket.encrypted ? "https" : "http";
}

function apiProxyPath(pathname, search = "") {
  const basePath = apiOrigin.pathname.replace(/\/$/, "");
  const suffix = pathname === "/v1" ? "" : pathname.slice("/v1".length);
  const path = basePath.endsWith("/v1") ? `${basePath}${suffix}` : `${basePath}/v1${suffix}`;
  return `${path || "/"}${search}`;
}

function proxyApi(request, response, pathname) {
  if (!apiOrigin) return error(response, 503, "API unavailable");
  const headers = cleanHeaders(request.headers);
  headers.host = apiOrigin.host;
  headers["x-forwarded-host"] = request.headers.host || apiOrigin.host;
  headers["x-forwarded-proto"] = forwardedProto(request);
  const url = new URL(request.url || "/", "http://localhost");
  const upstream = requestApi({
    protocol: apiOrigin.protocol,
    hostname: apiOrigin.hostname,
    port: apiOrigin.port || undefined,
    method: request.method,
    path: apiProxyPath(pathname, url.search),
    headers,
  }, incoming => {
    const responseHeaders = cleanHeaders(incoming.headers);
    response.writeHead(incoming.statusCode || 502, responseHeaders);
    incoming.on("error", () => response.destroy());
    response.on("close", () => incoming.destroy());
    incoming.pipe(response);
  });
  upstream.on("error", () => {
    if (response.headersSent) response.destroy();
    else error(response, 503, "API unavailable");
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => upstream.destroy());
  request.pipe(upstream);
}

function proxy(request, response, pathname = "") {
  if (!hasStorefront) return error(response, 503, "Storefront unavailable");
  const headers = cleanHeaders(request.headers);
  const injectHeroLink = shouldInjectAdminHeroLink(request, pathname);
  const injectLayerFix = shouldInjectStorefrontLayerFix(request, pathname);
  if (injectHeroLink || injectLayerFix) delete headers["accept-encoding"];
  // The fixed origin selects the destination. The public host/protocol still
  // reach Next so redirects, authentication cookies, and URL generation work.
  headers.host = request.headers.host || origin.host;
  headers["x-forwarded-host"] = request.headers.host || origin.host;
  headers["x-forwarded-proto"] = forwardedProto(request);
  const upstream = requestUpstream({
    protocol: origin.protocol,
    hostname: origin.hostname,
    port: origin.port || undefined,
    method: request.method,
    path: request.url,
    headers,
  }, incoming => {
    const responseHeaders = cleanHeaders(incoming.headers);
    const status = incoming.statusCode || 502;
    const contentType = String(responseHeaders["content-type"] || "");
    const canInject = (injectHeroLink || injectLayerFix)
      && status >= 200 && status < 300
      && /\btext\/html\b/i.test(contentType)
      && !responseHeaders["content-encoding"];
    if (!canInject) {
      response.writeHead(status, responseHeaders);
      incoming.on("error", () => response.destroy());
      response.on("close", () => incoming.destroy());
      incoming.pipe(response);
      return;
    }

    const chunks = [];
    let size = 0;
    let streaming = false;
    incoming.on("error", () => response.destroy());
    response.on("close", () => incoming.destroy());
    incoming.on("data", chunk => {
      if (streaming) {
        response.write(chunk);
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
      if (size > adminHtmlInjectionLimit) {
        streaming = true;
        response.writeHead(status, responseHeaders);
        for (const part of chunks) response.write(part);
        chunks.length = 0;
      }
    });
    incoming.on("end", () => {
      if (streaming) {
        response.end();
        return;
      }
      delete responseHeaders["content-length"];
      delete responseHeaders.etag;
      let html = Buffer.concat(chunks).toString("utf8");
      if (injectLayerFix) html = injectStorefrontLayerFix(html);
      if (injectHeroLink) html = injectAdminHeroLink(html);
      const body = Buffer.from(html);
      responseHeaders["content-length"] = String(body.length);
      response.writeHead(status, responseHeaders);
      response.end(body);
    });
  });
  upstream.on("error", () => {
    if (response.headersSent) response.destroy();
    else error(response, 503, "Storefront unavailable");
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => upstream.destroy());
  request.pipe(upstream);
}

function storefrontReady() {
  if (!hasStorefront) return Promise.resolve(false);
  return new Promise(resolveReady => {
    let complete = false;
    const done = ready => {
      if (complete) return;
      complete = true;
      resolveReady(ready);
    };
    const probe = requestUpstream({
      protocol: origin.protocol,
      hostname: origin.hostname,
      port: origin.port || undefined,
      method: "GET",
      path: "/healthz",
      timeout: 2000,
    }, incoming => {
      incoming.resume();
      done(incoming.statusCode >= 200 && incoming.statusCode < 300);
    });
    probe.on("timeout", () => { probe.destroy(); done(false); });
    probe.on("error", () => done(false));
    probe.end();
  });
}

async function handle(request, response) {
  if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
    return error(response, 400, "Invalid request path");
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  } catch {
    return error(response, 400, "Invalid request path");
  }
  if (pathname.includes("\0") || pathname.includes("\\")) {
    return error(response, 400, "Invalid request path");
  }

  if (pathname === "/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return error(response, 405, "Method not allowed");
    }
    const ready = existsSync(resolve(root, "index.html")) && await storefrontReady();
    const body = JSON.stringify({ status: ready ? "ok" : "unavailable", storefront: ready });
    response.writeHead(ready ? 200 : 503, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body),
    });
    return response.end(request.method === "HEAD" ? undefined : body);
  }

  if (await handleHeroMedia(request, response, pathname)) return;

  if (pathname === "/v1/payments/razorpay/webhook" && (request.method === "GET" || request.method === "HEAD")) {
    response.setHeader("Allow", "POST");
    return error(response, 405, "Razorpay webhook accepts POST only");
  }
  if (pathname === "/v1" || pathname.startsWith("/v1/")) return proxyApi(request, response, pathname);

  // Backend/API paths always win, including accidental static collisions.
  if (pathname === "/api" || pathname.startsWith("/api/")
      || pathname === "/_next" || pathname.startsWith("/_next/")) return proxy(request, response, pathname);
  if (request.method !== "GET" && request.method !== "HEAD") return proxy(request, response, pathname);

  const landingPath = pathname === "/admin/hero-media" ? "/hero-control.html" : pathname;
  let filePath = resolve(root, `.${landingPath === "/" ? "/index.html" : landingPath}`);
  if (!filePath.startsWith(`${root}${sep}`)) {
    return error(response, 403, "Forbidden");
  }

  let stat;
  try {
    stat = statSync(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
    // Refuse links escaping the landing directory, as well as lexical traversal.
    if (!realpathSync(filePath).startsWith(`${realpathSync(root)}${sep}`)) {
      return error(response, 403, "Forbidden");
    }
  } catch {
    if (pathname === "/") return error(response, 503, "Landing page unavailable");
    // Absent landing assets must never fall through to the home page.
    if (pathname.startsWith("/assets/") || pathname === "/config.js") {
      return error(response, 404, "Not found");
    }
    return proxy(request, response, pathname);
  }

  const extension = extname(filePath).toLowerCase();
  // Reproducible OCI layers use mtime=0. Size+mtime cannot distinguish two
  // same-size builds, so validators must identify the actual file content.
  const etag = contentEtag(filePath, stat);
  const modified = stat.mtime.toUTCString();
  const isVersionedBundle = /[/\\]assets[/\\][^/\\]+-[A-Za-z0-9_-]{8,}\.(?:css|js)$/.test(filePath);
  response.setHeader("Content-Type", types[extension] || "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("ETag", etag);
  response.setHeader("Last-Modified", modified);
  response.setHeader("Cache-Control", isVersionedBundle
    ? "public, max-age=31536000, immutable"
    : [".html", ".json", ".webmanifest"].includes(extension) || pathname === "/config.js"
      ? "no-cache"
      : "public, max-age=300");

  const noneMatch = request.headers["if-none-match"];
  if (noneMatch === "*" || noneMatch?.split(",").map(value => value.trim()).includes(etag)
      || (!noneMatch && stat.mtimeMs > 0 && request.headers["if-modified-since"]
        && Date.parse(request.headers["if-modified-since"]) >= Math.floor(stat.mtimeMs / 1000) * 1000)) {
    response.writeHead(304);
    return response.end();
  }

  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = request.headers.range;
  const ifRange = request.headers["if-range"];
  const rangeAllowed = !ifRange || ifRange === etag
    || (stat.mtimeMs > 0 && Date.parse(ifRange) >= Math.floor(stat.mtimeMs / 1000) * 1000);
  if (range && rangeAllowed && request.method === "GET") {
    // A browser's media requests use a single range; ignore multipart ranges.
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      if (!match[1] && match[2]) {
        start = Math.max(0, stat.size - Number(match[2]));
      } else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if ((!match[1] && !match[2]) || start >= stat.size || start > end || stat.size === 0
          || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        response.setHeader("Content-Range", `bytes */${stat.size}`);
        return error(response, 416, "Range not satisfiable");
      }
      status = 206;
      response.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    }
  }

  response.setHeader("Content-Length", stat.size === 0 ? 0 : end - start + 1);
  response.writeHead(status);
  if (request.method === "HEAD" || stat.size === 0) return response.end();
  const stream = createReadStream(filePath, { start, end });
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
}

export function startRuntime() {
  let child;
  let shuttingDown = false;
  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (response.headersSent) response.destroy();
      else error(response, 500, "Request failed");
    });
  });

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const serverClosed = new Promise(done => server.close(done));
    const childExited = new Promise(done => child && child.exitCode === null && child.signalCode === null
      ? child.once("exit", done) : done());
    child?.kill("SIGTERM");
    const deadline = setTimeout(() => {
      child?.kill("SIGKILL");
      server.closeAllConnections();
      process.exit(exitCode);
    }, 5000);
    deadline.unref();
    Promise.all([serverClosed, childExited])
      .then(() => { clearTimeout(deadline); process.exit(exitCode); });
  };

  if (!configuredOrigin && hasStorefront) {
    child = spawn(process.execPath, [storefrontServer], {
      cwd: resolve(storefrontServer, ".."),
      env: { ...process.env, PORT: "3001", HOSTNAME: "127.0.0.1" },
      stdio: "inherit",
    });
    child.on("error", failure => {
      console.error("Storefront failed to start:", failure.message);
      shutdown(1);
    });
    child.on("exit", (code, signal) => {
      if (!shuttingDown) {
        console.error(`Storefront exited unexpectedly (${code ?? signal})`);
        shutdown(1);
      }
    });
  }
  process.once("SIGTERM", () => shutdown());
  process.once("SIGINT", () => shutdown());
  server.on("error", failure => {
    console.error("Runtime failed:", failure.message);
    shutdown(1);
  });
  server.listen(port, "0.0.0.0", () => console.log(`HIDI landing and storefront listening on ${server.address().port}`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) startRuntime();
