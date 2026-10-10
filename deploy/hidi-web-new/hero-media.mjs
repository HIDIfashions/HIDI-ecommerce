import { createHash, createHmac, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const CURRENT_KEY = "brand/hero/current.json";
const PREVIOUS_KEY = "brand/hero/previous.json";
const LIBRARY_KEY = "brand/hero/library.json";
const LANDING_CURRENT_KEY = "brand/landing-media/current.json";
const LANDING_PREVIOUS_KEY = "brand/landing-media/previous.json";
const LANDING_LIBRARY_KEY = "brand/landing-media/library.json";
const HERO_ASSET_PREFIX = "/api/hidi/hero-asset/";
const MEDIA_KEY_PREFIX = "brand/hero/media/";
const LANDING_MEDIA_KEY_PREFIX = "brand/landing-media/media/";
const ALLOWED_MEDIA_KEY_PREFIXES = [MEDIA_KEY_PREFIX, LANDING_MEDIA_KEY_PREFIX];
const DEFAULT_CONTAINER = "hidi-product-media-prod";
const AZURE_STORAGE_SCOPE = "https://storage.azure.com/";
const AZURE_BLOB_API_VERSION = "2023-11-03";
const MAX_JSON_BYTES = 64 * 1024;
const MAX_LIBRARY = 200;
const MAX_SEQUENCE = 20;
const MAX_LANDING_LIBRARY = 200;
const LANDING_SLOT_IDS = new Set([
  "ananya-orange",
  "ananya-pink",
  "ananya-maroon",
  "ananya-black",
  "ananya-green",
  "range-occasion",
  "range-new-arrivals",
  "range-work-edit",
  "range-everyday",
  "range-shop-all",
  "hidi-edit-banner",
]);
const MEDIA_TYPES = {
  "image/jpeg": { type: "image", ext: "jpg", maxBytes: 20 * 1024 * 1024 },
  "image/png": { type: "image", ext: "png", maxBytes: 20 * 1024 * 1024 },
  "image/webp": { type: "image", ext: "webp", maxBytes: 20 * 1024 * 1024 },
  "image/avif": { type: "image", ext: "avif", maxBytes: 20 * 1024 * 1024 },
  "video/mp4": { type: "video", ext: "mp4", maxBytes: 50 * 1024 * 1024 },
  "video/webm": { type: "video", ext: "webm", maxBytes: 50 * 1024 * 1024 },
};
const LANDING_MEDIA_TYPES = Object.fromEntries(
  Object.entries(MEDIA_TYPES).filter(([, policy]) => policy.type === "image"),
);

function headerValue(value) {
  return Array.isArray(value) ? value[0] || "" : typeof value === "string" ? value : "";
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendPlain(response, status, message) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(message),
  });
  response.end(message);
}

function cleanBaseUrl(value) {
  return (value || "").trim().replace(/\/$/, "");
}

function r2Config() {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.R2_BUCKET || DEFAULT_CONTAINER).trim();
  const publicBaseUrl = cleanBaseUrl(process.env.R2_PUBLIC_BASE_URL || process.env.MEDIA_PUBLIC_BASE_URL);
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error("Hero media storage is not configured");
  }
  return { provider: "r2", accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function azureConfig() {
  const account = (process.env.AZURE_STORAGE_ACCOUNT || "").trim();
  const container = (
    process.env.AZURE_STORAGE_CONTAINER
    || process.env.MEDIA_STORAGE_CONTAINER
    || process.env.AZURE_BLOB_CONTAINER
    || process.env.BLOB_CONTAINER
    || process.env.R2_BUCKET
    || DEFAULT_CONTAINER
  ).trim();
  const publicBaseUrl = cleanBaseUrl(
    process.env.MEDIA_PUBLIC_BASE_URL
    || process.env.AZURE_MEDIA_PUBLIC_BASE_URL
    || process.env.R2_PUBLIC_BASE_URL,
  );
  const blobEndpoint = cleanBaseUrl(
    process.env.AZURE_STORAGE_BLOB_ENDPOINT
    || `https://${account}.blob.core.windows.net`,
  );
  const clientId = (
    process.env.AZURE_CLIENT_ID
    || process.env.MANAGED_IDENTITY_CLIENT_ID
    || ""
  ).trim();

  if (!account || !container || !publicBaseUrl || !blobEndpoint) {
    throw new Error("Hero media storage is not configured");
  }

  return { provider: "azure", account, container, publicBaseUrl, blobEndpoint, clientId };
}

function storageConfig() {
  const provider = (process.env.MEDIA_STORAGE_PROVIDER || "").trim().toLowerCase();
  if (provider === "azure" || provider === "azblob" || provider === "blob") return azureConfig();
  if (provider === "r2" || provider === "cloudflare") return r2Config();
  return process.env.AZURE_STORAGE_ACCOUNT ? azureConfig() : r2Config();
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function amzTimestamp(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signingKey(secret, dateStamp) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function encodeS3Path(bucket, key) {
  return `/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function signedR2Request(method, key, payloadHash, contentType) {
  const config = r2Config();
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = encodeS3Path(config.bucket, key);
  const names = contentType
    ? ["content-type", "host", "x-amz-content-sha256", "x-amz-date"]
    : ["host", "x-amz-content-sha256", "x-amz-date"];
  const values = {
    "content-type": contentType,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const canonicalHeaders = names.map((name) => `${name}:${values[name]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmacHex(signingKey(config.secretAccessKey, dateStamp), stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    config,
    host,
    path: canonicalUri,
    headers: {
      Authorization: authorization,
      Host: host,
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
  };
}

async function r2Request(method, key, { buffer = null, filePath = "", size = 0, payloadHash = "", contentType = "" } = {}) {
  const body = buffer ? Buffer.from(buffer) : null;
  const hash = payloadHash || sha256Hex(body || Buffer.alloc(0));
  const signed = signedR2Request(method, key, hash, contentType);
  const contentLength = filePath ? size : body ? body.length : 0;

  return new Promise((resolvePromise, rejectPromise) => {
    const outgoing = httpsRequest({
      hostname: signed.host,
      method,
      path: signed.path,
      headers: {
        ...signed.headers,
        ...(method === "PUT" ? { "Content-Length": contentLength } : {}),
      },
      timeout: 90_000,
    }, incoming => {
      const chunks = [];
      let bytes = 0;
      incoming.on("data", chunk => {
        bytes += chunk.length;
        if (bytes <= 1024 * 1024) chunks.push(chunk);
      });
      incoming.on("end", () => resolvePromise({
        status: incoming.statusCode || 502,
        body: Buffer.concat(chunks),
      }));
      incoming.on("error", rejectPromise);
    });

    outgoing.on("timeout", () => outgoing.destroy(new Error("Hero media storage timed out")));
    outgoing.on("error", rejectPromise);

    if (filePath) {
      const stream = createReadStream(filePath);
      stream.on("error", rejectPromise);
      stream.pipe(outgoing);
    } else {
      outgoing.end(body || undefined);
    }
  });
}

let azureTokenCache = null;

function tokenExpiryMillis(value, expiresIn) {
  const text = typeof value === "string" ? value.trim() : "";
  const numeric = Number(text || value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return parsed;
  const seconds = Number(expiresIn);
  return Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000;
}

async function azureAccessToken(config) {
  const now = Date.now();
  if (azureTokenCache && azureTokenCache.expiresAt - now > 120_000) {
    return azureTokenCache.token;
  }

  const injectedToken = (process.env.AZURE_STORAGE_ACCESS_TOKEN || "").trim();
  if (injectedToken) {
    const token = injectedToken;
    azureTokenCache = { token, expiresAt: now + 3600 * 1000 };
    return token;
  }

  let url;
  const headers = {};
  if (process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER) {
    url = new URL(process.env.IDENTITY_ENDPOINT);
    url.searchParams.set("api-version", "2019-08-01");
    url.searchParams.set("resource", AZURE_STORAGE_SCOPE);
    if (config.clientId) url.searchParams.set("client_id", config.clientId);
    headers["X-IDENTITY-HEADER"] = process.env.IDENTITY_HEADER;
  } else {
    url = new URL(process.env.AZURE_IMDS_ENDPOINT || "http://169.254.169.254/metadata/identity/oauth2/token");
    url.searchParams.set("api-version", "2018-02-01");
    url.searchParams.set("resource", AZURE_STORAGE_SCOPE);
    if (config.clientId) url.searchParams.set("client_id", config.clientId);
    headers.Metadata = "true";
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(`Azure managed identity returned HTTP ${response.status}`);
  }

  azureTokenCache = {
    token: body.access_token,
    expiresAt: tokenExpiryMillis(body.expires_on, body.expires_in),
  };
  return azureTokenCache.token;
}

function encodedBlobPath(config, key) {
  return `/${encodeURIComponent(config.container)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function azureBlobUrl(config, key) {
  const base = new URL(config.blobEndpoint.endsWith("/") ? config.blobEndpoint : `${config.blobEndpoint}/`);
  const prefix = base.pathname === "/" ? "" : base.pathname.replace(/\/$/, "");
  base.pathname = `${prefix}${encodedBlobPath(config, key)}`;
  return base;
}

async function azureRequest(method, key, { buffer = null, filePath = "", size = 0, contentType = "" } = {}) {
  const config = azureConfig();
  const token = await azureAccessToken(config);
  const url = azureBlobUrl(config, key);
  const body = buffer ? Buffer.from(buffer) : null;
  const contentLength = filePath ? size : body ? body.length : 0;
  const transport = url.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise((resolvePromise, rejectPromise) => {
    const outgoing = transport({
      hostname: url.hostname,
      port: url.port,
      method,
      path: `${url.pathname}${url.search}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "x-ms-date": new Date().toUTCString(),
        "x-ms-version": AZURE_BLOB_API_VERSION,
        ...(method === "PUT" ? {
          "Content-Length": contentLength,
          "x-ms-blob-type": "BlockBlob",
          ...(contentType ? { "Content-Type": contentType, "x-ms-blob-content-type": contentType } : {}),
        } : {}),
      },
      timeout: 90_000,
    }, incoming => {
      const chunks = [];
      let bytes = 0;
      incoming.on("data", chunk => {
        bytes += chunk.length;
        if (bytes <= 1024 * 1024) chunks.push(chunk);
      });
      incoming.on("end", () => resolvePromise({
        status: incoming.statusCode || 502,
        body: Buffer.concat(chunks),
      }));
      incoming.on("error", rejectPromise);
    });

    outgoing.on("timeout", () => outgoing.destroy(new Error("Hero media storage timed out")));
    outgoing.on("error", rejectPromise);

    if (filePath) {
      const stream = createReadStream(filePath);
      stream.on("error", rejectPromise);
      stream.pipe(outgoing);
    } else {
      outgoing.end(body || undefined);
    }
  });
}

async function storageRequest(method, key, options = {}) {
  return storageConfig().provider === "azure"
    ? azureRequest(method, key, options)
    : r2Request(method, key, options);
}

async function storageGetJson(key) {
  const response = await storageRequest("GET", key);
  if (response.status === 404) return null;
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Hero media storage returned HTTP ${response.status}`);
  }
  try {
    return JSON.parse(response.body.toString("utf8"));
  } catch {
    throw new Error("Hero media configuration is invalid");
  }
}

async function storagePutJson(key, value) {
  const body = Buffer.from(JSON.stringify(value));
  const response = await storageRequest("PUT", key, {
    buffer: body,
    contentType: "application/json",
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Hero media storage returned HTTP ${response.status}`);
  }
}

function headerCase(name) {
  return name.split("-").map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join("-");
}

function assetKeyFromPath(pathname) {
  if (!pathname.startsWith(HERO_ASSET_PREFIX)) return "";
  const key = pathname.slice(HERO_ASSET_PREFIX.length);
  if (!ALLOWED_MEDIA_KEY_PREFIXES.some(prefix => key.startsWith(prefix)) || key.includes("..")) return "";
  return key;
}

function mediaResponseHeaders(headers) {
  const outgoing = {
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  for (const name of ["content-type", "content-length", "content-range", "etag", "last-modified"]) {
    const value = headers[name];
    if (value) outgoing[headerCase(name)] = value;
  }
  return outgoing;
}

async function azureProxyAsset(request, response, key) {
  const config = azureConfig();
  const token = await azureAccessToken(config);
  const url = azureBlobUrl(config, key);
  const range = headerValue(request.headers.range);
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const transport = url.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise((resolvePromise, rejectPromise) => {
    const outgoing = transport({
      hostname: url.hostname,
      port: url.port,
      method,
      path: `${url.pathname}${url.search}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "x-ms-date": new Date().toUTCString(),
        "x-ms-version": AZURE_BLOB_API_VERSION,
        ...(range && /^bytes=\d*-\d*$/.test(range) ? { Range: range, "x-ms-range": range } : {}),
      },
      timeout: 90_000,
    }, incoming => {
      const status = incoming.statusCode || 502;
      if (status < 200 || status >= 300) {
        incoming.resume();
        incoming.on("end", () => {
          sendPlain(response, status === 404 ? 404 : 502,
            status === 404 ? "Hero media not found" : `Hero media storage returned HTTP ${status}`);
          resolvePromise();
        });
        incoming.on("error", rejectPromise);
        return;
      }

      response.writeHead(status, mediaResponseHeaders(incoming.headers));
      if (method === "HEAD") {
        incoming.resume();
        incoming.on("end", resolvePromise);
        incoming.on("error", rejectPromise);
        response.end();
        return;
      }
      pipeline(incoming, response).then(resolvePromise, rejectPromise);
    });

    outgoing.on("timeout", () => outgoing.destroy(new Error("Hero media storage timed out")));
    outgoing.on("error", rejectPromise);
    outgoing.end();
  });
}

async function proxyHeroAsset(request, response, key) {
  const config = storageConfig();
  if (config.provider !== "azure") {
    sendPlain(response, 404, "Hero media not found");
    return;
  }
  await azureProxyAsset(request, response, key);
}

async function verifyAdmin(request, origin, hasStorefront) {
  if (!hasStorefront) return false;
  try {
    const session = await fetch(new URL("/api/admin/session", origin), {
      method: "GET",
      headers: {
        cookie: headerValue(request.headers.cookie),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    return session.ok;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function cleanName(value) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {}
  return decoded.replace(/[\r\n\0]/g, "").trim().slice(0, 180) || "hero-media";
}

function objectKey(mimeType, prefix = MEDIA_KEY_PREFIX) {
  const media = MEDIA_TYPES[mimeType];
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}${day}/${Date.now()}-${randomUUID()}.${media.ext}`;
}

function heroAssetUrl(key) {
  return `${HERO_ASSET_PREFIX}${key.split("/").map(encodeURIComponent).join("/")}`;
}

function publicUrl(config, key) {
  // Product photos use MEDIA_PUBLIC_BASE_URL=/media, but that Next route only
  // serves products/*. Brand CMS assets stay private and must use this
  // managed-identity proxy instead of sharing the product-media base URL.
  if (config.provider === "azure") return heroAssetUrl(key);
  return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function ownedBrandKeyFromUrl(value, config) {
  if (typeof value !== "string" || !value) return "";
  let parsed;
  try {
    parsed = new URL(value, "https://hidi.invalid");
  } catch {
    return "";
  }
  const { pathname } = parsed;
  const absoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");
  const publicHosts = new Set([
    config.publicBaseUrl,
    process.env.SITE_URL,
    process.env.WEB_ORIGIN,
  ].flatMap(item => {
    try { return item ? [new URL(item).hostname] : []; } catch { return []; }
  }));

  let encodedKey = "";
  if (pathname.startsWith(HERO_ASSET_PREFIX)) {
    if (absoluteUrl && !publicHosts.has(parsed.hostname)) return "";
    encodedKey = pathname.slice(HERO_ASSET_PREFIX.length);
  } else if (pathname.startsWith("/media/brand/")) {
    if (absoluteUrl && !publicHosts.has(parsed.hostname)) return "";
    encodedKey = pathname.slice("/media/".length);
  } else {
    let blobHost = "";
    try {
      blobHost = new URL(config.blobEndpoint).hostname;
    } catch {
      return "";
    }
    const marker = ALLOWED_MEDIA_KEY_PREFIXES
      .map(prefix => `/${prefix}`)
      .find(prefix => pathname.includes(prefix));
    if (!marker || parsed.hostname !== blobHost) return "";
    encodedKey = pathname.slice(pathname.indexOf(marker) + 1);
  }

  let key;
  try {
    key = encodedKey.split("/").map(decodeURIComponent).join("/");
  } catch {
    return "";
  }
  if (
    !ALLOWED_MEDIA_KEY_PREFIXES.some(prefix => key.startsWith(prefix))
    || key.includes("..")
    || key.includes("\\")
    || key.includes("\0")
  ) return "";
  return key;
}

function canonicalMediaUrl(value) {
  let config;
  try {
    config = storageConfig();
  } catch {
    return value;
  }
  // R2 uses its public origin directly; /api/hidi/hero-asset is Azure-only.
  if (config.provider !== "azure") return value;
  const key = ownedBrandKeyFromUrl(value, config);
  return key ? heroAssetUrl(key) : value;
}

function storagePath(config, key) {
  if (config.provider === "azure") return `azure://${config.account}/${config.container}/${key}`;
  return `r2://${config.bucket}/${key}`;
}

async function receiveUpload(request, maxBytes) {
  const declared = Number(headerValue(request.headers["content-length"]) || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("UPLOAD_TOO_LARGE");

  const filePath = resolve(
    tmpdir(),
    `hidi-hero-${process.pid}-${Date.now()}-${randomUUID()}.upload`,
  );
  let size = 0;
  const hash = createHash("sha256");
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) return callback(new Error("UPLOAD_TOO_LARGE"));
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(request, meter, createWriteStream(filePath, { flags: "wx" }));
    if (size < 1) throw new Error("Choose a non-empty media file");
    return {
      filePath,
      size,
      payloadHash: hash.digest("hex"),
    };
  } catch (error) {
    await unlink(filePath).catch(() => {});
    throw error;
  }
}

function normalizePosition(value) {
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{1,3})%\s+(\d{1,3})%$/.exec(text);
  if (!match) return "50% 50%";
  const x = Math.max(0, Math.min(100, Number(match[1])));
  const y = Math.max(0, Math.min(100, Number(match[2])));
  return `${x}% ${y}%`;
}

function normalizeFitMode(value) {
  return value === "contain" ? "contain" : "cover";
}

function cleanSlotId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return LANDING_SLOT_IDS.has(text) ? text : "";
}

function sequenceSettings(raw, fallbackAutoplay = false) {
  return { autoPlay: typeof raw?.autoPlay === "boolean" ? raw.autoPlay : fallbackAutoplay,
    intervalSeconds: Math.max(3, Math.min(30, Number(raw?.intervalSeconds) || 6)) };
}

function publicMediaItem(raw, imagesOnly = false) {
  if (!raw || !["image", ...(imagesOnly ? [] : ["video"])].includes(raw.type) || typeof raw.url !== "string" || !raw.url) return null;
  return { assetId: typeof raw.assetId === "string" ? raw.assetId : "", type: raw.type, url: canonicalMediaUrl(raw.url),
    originalName: typeof raw.originalName === "string" ? raw.originalName : "",
    altText: typeof raw.altText === "string" ? raw.altText : "",
    desktopPosition: normalizePosition(raw.desktopPosition), mobilePosition: normalizePosition(raw.mobilePosition), fitMode: normalizeFitMode(raw.fitMode) };
}

function publicSequence(raw, imagesOnly = false) {
  if (raw?.active !== true) return { version: 1, active: false, source: "bundled", items: [], ...sequenceSettings(raw) };
  const items = (Array.isArray(raw.items) ? raw.items : [raw]).map(item => publicMediaItem(item, imagesOnly)).filter(Boolean).slice(0, MAX_SEQUENCE);
  if (!items.length) return { version: 1, active: false, source: "bundled", items: [], ...sequenceSettings(raw) };
  return { version: 1, active: true, source: "uploaded", ...items[0], items, ...sequenceSettings(raw, !imagesOnly), updatedAt: raw.updatedAt || null };
}

function publicConfig(raw) { return publicSequence(raw); }

function requestedSequence(body, library, imagesOnly = false) {
  if (!body || typeof body !== "object") throw new Error("Choose media from this section's library");
  const requested = Array.isArray(body.items) ? body.items : [body];
  if (!requested.length || requested.length > MAX_SEQUENCE) throw new Error("Choose between 1 and 20 media items");
  const used = new Set();
  const items = requested.map(item => {
    const asset = library.assets.find(asset => asset.id === item?.assetId);
    if (!asset || (imagesOnly && asset.type !== "image")) throw new Error("Choose media from this section's library");
    if (used.has(asset.id)) throw new Error("Choose each media item only once");
    used.add(asset.id);
    return { ...publicMediaItem({ ...asset, assetId: asset.id, desktopPosition: item.desktopPosition, mobilePosition: item.mobilePosition,
      fitMode: item.fitMode, altText: typeof item.altText === "string" ? item.altText.trim().slice(0, 220) : "" }, imagesOnly) };
  });
  return { version: 1, active: true, ...items[0], items, ...sequenceSettings(body, !imagesOnly), updatedAt: new Date().toISOString() };
}

function publicLandingSlot(raw) {
  if (
    !raw
    || raw.active !== true
    || raw.type !== "image"
    || typeof raw.url !== "string"
  ) {
    return {
      version: 1,
      active: false,
      source: "bundled",
    };
  }

  return {
    version: 1,
    active: true,
    source: "uploaded",
    assetId: typeof raw.assetId === "string" ? raw.assetId : "",
    type: "image",
    url: canonicalMediaUrl(raw.url),
    originalName: typeof raw.originalName === "string" ? raw.originalName : "",
    altText: typeof raw.altText === "string" ? raw.altText : "",
    desktopPosition: normalizePosition(raw.desktopPosition),
    mobilePosition: normalizePosition(raw.mobilePosition),
    fitMode: normalizeFitMode(raw.fitMode),
    updatedAt: raw.updatedAt || null,
  };
}

function publicLandingConfig(raw) {
  const sourceSlots = raw?.slots && typeof raw.slots === "object" ? raw.slots : {};
  const slots = {};
  for (const id of LANDING_SLOT_IDS) slots[id] = publicLandingSlot(sourceSlots[id]);
  return {
    version: 1,
    slots,
    ananya: raw?.ananya ? publicSequence(raw.ananya, true) : null,
  };
}

async function loadLibrary() {
  const raw = await storageGetJson(LIBRARY_KEY);
  const assets = Array.isArray(raw?.assets)
    ? raw.assets.filter(item =>
      item
      && typeof item.id === "string"
      && typeof item.url === "string"
      && ["image", "video"].includes(item.type)
    ).map(item => ({ ...item, url: canonicalMediaUrl(item.url) }))
    : [];

  return {
    version: 1,
    assets: assets.slice(0, MAX_LIBRARY),
  };
}

async function loadLandingLibrary() {
  const raw = await storageGetJson(LANDING_LIBRARY_KEY);
  const assets = Array.isArray(raw?.assets)
    ? raw.assets.filter(item =>
      item
      && typeof item.id === "string"
      && typeof item.url === "string"
      && item.type === "image"
    ).map(item => ({ ...item, url: canonicalMediaUrl(item.url) }))
    : [];

  return {
    version: 1,
    assets: assets.slice(0, MAX_LANDING_LIBRARY),
  };
}

async function saveCurrent(next) {
  const current = await storageGetJson(CURRENT_KEY);
  if (current) await storagePutJson(PREVIOUS_KEY, current);
  await storagePutJson(CURRENT_KEY, next);
}

async function saveLandingSlot(slotId, next) {
  const current = await storageGetJson(LANDING_CURRENT_KEY);
  const previous = await storageGetJson(LANDING_PREVIOUS_KEY);
  const currentSlots = current?.slots && typeof current.slots === "object" ? current.slots : {};
  const previousSlots = previous?.slots && typeof previous.slots === "object" ? previous.slots : {};

  const nextPrevious = {
    ...previous,
    version: 1,
    slots: {
      ...previousSlots,
      ...(currentSlots[slotId] ? { [slotId]: currentSlots[slotId] } : {}),
    },
  };
  const nextCurrent = {
    ...current,
    version: 1,
    slots: {
      ...currentSlots,
      [slotId]: next,
    },
  };

  await storagePutJson(LANDING_PREVIOUS_KEY, nextPrevious);
  await storagePutJson(LANDING_CURRENT_KEY, nextCurrent);
}

async function saveAnanya(next) {
  const current = await storageGetJson(LANDING_CURRENT_KEY);
  const previous = await storageGetJson(LANDING_PREVIOUS_KEY);
  const legacy = current?.slots?.["ananya-green"];
  const before = current?.ananya || (legacy?.active ? { ...legacy, items: [legacy], autoPlay: false, intervalSeconds: 6 } : { active: false });
  await storagePutJson(LANDING_PREVIOUS_KEY, { ...previous, version: 1, ananya: before });
  await storagePutJson(LANDING_CURRENT_KEY, { ...current, version: 1, slots: current?.slots || {}, ananya: next });
}

function errorStatus(error) {
  const message = error instanceof Error ? error.message : "Unable to update hero media";
  if (message === "UPLOAD_TOO_LARGE") {
    return [413, "The selected file is too large for a web hero"];
  }
  if (/not configured/i.test(message)) return [503, message];
  if (/valid JSON|Request is too large|Choose a non-empty|Choose between|Choose media|Choose each/i.test(message)) {
    return [400, message];
  }
  return [502, message];
}

export function createHeroMediaHandler({ origin, hasStorefront }) {
  return async function handleHeroMedia(request, response, pathname) {
    if (pathname === "/api/hidi/hero-config") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendJson(response, 405, { message: "Method not allowed" });
        return true;
      }

      let value = {
        version: 1,
        active: false,
        source: "bundled",
      };

      try {
        value = publicConfig(await storageGetJson(CURRENT_KEY));
      } catch {
        response.setHeader("Retry-After", "1");
        sendJson(response, 503, { message: "Media is temporarily unavailable" });
        return true;
      }

      if (request.method === "HEAD") {
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end();
      } else {
        sendJson(response, 200, value);
      }
      return true;
    }

    if (pathname === "/api/hidi/landing-media-config") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendJson(response, 405, { message: "Method not allowed" });
        return true;
      }

      let value = publicLandingConfig(null);
      try {
        value = publicLandingConfig(await storageGetJson(LANDING_CURRENT_KEY));
      } catch {
        response.setHeader("Retry-After", "1");
        sendJson(response, 503, { message: "Media is temporarily unavailable" });
        return true;
      }

      if (request.method === "HEAD") {
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end();
      } else {
        sendJson(response, 200, value);
      }
      return true;
    }

    if (pathname.startsWith(HERO_ASSET_PREFIX)) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendPlain(response, 405, "Method not allowed");
        return true;
      }
      const key = assetKeyFromPath(pathname);
      if (!key) {
        sendPlain(response, 404, "Hero media not found");
        return true;
      }
      try {
        await proxyHeroAsset(request, response, key);
      } catch {
        if (!response.headersSent) sendPlain(response, 502, "Hero media unavailable");
        else response.destroy();
      }
      return true;
    }

    const isHeroAdminPath = pathname.startsWith("/api/hidi/hero-");
    const isLandingAdminPath = pathname.startsWith("/api/hidi/landing-media-");
    if (!isHeroAdminPath && !isLandingAdminPath) return false;

    if (!(await verifyAdmin(request, origin, hasStorefront))) {
      sendJson(response, 401, {
        message: "HIDI Admin sign-in is required",
      });
      return true;
    }

    try {
      if (pathname === "/api/hidi/hero-library" && request.method === "GET") {
        const [library, current, previous] = await Promise.all([
          loadLibrary(),
          storageGetJson(CURRENT_KEY),
          storageGetJson(PREVIOUS_KEY),
        ]);

        sendJson(response, 200, {
          ...library,
          current: publicConfig(current),
          previous: publicConfig(previous),
        });
        return true;
      }

      if (pathname === "/api/hidi/landing-media-library" && request.method === "GET") {
        const [library, current, previous] = await Promise.all([
          loadLandingLibrary(),
          storageGetJson(LANDING_CURRENT_KEY),
          storageGetJson(LANDING_PREVIOUS_KEY),
        ]);

        sendJson(response, 200, {
          ...library,
          current: publicLandingConfig(current),
          previous: publicLandingConfig(previous),
        });
        return true;
      }

      if (pathname === "/api/hidi/landing-media-ananya-publish" && request.method === "POST") {
        const next = requestedSequence(await readJsonBody(request), await loadLandingLibrary(), true);
        await saveAnanya(next);
        sendJson(response, 200, { current: publicSequence(next, true) });
        return true;
      }
      if (pathname === "/api/hidi/landing-media-ananya-reset" && request.method === "POST") {
        const next = { version: 1, active: false, source: "bundled", updatedAt: new Date().toISOString() };
        await saveAnanya(next);
        sendJson(response, 200, { current: publicSequence(next, true) });
        return true;
      }
      if (pathname === "/api/hidi/landing-media-ananya-restore" && request.method === "POST") {
        const previous = await storageGetJson(LANDING_PREVIOUS_KEY);
        if (!previous?.ananya) { sendJson(response, 404, { message: "There is no previous Ananya photo list yet" }); return true; }
        const restored = { ...previous.ananya, updatedAt: new Date().toISOString() };
        await saveAnanya(restored);
        sendJson(response, 200, { current: publicSequence(restored, true) });
        return true;
      }

      if (pathname === "/api/hidi/landing-media-upload" && request.method === "POST") {
        const mimeType = headerValue(request.headers["content-type"])
          .split(";")[0]
          .trim()
          .toLowerCase();
        const policy = LANDING_MEDIA_TYPES[mimeType];

        if (!policy) {
          sendJson(response, 400, {
            message: "Use JPEG, PNG, WebP or AVIF for landing photo slots",
          });
          return true;
        }

        const config = storageConfig();
        const originalName = cleanName(
          headerValue(request.headers["x-hidi-filename"]),
        );
        const uploaded = await receiveUpload(request, policy.maxBytes);
        const key = objectKey(mimeType, LANDING_MEDIA_KEY_PREFIX);

        try {
          const stored = await storageRequest("PUT", key, {
            filePath: uploaded.filePath,
            size: uploaded.size,
            payloadHash: uploaded.payloadHash,
            contentType: mimeType,
          });

          if (stored.status < 200 || stored.status >= 300) {
            throw new Error(`Hero media storage returned HTTP ${stored.status}`);
          }
        } finally {
          await unlink(uploaded.filePath).catch(() => {});
        }

        const asset = {
          id: randomUUID(),
          type: "image",
          mimeType,
          url: publicUrl(config, key),
          storagePath: storagePath(config, key),
          originalName,
          sizeBytes: uploaded.size,
          createdAt: new Date().toISOString(),
        };

        const library = await loadLandingLibrary();
        library.assets = [
          asset,
          ...library.assets.filter(item => item.id !== asset.id),
        ].slice(0, MAX_LANDING_LIBRARY);
        await storagePutJson(LANDING_LIBRARY_KEY, library);

        sendJson(response, 201, { asset });
        return true;
      }

      if (pathname === "/api/hidi/landing-media-publish" && request.method === "POST") {
        const body = await readJsonBody(request);
        const slotId = cleanSlotId(body.slotId);
        if (!slotId) {
          sendJson(response, 400, {
            message: "Choose a valid landing media slot",
          });
          return true;
        }

        const library = await loadLandingLibrary();
        const asset = library.assets.find(item => item.id === body.assetId);

        if (!asset) {
          sendJson(response, 400, {
            message: "Choose a photo from the landing media library",
          });
          return true;
        }

        const next = {
          version: 1,
          active: true,
          slotId,
          assetId: asset.id,
          type: "image",
          url: asset.url,
          originalName: asset.originalName,
          altText: typeof body.altText === "string" ? body.altText.trim().slice(0, 220) : "",
          desktopPosition: normalizePosition(body.desktopPosition),
          mobilePosition: normalizePosition(body.mobilePosition),
          fitMode: normalizeFitMode(body.fitMode),
          updatedAt: new Date().toISOString(),
        };

        await saveLandingSlot(slotId, next);
        sendJson(response, 200, {
          current: publicLandingSlot(next),
        });
        return true;
      }

      if (pathname === "/api/hidi/landing-media-reset" && request.method === "POST") {
        const body = await readJsonBody(request);
        const slotId = cleanSlotId(body.slotId);
        if (!slotId) {
          sendJson(response, 400, {
            message: "Choose a valid landing media slot",
          });
          return true;
        }

        const next = {
          version: 1,
          active: false,
          source: "bundled",
          updatedAt: new Date().toISOString(),
        };

        await saveLandingSlot(slotId, next);
        sendJson(response, 200, {
          current: publicLandingSlot(next),
        });
        return true;
      }

      if (pathname === "/api/hidi/landing-media-restore" && request.method === "POST") {
        const body = await readJsonBody(request);
        const slotId = cleanSlotId(body.slotId);
        const previous = await storageGetJson(LANDING_PREVIOUS_KEY);
        const previousSlots = previous?.slots && typeof previous.slots === "object" ? previous.slots : {};
        const slot = slotId ? previousSlots[slotId] : null;

        if (!slot) {
          sendJson(response, 404, {
            message: "There is no previous media for this slot yet",
          });
          return true;
        }

        const restored = {
          ...slot,
          updatedAt: new Date().toISOString(),
        };
        await saveLandingSlot(slotId, restored);

        sendJson(response, 200, {
          current: publicLandingSlot(restored),
        });
        return true;
      }

      if (pathname === "/api/hidi/hero-upload" && request.method === "POST") {
        const mimeType = headerValue(request.headers["content-type"])
          .split(";")[0]
          .trim()
          .toLowerCase();
        const policy = MEDIA_TYPES[mimeType];

        if (!policy) {
          sendJson(response, 400, {
            message: "Use JPEG, PNG, WebP, AVIF, MP4 or WebM",
          });
          return true;
        }

        const config = storageConfig();
        const originalName = cleanName(
          headerValue(request.headers["x-hidi-filename"]),
        );
        const uploaded = await receiveUpload(request, policy.maxBytes);
        const key = objectKey(mimeType);

        try {
          const stored = await storageRequest("PUT", key, {
            filePath: uploaded.filePath,
            size: uploaded.size,
            payloadHash: uploaded.payloadHash,
            contentType: mimeType,
          });

          if (stored.status < 200 || stored.status >= 300) {
            throw new Error(`Hero media storage returned HTTP ${stored.status}`);
          }
        } finally {
          await unlink(uploaded.filePath).catch(() => {});
        }

        const asset = {
          id: randomUUID(),
          type: policy.type,
          mimeType,
          url: publicUrl(config, key),
          storagePath: storagePath(config, key),
          originalName,
          sizeBytes: uploaded.size,
          createdAt: new Date().toISOString(),
        };

        const library = await loadLibrary();
        library.assets = [
          asset,
          ...library.assets.filter(item => item.id !== asset.id),
        ].slice(0, MAX_LIBRARY);
        await storagePutJson(LIBRARY_KEY, library);

        sendJson(response, 201, { asset });
        return true;
      }

      if (pathname === "/api/hidi/hero-publish" && request.method === "POST") {
        const body = await readJsonBody(request);
        const next = requestedSequence(body, await loadLibrary());
        await saveCurrent(next);
        sendJson(response, 200, { current: publicConfig(next) });
        return true;
      }

      if (pathname === "/api/hidi/hero-reset" && request.method === "POST") {
        const next = {
          version: 1,
          active: false,
          source: "bundled",
          updatedAt: new Date().toISOString(),
        };

        await saveCurrent(next);
        sendJson(response, 200, {
          current: publicConfig(next),
        });
        return true;
      }

      if (pathname === "/api/hidi/hero-restore" && request.method === "POST") {
        const previous = await storageGetJson(PREVIOUS_KEY);

        if (!previous) {
          sendJson(response, 404, {
            message: "There is no previous hero to restore yet",
          });
          return true;
        }

        const current = await storageGetJson(CURRENT_KEY);
        const restored = {
          ...previous,
          updatedAt: new Date().toISOString(),
        };
        await storagePutJson(CURRENT_KEY, restored);
        if (current) await storagePutJson(PREVIOUS_KEY, current);

        sendJson(response, 200, {
          current: publicConfig(restored),
        });
        return true;
      }

      response.setHeader(
        "Allow",
        pathname.endsWith("library") ? "GET" : "POST",
      );
      sendJson(response, 405, {
        message: "Method not allowed",
      });
      return true;
    } catch (error) {
      const [status, message] = errorStatus(error);
      sendJson(response, status, { message });
      return true;
    }
  };
}
