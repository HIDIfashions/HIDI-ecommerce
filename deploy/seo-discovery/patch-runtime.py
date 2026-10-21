"""Fail-closed SEO-only overlay for the reviewed current live wrapper."""
from pathlib import Path
import hashlib, re

HERE = Path(__file__).resolve().parent
IMAGE_DISCOVERY_SERVER_SHA = '80ca9c482c3c574a1122603ee077ed5b5d740d528a842a3d8cea6e63a36d7365'
IMAGE_DISCOVERY_METADATA_SHA = '7e82f861f237eb33a2962f40c6afa6263314e53e336464b55c424dd5c9532060'
BASE_SHA = '6292e91f0a84c8d45febc9e0fae418417ad2893c53e01cc2a8569451e0ebe44d'
PHASE1_SHA = '5bef6e854810aaf5b536c6ef389366d6435857926435ec3acb010426312d6135'
METADATA_BASE_SHA = '6ed0aa58a93f91651dbaf3035cfc93da3bd1f130c76be32fff3f0fb393bda79b'
METADATA_HELPER_SHA = '78afd9bd62aedccf395d16edc881951fc45cba5ecdf7f8f588670b2178cf7290'
SITEMAP_HELPER_SHA = 'c8cb5640b825a9681ef69cf30349bf3c69af8521e96ea0f3565aa949cd94a530'
FOUNDATION_BUNDLE_SHA = 'cab82d617544299bcd56b6072987d9acb2db7da0e51d0539a92879b5c14047b2'
ABOUT_OLD = 'From responsibility and ambition to the moments that are entirely your own, HIDI is made for women who move through every day with ease, confidence and quiet elegance.'
ABOUT_MARKER = 'Introduced by actress Ananya Nagalla'
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
        'server.mjs':'d25c5bc3dfca427cfe0771ccc0444e69feb28e7a07249bd94fcc13156bb6f9a2',
        'privacy-policy/handler.mjs':'47bc7f3fd140786d6c25c41e9c44f770b3dfff8fa2a16f016b9589aa7505c328',
        'seo-discovery/metadata.mjs':'b7a30602764f95acc1fa27cf820127d7432e2c00972ef27178ef48ca28e55b05',
        'seo-discovery/sitemap.mjs':'3589d48f90ef0687592716a025a2e786042de043911eb351b97eee7b17005f5d',
        'seo-discovery/published-product-images.json':'ed1cb9149498306cb0689132f5a0c314f705b004de1c2a79eeeb1c9e85b8d11b',
        'dist/hidi-analytics.js':'d626a5bcc6fe7313e55ea85fe66347f4c41e3abf1fb02697e2ef45033f9085ea',
    }
    for name,digest in expected.items():
        assert hashlib.sha256((base/name).read_bytes()).hexdigest()==digest, 'Inspected baseline changed: '+name

    # The retained production image already contains the reviewed navigation and
    # About-copy foundation. Verify its exact bytes and preserve it instead of
    # attempting to apply the historical one-time patch a second time.
    html=(base/'dist/index.html').read_bytes()
    refs=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html)
    assert len(refs)==1, 'Expected one retained landing module'
    landing_name=refs[0].decode().removeprefix('./').removeprefix('/')
    assert re.fullmatch(r'assets/index-[A-Za-z0-9_-]+\.js',landing_name), 'Unexpected retained landing module path'
    landing=(base/'dist'/landing_name).read_bytes()
    assert hashlib.sha256(landing).hexdigest()==FOUNDATION_BUNDLE_SHA, 'Reviewed SEO foundation bundle changed'
    assert b'function HidiSeoLinkProps' in landing, 'Reviewed semantic navigation helper missing'
    about=[]
    old_about=0
    for path in base.rglob('*'):
        if not path.is_file() or path.suffix not in ['.js','.html','.rsc']:
            continue
        data=path.read_bytes()
        old_about+=data.count(ABOUT_OLD.encode())
        count=data.count(ABOUT_MARKER.encode())
        if count:
            about.append({'path':path.relative_to(base).as_posix(),'occurrences':count})
    assert old_about==0 and about, 'Reviewed HIDI About foundation changed'

    overlay.mkdir(parents=True,exist_ok=True)
    (overlay/'seo-discovery').mkdir()
    metadata=(HERE/'metadata.mjs').read_bytes()
    assert hashlib.sha256(metadata).hexdigest()=='5fb2c9a5f623e33b627432646ccb4d85ad6a345800d634289e4a8dceb660b8e6', 'Reviewed brand identity helper changed'
    (overlay/'seo-discovery/metadata.mjs').write_bytes(metadata)
    source=(base/'server.mjs').read_text()
    stream_old='createSeoIdentityStream(incoming), status, responseHeaders'
    stream_new='createSeoIdentityStream(incoming, isProductionRequest(request) ? pathname : undefined), status, responseHeaders'
    import_old='import { normalizeSeoIdentity, clientMetadataScript, createSeoIdentityStream, shouldIndexPublishedImage } from "./seo-discovery/metadata.mjs";'
    import_new='import { normalizeSeoIdentity, clientMetadataScript, createSeoIdentityStream, shouldIndexPublishedImage, handleCanonicalHostRedirect } from "./seo-discovery/metadata.mjs";'
    assert source.count(stream_old)==0 and source.count(stream_new)==1, 'Expected the reviewed pathname-aware body stream call'
    assert source.count(import_old)==1 and import_new not in source, 'Expected the reviewed SEO helper import'
    route_anchors=[
        '  if (handleGuide(request, response, pathname, isProductionRequest(request))) return;',
        '  if (handleCatalogueAlias(request, response, pathname)) return;',
    ]
    route_old=next((value for value in route_anchors if source.count(value)==1),None)
    assert route_old, 'Expected one reviewed route-dispatch anchor'
    route_new='  if (handleCanonicalHostRedirect(request, response)) return;\n'+route_old
    changes=[(import_old,import_new),(route_old,route_new)]
    server=source
    for old,new in changes:
        assert server.count(old)==1 and new not in server, 'Reviewed canonical-host anchor changed'
        server=server.replace(old,new,1)
    restored=server
    for old,new in reversed(changes):restored=restored.replace(new,old,1)
    assert restored==source, 'Unrelated server bytes changed'
    (overlay/'server.mjs').write_text(server)
    foundation_plan={'passed':True,'allowedFiles':[],'alreadyApplied':True,
                     'landingModule':'dist/'+landing_name,'landingSha256':FOUNDATION_BUNDLE_SHA,
                     'aboutCopyFiles':about,'preserved':True}
    return {'passed':True,'allowedFiles':['seo-discovery/metadata.mjs','server.mjs'],
            'foundation':foundation_plan,
            'seoOnly':True,'canonicalHostRedirect':True,'policyBodyUnchanged':True,'analyticsUnchanged':True,'publishedImagesUnchanged':True,
            'databaseWrites':False,'blobWrites':False,'apiUnchanged':True}
