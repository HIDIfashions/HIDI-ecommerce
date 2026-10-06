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
const primarySiteOrigin = "https://thehidi.com";
const productionHosts = new Set(["thehidi.com", "www.thehidi.com"]);
const adminHeroMediaLink = `
<a data-hidi-hero-media-link="true" href="/admin/hero-media" aria-label="Open HIDI hero media admin"
  style="position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:10px 14px;border-radius:999px;background:#602124;color:#fff;text-decoration:none;font:600 13px Arial,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.18)">Hero Media</a>
`;
const storefrontLayerFix = `
<style data-hidi-storefront-layer-fix="true">
  /* Keep the real mobile announcement ticker and header above catalogue cards,
     while still allowing drawers / quick-add modals to sit above both. */
  [role="region"][aria-label="HIDI shopping services"] {
    position: sticky !important;
    top: 0 !important;
    z-index: 1001 !important;
    isolation: isolate !important;
  }
  .site-header {
    position: sticky !important;
    z-index: 1000 !important;
    isolation: isolate !important;
  }

  /* Quick Add selected size. */
  section[role="dialog"] [role="group"][aria-label^="Size for "] button[aria-pressed="true"] {
    background: #591d20 !important;
    border-color: #591d20 !important;
    color: #fff8ef !important;
    box-shadow: inset 0 0 0 1px rgba(213, 162, 77, .34) !important;
  }
  section[role="dialog"] [role="group"][aria-label^="Size for "] button[aria-pressed="true"] span {
    color: #fff8ef !important;
  }

  /* PDP selected size: same visual language as the HIDI header / Quick Add. */
  .product-page .sizes button[aria-pressed="true"] {
    background: #591d20 !important;
    border-color: #591d20 !important;
    color: #fff8ef !important;
    box-shadow: inset 0 0 0 1px rgba(213, 162, 77, .34) !important;
  }

  @media (max-width: 620px) {
    .product-page .pdp-grid {
      position: relative !important;
    }
    .product-page .pdp-info {
      padding-top: 16px !important;
    }
    .product-page .pdp-info > .eyebrow {
      margin-bottom: 5px !important;
    }
    .product-page .pdp-info h1 {
      margin-bottom: 5px !important;
    }
    .product-page .pdp-price {
      margin: 13px 0 15px !important;
    }
    .product-page .size-row-title {
      margin-top: 20px !important;
    }

    .hidi-pdp-gallery-controls {
      position: absolute;
      left: 0;
      right: 0;
      top: var(--hidi-pdp-gallery-mid, 280px);
      z-index: 24;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      pointer-events: none;
      transform: translateY(-50%);
    }
    .hidi-pdp-gallery-control {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(89, 29, 32, .16);
      border-radius: 50%;
      background: rgba(255, 248, 239, .94);
      color: #591d20;
      box-shadow: 0 6px 18px rgba(45, 24, 18, .16);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      pointer-events: auto;
      cursor: pointer;
      font: 500 27px/1 Arial, sans-serif;
      transition: opacity .18s ease, transform .18s ease, background .18s ease;
    }
    .hidi-pdp-gallery-control:not(:disabled):active {
      transform: scale(.96);
      background: #fff8ef;
    }
    .hidi-pdp-gallery-control:disabled {
      opacity: .24;
      cursor: default;
    }
  }
  @media (min-width: 621px) {
    .hidi-pdp-gallery-controls { display: none !important; }
  }

  /* Lower PDP trust + discovery hierarchy. */
  #reviews details summary {
    background: #591d20 !important;
    border-color: #591d20 !important;
    color: #fff8ef !important;
  }
  #reviews details summary:hover {
    background: #69282a !important;
  }

  @media (max-width: 620px) {
    .product-page {
      padding-bottom: 42px !important;
    }

    /* Bag polish: keep the final summary clear of the sticky checkout CTA. */
    .cart-page {
      padding-bottom: 150px !important;
    }
    .cart-page .order-summary {
      margin-bottom: 18px !important;
    }
    .cart-page .order-summary .fine-print {
      margin-top: 8px !important;
      padding-bottom: 6px !important;
    }

    /* Keep the bag count fully inside the mobile header instead of clipping
       into the announcement strip. */
    .site-header [class*="count"] {
      top: 2px !important;
      right: 0 !important;
    }

    /* Checkout: preserve HIDI styling during browser autofill and keep the
       final fields / validation feedback clear of the fixed pay CTA. */
    .checkout-page {
      padding-bottom: 158px !important;
    }
    .checkout-page .checkout-form {
      padding-bottom: 22px !important;
    }
    .checkout-page .checkout-field input,
    .checkout-page .checkout-form > .form-error {
      scroll-margin-bottom: 108px;
    }
    .checkout-page input:-webkit-autofill,
    .checkout-page input:-webkit-autofill:hover,
    .checkout-page input:-webkit-autofill:focus,
    .checkout-page input:-webkit-autofill:active {
      -webkit-text-fill-color: #34271f !important;
      caret-color: #34271f !important;
      -webkit-box-shadow: 0 0 0 1000px #fbf6f2 inset !important;
      box-shadow: 0 0 0 1000px #fbf6f2 inset !important;
      transition: background-color 9999s ease-out 0s !important;
    }
    .checkout-page .checkout-pay-button {
      padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
    }
    .pdp-info .delivery-box {
      margin-top: 18px !important;
      padding: 18px 0 !important;
    }
    .pdp-info .delivery-box > div {
      min-height: 48px;
    }
    .pdp-info details summary {
      min-height: 56px;
    }
    #reviews {
      margin: 42px 0 28px !important;
      padding-top: 28px !important;
    }
    #reviews > div:first-child {
      margin-bottom: 20px !important;
    }
    .pdp-related,
    .pdp-recent {
      margin-top: 44px !important;
    }
    .pdp-related-grid {
      row-gap: 38px !important;
    }
  }
</style>
<script data-hidi-pdp-gallery-controls="true">
(() => {
  const enhance = () => {
    const gallery = document.querySelector(".product-page .pdp-gallery");
    if (!gallery || gallery.dataset.hidiArrows === "true") return;
    const grid = gallery.closest(".pdp-grid");
    if (!grid) return;
    const slides = Array.from(gallery.querySelectorAll(".pdp-image"));
    if (slides.length < 2) return;

    gallery.dataset.hidiArrows = "true";

    const controls = document.createElement("div");
    controls.className = "hidi-pdp-gallery-controls";
    controls.setAttribute("aria-label", "Product image navigation");

    const make = (direction, label, symbol) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hidi-pdp-gallery-control";
      button.setAttribute("aria-label", label);
      button.textContent = symbol;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const first = slides[0];
        const gap = Number.parseFloat(getComputedStyle(gallery).gap || "0") || 0;
        const step = (first?.getBoundingClientRect().width || gallery.clientWidth) + gap;
        gallery.scrollBy({ left: direction * step, behavior: "smooth" });
      });
      return button;
    };

    const previous = make(-1, "Previous product image", "‹");
    const next = make(1, "Next product image", "›");
    controls.append(previous, next);
    grid.appendChild(controls);

    const updatePosition = () => {
      const first = slides[0];
      if (!first) return;
      grid.style.setProperty(
        "--hidi-pdp-gallery-mid",
        String(gallery.offsetTop + first.offsetHeight / 2) + "px",
      );
    };

    const updateState = () => {
      const max = Math.max(0, gallery.scrollWidth - gallery.clientWidth);
      previous.disabled = gallery.scrollLeft <= 8;
      next.disabled = gallery.scrollLeft >= max - 8;
    };

    updatePosition();
    updateState();
    gallery.addEventListener("scroll", updateState, { passive: true });

    const observer = new ResizeObserver(() => {
      updatePosition();
      updateState();
    });
    observer.observe(gallery);
    slides.forEach((slide) => observer.observe(slide));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhance, { once: true });
  } else {
    enhance();
  }

  const polishLowerPdp = () => {
    const page = document.querySelector(".product-page");
    if (!page) return;

    /* Conversion flow: delivery first, then product facts / accordions. */
    const delivery = page.querySelector(".delivery-box");
    const quality = page.querySelector('section[aria-label="Product quality and fit summary"]');
    if (delivery && quality && delivery.parentElement === quality.parentElement
        && delivery.nextElementSibling !== quality) {
      quality.parentElement.insertBefore(delivery, quality);
    }

    /* Trust before diversion: reviews directly after the main PDP grid. */
    const grid = page.querySelector(".pdp-grid");
    const reviews = page.querySelector("#reviews");
    if (grid && reviews && grid.nextElementSibling !== reviews) {
      grid.insertAdjacentElement("afterend", reviews);
    }

    /* Do not advertise a dead WhatsApp action during launch. */
    const disabledWhatsApp = page.querySelector('button[aria-haspopup="dialog"][disabled]');
    if (disabledWhatsApp) {
      disabledWhatsApp.hidden = true;
      const actionRow = disabledWhatsApp.parentElement;
      if (actionRow) actionRow.style.gridTemplateColumns = "1fr";
      const describedBy = disabledWhatsApp.getAttribute("aria-describedby");
      if (describedBy) {
        const note = document.getElementById(describedBy);
        if (note) note.hidden = true;
      }
    }

    /* Replace internal catalogue-warning language with customer copy. */
    page.querySelectorAll("p").forEach((paragraph) => {
      const text = (paragraph.textContent || "").trim();
      if (text.includes("Not specified. Do not infer included items from photography.")) {
        paragraph.innerHTML = paragraph.innerHTML.replace(
          "Not specified. Do not infer included items from photography.",
          "Not specified for this style yet."
        );
      }
      if (text.includes("Included pieces are not specified for this style yet. Photography alone does not confirm the contents.")) {
        paragraph.textContent = "Set contents are not specified for this style yet.";
      }
    });
  };

  const polishCheckout = () => {
    const page = document.querySelector(".checkout-page");
    if (!page) return;

    const phone = page.querySelector('input[name="phone"][type="tel"]');
    if (phone) {
      phone.setAttribute("pattern", "(?:\\+?91[ -]?)?[6-9][0-9]{9}");
      phone.setAttribute("title", "Enter a valid Indian mobile number (10 digits, optionally with +91).");
      phone.setAttribute("placeholder", "+91 98765 43210");
      phone.setAttribute("maxlength", "14");
    }
  };

  const runEnhancements = () => {
    enhance();
    polishLowerPdp();
    polishCheckout();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runEnhancements, { once: true });
  } else {
    polishLowerPdp();
    polishCheckout();
  }

  const observer = new MutationObserver(runEnhancements);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
</script>
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

function requestHost(request) {
  const forwarded = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const raw = forwarded || String(request.headers.host || "").trim();
  return raw.replace(/^\[/, "").replace(/\]$/, "").split(":")[0].toLowerCase();
}

function isProductionRequest(request) {
  return productionHosts.has(requestHost(request));
}

function privateSeoPath(pathname) {
  return ["/admin", "/account", "/cart", "/checkout", "/order-confirmed", "/wishlist", "/search", "/review"]
    .some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"));
}

function shouldNoIndex(request, pathname) {
  return !isProductionRequest(request) || privateSeoPath(pathname);
}

function canonicalFor(pathname) {
  return new URL(pathname || "/", primarySiteOrigin).toString();
}

function analyticsConfig(request) {
  const ga = String(process.env.GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || "").trim();
  const meta = String(process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();
  const ga4MeasurementId = /^G-[A-Z0-9]+$/i.test(ga) ? ga.toUpperCase() : "";
  const metaPixelId = /^\d{5,32}$/.test(meta) ? meta : "";
  return {
    enabled: isProductionRequest(request) && Boolean(ga4MeasurementId || metaPixelId),
    ga4MeasurementId: ga4MeasurementId || null,
    metaPixelId: metaPixelId || null,
  };
}

function sendJson(response, status, value, method = "GET") {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(method === "HEAD" ? undefined : body);
}

function sendRobots(request, response) {
  const production = isProductionRequest(request);
  const body = production
    ? [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "Disallow: /admin/",
        "Disallow: /account/",
        "Disallow: /cart",
        "Disallow: /checkout",
        "Disallow: /order-confirmed",
        "Disallow: /search",
        "Disallow: /wishlist",
        "Disallow: /review/",
        "Sitemap: https://thehidi.com/sitemap.xml",
        "Host: https://thehidi.com",
        "",
      ].join("\n")
    : "User-agent: *\nDisallow: /\n";
  response.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Robots-Tag": production ? "index, follow" : "noindex, nofollow, noarchive",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function shouldInjectSeo(request, pathname) {
  return request.method === "GET"
    && pathname !== "/admin/hero-media"
    && !pathname.startsWith("/api/")
    && pathname !== "/api"
    && !pathname.startsWith("/_next/")
    && pathname !== "/_next";
}

function injectSeo(html, request, pathname) {
  const canonical = canonicalFor(pathname);
  const robots = shouldNoIndex(request, pathname)
    ? "noindex, nofollow, noarchive"
    : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

  html = html
    .replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>\s*/gi, "")
    .replace(/<meta\b[^>]*\bname=["']robots["'][^>]*>\s*/gi, "")
    .replace(/<meta\b[^>]*\bproperty=["']og:url["'][^>]*>\s*/gi, "");

  const analytics = pathname.startsWith("/admin/")
    ? ""
    : '<script defer src="/hidi-analytics.js" data-hidi-analytics="1"></script>';
  const tags = [
    '<link rel="canonical" href="' + canonical + '" />',
    '<meta property="og:url" content="' + canonical + '" />',
    '<meta name="robots" content="' + robots + '" />',
    analytics,
  ].filter(Boolean).join("\n");

  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, tags + "\n</head>")
    : tags + html;
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
  const injectSeoTags = shouldInjectSeo(request, pathname);
  if (injectHeroLink || injectLayerFix || injectSeoTags) delete headers["accept-encoding"];
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
    const canInject = (injectHeroLink || injectLayerFix || injectSeoTags)
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
      if (injectSeoTags) html = injectSeo(html, request, pathname);
      if (injectHeroLink) html = injectAdminHeroLink(html);
      const body = Buffer.from(html);
      responseHeaders["content-length"] = String(body.length);
      if (shouldNoIndex(request, pathname)) responseHeaders["x-robots-tag"] = "noindex, nofollow, noarchive";
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

  if (pathname === "/api/hidi/analytics-config") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return error(response, 405, "Method not allowed");
    }
    return sendJson(response, 200, analyticsConfig(request), request.method);
  }

  if (pathname === "/robots.txt") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return error(response, 405, "Method not allowed");
    }
    return sendRobots(request, response);
  }

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

  if (extension === ".html" && shouldNoIndex(request, pathname)) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

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
