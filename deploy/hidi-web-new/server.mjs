import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd(), "dist");
const port = Number(process.env.PORT || 3000);

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

createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return error(response, 405, "Method not allowed");
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
    const body = JSON.stringify({ status: "ok" });
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body),
    });
    return response.end(body);
  }

  let filePath = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!filePath.startsWith(`${root}${sep}`)) {
    return error(response, 403, "Forbidden");
  }

  let stat;
  try {
    stat = statSync(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
  } catch {
    // Only application routes use the SPA entry point. Missing assets must stay 404.
    if (extname(pathname) || pathname.startsWith("/assets/")) {
      return error(response, 404, "Not found");
    }
    filePath = resolve(root, "index.html");
    try {
      stat = statSync(filePath);
    } catch {
      return error(response, 503, "Application unavailable");
    }
  }

  const extension = extname(filePath).toLowerCase();
  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
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
      || (!noneMatch && request.headers["if-modified-since"]
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
    || Date.parse(ifRange) >= Math.floor(stat.mtimeMs / 1000) * 1000;
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
}).listen(port, "0.0.0.0", () => {
  console.log(`HIDI landing page listening on ${port}`);
});
