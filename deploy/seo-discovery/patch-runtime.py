"""Fail-closed SEO-only overlay for the reviewed current live wrapper."""
from pathlib import Path
import hashlib

HERE = Path(__file__).resolve().parent
BASE_SHA = '6292e91f0a84c8d45febc9e0fae418417ad2893c53e01cc2a8569451e0ebe44d'
PHASE1_SHA = '5bef6e854810aaf5b536c6ef389366d6435857926435ec3acb010426312d6135'
METADATA_BASE_SHA = '6ed0aa58a93f91651dbaf3035cfc93da3bd1f130c76be32fff3f0fb393bda79b'
METADATA_HELPER_SHA = '78afd9bd62aedccf395d16edc881951fc45cba5ecdf7f8f588670b2178cf7290'
SITEMAP_HELPER_SHA = 'c8cb5640b825a9681ef69cf30349bf3c69af8521e96ea0f3565aa949cd94a530'
HEADER_BEFORE = '    const contentType = String(responseHeaders["content-type"] || "");'
HEADER_AFTER = HEADER_BEFORE + '\n    if (status === 200 && contentType.includes("text/html")) {\n      if (shouldNoIndex(request, pathname)) responseHeaders["x-robots-tag"] = "noindex, nofollow, noarchive";\n      else delete responseHeaders["x-robots-tag"];\n    }'

def patch_text(source):
    source_sha=hashlib.sha256(source.encode()).hexdigest()
    if source_sha == METADATA_BASE_SHA:
        before = '  html = normalizeSeoIdentity(html);'
        after = '  html = normalizeSeoIdentity(html, isProductionRequest(request) ? pathname : undefined);'
        assert source.count(before)==1 and after not in source, 'Reviewed metadata injection anchor changed'
        result=source.replace(before,after,1)
        assert result.replace(after,before,1)==source, 'Changes outside the metadata injection call'
        return result
    if source_sha == PHASE1_SHA:
        assert source.count(HEADER_BEFORE)==1 and HEADER_AFTER not in source, 'Reviewed public-header anchor changed'
        result=source.replace(HEADER_BEFORE,HEADER_AFTER,1)
        assert result.replace(HEADER_AFTER,HEADER_BEFORE,1)==source, 'Changes outside the SEO response header'
        return result
    assert source_sha == BASE_SHA, 'Live wrapper changed; inspect the new baseline first'
    changes = [
        (HEADER_BEFORE, HEADER_AFTER),
        ('const primarySiteOrigin = "https://thehidi.com";', 'const primarySiteOrigin = "https://hidiindia.com";'),
        ('const productionHosts = new Set(["thehidi.com", "www.thehidi.com"]);', 'const productionHosts = new Set(["thehidi.com", "www.thehidi.com", "hidiindia.com", "www.hidiindia.com"]);'),
        ('"Sitemap: https://thehidi.com/sitemap.xml"', '"Sitemap: https://hidiindia.com/sitemap.xml"'),
        ('"Host: https://thehidi.com"', '"Host: https://hidiindia.com"'),
        ('import { createPrivacyPolicyHandler } from "./privacy-policy/handler.mjs";', 'import { createPrivacyPolicyHandler } from "./privacy-policy/handler.mjs";\nimport { normalizeSeoIdentity, clientMetadataScript, createSeoIdentityStream } from "./seo-discovery/metadata.mjs";\nimport { createSeoSitemap } from "./seo-discovery/sitemap.mjs";'),
        ('function injectSeo(html, request, pathname) {\n', 'function injectSeo(html, request, pathname) {\n  html = normalizeSeoIdentity(html);\n'),
        ('    verification,\n    analytics,', '    verification,\n    isProductionRequest(request) ? clientMetadataScript : "",\n    analytics,'),
        ('    streamHtml(request, response, incoming, status, responseHeaders, {', '    streamHtml(request, response, createSeoIdentityStream(incoming), status, responseHeaders, {'),
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
    metadata_phase=hashlib.sha256((base/'server.mjs').read_bytes()).hexdigest()==METADATA_BASE_SHA
    assert metadata_phase, 'Phase 3 requires the freshly inspected current live wrapper'
    if metadata_phase:
        assert hashlib.sha256((base/'seo-discovery/metadata.mjs').read_bytes()).hexdigest()==METADATA_HELPER_SHA, 'Live SEO helper changed; inspect again'
        assert hashlib.sha256((base/'seo-discovery/sitemap.mjs').read_bytes()).hexdigest()==SITEMAP_HELPER_SHA, 'Live sitemap helper changed; inspect again'
    updated=patch_text((base/'server.mjs').read_text())
    overlay.mkdir(parents=True,exist_ok=True);(overlay/'server.mjs').write_text(updated)
    (overlay/'seo-discovery').mkdir()
    helper_names=['metadata.mjs'] if metadata_phase else ['metadata.mjs','sitemap.mjs']
    for name in helper_names:(overlay/'seo-discovery'/name).write_bytes((HERE/name).read_bytes())
    return {'passed':True,'allowedFiles':['server.mjs',*['seo-discovery/'+name for name in helper_names]],'seoOnly':True,'inverseTransformsVerified':True,'databaseWrites':False,'blobWrites':False,'apiUnchanged':True}
