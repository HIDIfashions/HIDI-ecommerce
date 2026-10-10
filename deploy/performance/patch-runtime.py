"""Patch the captured live runtime with reviewed, exact-match replacements."""
from pathlib import Path
import hashlib
import sys

BASE_RUNTIME_SHA = '91beaec485203d4c2aedc0e906f8d243c14fefec39deedd68712e8639cf4a2db'

def patch(source):
    assert hashlib.sha256(source.encode()).hexdigest() == BASE_RUNTIME_SHA, 'Runtime differs from backed-up live release; stop for review'
    def replace(before, after):
        nonlocal source
        assert source.count(before) == 1, 'Runtime anchor is not unique: ' + before[:80]
        source = source.replace(before, after)
    replace('import { createPrivacyPolicyHandler } from "./privacy-policy/handler.mjs";', 'import { createPrivacyPolicyHandler } from "./privacy-policy/handler.mjs";\nimport { sendBuffer, streamHtml } from "./performance/delivery.mjs";\nimport { createPerformanceHandler } from "./performance/metrics.mjs";')
    replace('const privacyPolicyLinkScript = \'<script defer data-hidi-privacy-links src="/privacy-policy-assets/links.js"></script>\';', 'const performanceHandler = createPerformanceHandler({ origin });\nconst privacyPolicyLinkScript = \'<script defer data-hidi-privacy-links src="\' + performanceHandler.links + \'"></script>\';')
    replace('  html = injectPrivacyPolicyLinks(html);\n  if (html.includes("data-hidi-storefront-layer-fix"))', '  if (html.includes("data-hidi-storefront-layer-fix"))')
    replace('    analytics,\n  ].filter(Boolean)', '    analytics,\n    !privateSeoPath(pathname) ? \'<script defer data-hidi-performance src="\' + performanceHandler.rum + \'"></script>\' : "",\n  ].filter(Boolean)')
    replace('  if (await handlePrivacyPolicy(request, response, pathname)) return;', '  if (await performanceHandler.handle(request, response, pathname)) return;\n  if (await handlePrivacyPolicy(request, response, pathname)) return;')
    replace('  const cacheable = shouldCachePublicHtml(request, pathname);', '  const started = performance.now();\n  const cacheable = shouldCachePublicHtml(request, pathname);')
    replace('    const contentType = String(responseHeaders["content-type"] || "");', '    responseHeaders["server-timing"] = "upstream;dur=" + (performance.now() - started).toFixed(1);\n    const contentType = String(responseHeaders["content-type"] || "");')
    replace('function proxyApi(request, response, pathname) {', 'function proxyApi(request, response, pathname) {\n  const started = performance.now();')
    replace('    response.writeHead(incoming.statusCode || 502, responseHeaders);\n    incoming.on("error", () => response.destroy());', '    responseHeaders["server-timing"] = "api;dur=" + (performance.now() - started).toFixed(1);\n    response.writeHead(incoming.statusCode || 502, responseHeaders);\n    incoming.on("error", () => response.destroy());')
    replace('    response.writeHead(cached.status, cachedHeaders);\n    response.end(cached.body);', '    cachedHeaders["server-timing"] = "cache;desc=\\"HIT\\";dur=0";\n    sendBuffer(request, response, cached.status, cachedHeaders, cached.body);')
    replace('  const injectLandingLink = shouldInjectAdminLandingLink(request, pathname);\n  const injectLayerFix = shouldInjectStorefrontLayerFix(request, pathname);\n  const injectSeoTags = shouldInjectSeo(request, pathname);', '  const documentRequest = !request.headers.rsc && !request.headers["next-router-prefetch"];\n  const injectLandingLink = documentRequest && shouldInjectAdminLandingLink(request, pathname);\n  const injectLayerFix = documentRequest && shouldInjectStorefrontLayerFix(request, pathname);\n  const injectSeoTags = documentRequest && shouldInjectSeo(request, pathname);')
    start = source.index('    const chunks = [];', source.index('function proxy(request'))
    end = source.index('\n  });\n  upstream.on("error"', start)
    source = source[:start] + '''    responseHeaders["server-timing"] = "upstream;dur=" + (performance.now() - started).toFixed(1) + ", transform;desc=\\"bounded HTML stream\\"";
    if (shouldNoIndex(request, pathname)) responseHeaders["x-robots-tag"] = "noindex, nofollow, noarchive";
    const eligible = cacheable && status === 200 && !responseHeaders["set-cookie"];
    if (eligible) responseHeaders["x-hidi-cache"] = "MISS";
    streamHtml(request, response, incoming, status, responseHeaders, {
      cacheLimit: eligible ? Math.min(adminHtmlInjectionLimit, 2 * 1024 * 1024) : 0,
      head: html => {
        if (injectLayerFix) html = injectStorefrontLayerFix(html);
        if (injectSeoTags) html = injectSeo(html, request, pathname);
        return html;
      },
      tail: html => {
        if (injectLayerFix) html = injectPrivacyPolicyLinks(html);
        if (injectLandingLink) html = injectAdminLandingLink(html);
        return html;
      },
      onComplete: body => {
        if (!eligible || !body) return;
        const cachedHeaders = { ...responseHeaders };
        for (const key of ["date", "transfer-encoding", "connection", "content-length", "etag", "server-timing"]) delete cachedHeaders[key];
        cachedHeaders["content-length"] = String(body.length);
        writePublicHtmlCache(cacheKey, { status, headers: cachedHeaders, body });
      },
    });''' + source[end:]
    replace('    response.writeHead(200);\n    return response.end(request.method === "HEAD" ? undefined : body);', '    return sendBuffer(request, response, 200, response.getHeaders(), body);')
    before = 'noneMatch?.split(",").map(value => value.trim()).includes(etag)'
    assert source.count(before) == 2
    source = source.replace(before, 'noneMatch?.split(",").map(value => value.trim().replace(/^W\\//, "")).includes(etag)')
    replace('  const isVersionedBundle = ', '  const isPerformanceImage = /\\/assets\\/images\\/performance\\/banner-[0-9a-f]{12}-(640|1280|1920|2560)\\.webp$/.test(filePath);\n  const isVersionedBundle = isPerformanceImage || ')
    # Avoid mixed responses for legacy RSC requests into the separate landing app.
    # Next already treats an empty non-RSC response as a hard-navigation fallback.
    replace('  const landingPath = pathname === "/admin/hero-media"', '''  if (pathname === "/" && (request.headers.rsc || request.headers["next-router-prefetch"])) {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Vary": "RSC, Next-Router-Prefetch" });
    return response.end();
  }

  const landingPath = pathname === "/admin/hero-media"''')
    return source

if __name__ == '__main__':
    Path(sys.argv[2]).write_text(patch(Path(sys.argv[1]).read_text()))
