"""Fail-closed SEO-only overlay for the reviewed current live wrapper."""
from pathlib import Path
import hashlib

HERE = Path(__file__).resolve().parent
BASE_SHA = '6292e91f0a84c8d45febc9e0fae418417ad2893c53e01cc2a8569451e0ebe44d'

def patch_text(source):
    assert hashlib.sha256(source.encode()).hexdigest() == BASE_SHA, 'Live wrapper changed; inspect the new baseline first'
    changes = [
        ('const primarySiteOrigin = "https://thehidi.com";', 'const primarySiteOrigin = "https://hidiindia.com";'),
        ('const productionHosts = new Set(["thehidi.com", "www.thehidi.com"]);', 'const productionHosts = new Set(["thehidi.com", "www.thehidi.com", "hidiindia.com", "www.hidiindia.com"]);'),
        ('"Sitemap: https://thehidi.com/sitemap.xml"', '"Sitemap: https://hidiindia.com/sitemap.xml"'),
        ('"Host: https://thehidi.com"', '"Host: https://hidiindia.com"'),
        ('import { createPrivacyPolicyHandler } from "./privacy-policy/handler.mjs";', 'import { createPrivacyPolicyHandler } from "./privacy-policy/handler.mjs";\nimport { normalizeSeoIdentity } from "./seo-discovery/metadata.mjs";\nimport { createSeoSitemap } from "./seo-discovery/sitemap.mjs";'),
        ('function injectSeo(html, request, pathname) {\n', 'function injectSeo(html, request, pathname) {\n  html = normalizeSeoIdentity(html);\n'),
        ('    if (shouldNoIndex(request, pathname)) responseHeaders["x-robots-tag"] = "noindex, nofollow, noarchive";', '    if (shouldNoIndex(request, pathname)) responseHeaders["x-robots-tag"] = "noindex, nofollow, noarchive";\n    else if (status === 200 && contentType.includes("text/html")) delete responseHeaders["x-robots-tag"];'),
        ('function proxySitemap(request, response) {', 'const seoCatalogueBase = (process.env.INTERNAL_API_URL || process.env.API_URL || "").replace(/\\/$/, "");\nconst sendSeoSitemap = createSeoSitemap({ catalogueUrl: seoCatalogueBase + "/products", isProductionRequest });\n\nfunction proxySitemap(request, response) {\n  return sendSeoSitemap(request, response);'),
    ]
    result=source
    for before, after in changes:
        assert result.count(before) == 1, 'Unique reviewed SEO anchor missing: ' + before[:80]
        result=result.replace(before,after,1)
    restored=result
    for before,after in reversed(changes):
        assert restored.count(after)==1
        restored=restored.replace(after,before,1)
    assert restored==source, 'Unrelated runtime code changed'
    return result

def patch_runtime(base, overlay):
    base,overlay=Path(base),Path(overlay)
    updated=patch_text((base/'server.mjs').read_text())
    overlay.mkdir(parents=True,exist_ok=True);(overlay/'server.mjs').write_text(updated)
    (overlay/'seo-discovery').mkdir()
    for name in ['metadata.mjs','sitemap.mjs']:(overlay/'seo-discovery'/name).write_bytes((HERE/name).read_bytes())
    return {'passed':True,'allowedFiles':['server.mjs','seo-discovery/metadata.mjs','seo-discovery/sitemap.mjs'],'seoOnly':True,'inverseTransformsVerified':True,'databaseWrites':False,'blobWrites':False,'apiUnchanged':True}
