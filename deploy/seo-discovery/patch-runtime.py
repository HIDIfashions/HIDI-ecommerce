"""Fail-closed SEO-only overlay for the reviewed current live wrapper."""
from pathlib import Path
import hashlib

HERE = Path(__file__).resolve().parent
IMAGE_DISCOVERY_SERVER_SHA = '80ca9c482c3c574a1122603ee077ed5b5d740d528a842a3d8cea6e63a36d7365'
IMAGE_DISCOVERY_METADATA_SHA = '7e82f861f237eb33a2962f40c6afa6263314e53e336464b55c424dd5c9532060'
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
        changes=[
            ('  html = normalizeSeoIdentity(html);', '  html = normalizeSeoIdentity(html, isProductionRequest(request) ? pathname : undefined);'),
            ('normalizeSeoIdentity, clientMetadataScript, createSeoIdentityStream }', 'normalizeSeoIdentity, clientMetadataScript, createSeoIdentityStream, shouldIndexPublishedImage }'),
            (HEADER_AFTER, HEADER_AFTER+'\n    if (shouldIndexPublishedImage(status, contentType, requestHost(request), pathname)) {\n      delete responseHeaders["x-robots-tag"];\n    }'),
        ]
        result=source
        for before,after in changes:
            assert result.count(before)==1 and after not in result, 'Reviewed SEO metadata/header anchor changed'
            result=result.replace(before,after,1)
        restored=result
        for before,after in reversed(changes):restored=restored.replace(after,before,1)
        assert restored==source, 'Changes outside reviewed SEO metadata and published-image headers'
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
    expected={
        'server.mjs':'870fac80dd38422fff7965693a853f3ba0501e5d4fb94414e310cebee19350c2',
        'privacy-policy/handler.mjs':'47bc7f3fd140786d6c25c41e9c44f770b3dfff8fa2a16f016b9589aa7505c328',
        'seo-discovery/metadata.mjs':'87f65b52a4a7a26a77a659a6f43d85b6b58468d9b335a165c052c9f877d7dd80',
        'seo-discovery/sitemap.mjs':'3a06940f2e8069df26064611536c8479b5f3a2b188c077714b9c765bfa321bd3',
        'seo-discovery/published-product-images.json':'da8de244a5c8d894fd3add64e6c7e17ba11b632eac8eca6eebf5805a74e95347',
        'dist/hidi-analytics.js':'d626a5bcc6fe7313e55ea85fe66347f4c41e3abf1fb02697e2ef45033f9085ea',
    }
    for name,digest in expected.items():
        assert hashlib.sha256((base/name).read_bytes()).hexdigest()==digest, 'Inspected baseline changed: '+name
    overlay.mkdir(parents=True,exist_ok=True)
    (overlay/'seo-discovery').mkdir()
    metadata=(HERE/'metadata.mjs').read_bytes()
    assert hashlib.sha256(metadata).hexdigest()=='b116e5a30303f7bdb8dec14d314f8e0941801d3a7706c2b9b1274141ab1f30ce', 'Reviewed brand identity helper changed'
    (overlay/'seo-discovery/metadata.mjs').write_bytes(metadata)
    return {'passed':True,'allowedFiles':['seo-discovery/metadata.mjs'],
            'seoOnly':True,'policyBodyUnchanged':True,'analyticsUnchanged':True,'publishedImagesUnchanged':True,
            'databaseWrites':False,'blobWrites':False,'apiUnchanged':True}
