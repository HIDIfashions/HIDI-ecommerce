"""Add the read-only feed route and query-specific variant selection to the inspected runtime."""
from pathlib import Path
import hashlib

HERE=Path(__file__).resolve().parent
PRICING_GUARD='  const product=document.querySelector("[data-hidi-react-pdp]");\n  if(product && product.dataset.hidiHydrated!=="true")return;\n'
PRICING_READY="window.addEventListener('hidi:product-ready',apply);\n"
def patch_pricing(source):
    if PRICING_GUARD in source:
        assert source.count(PRICING_GUARD)==1 and source.count(PRICING_READY)==1
        return source
    first='function apply(){\n';second="window.addEventListener('pageshow',refresh);"
    assert source.count(first)==1 and source.count(second)==1,'Unreviewed pricing enhancer'
    result=source.replace(first,first+PRICING_GUARD,1).replace(second,PRICING_READY+second,1)
    assert result.replace(PRICING_GUARD,'',1).replace(PRICING_READY,'',1)==source
    return result
def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    source=(base/'server.mjs').read_text()
    # Compose on the freshly captured ready image. Exact unique anchors below,
    # inverse byte comparison, whole-image preservation and candidate browsers
    # guard the change while retaining independent stylesheet/pricing releases.
    changes=[
      ('import { createSeoSitemap } from "./seo-discovery/sitemap.mjs";', 'import { createSeoSitemap } from "./seo-discovery/sitemap.mjs";\nimport { createMerchantFeed } from "./merchant-feed/feed.mjs";'),
      ('const sendSeoSitemap = createSeoSitemap({ catalogueUrl: seoCatalogueBase + "/products", isProductionRequest });', 'const sendSeoSitemap = createSeoSitemap({ catalogueUrl: seoCatalogueBase + "/products", isProductionRequest });\nconst sendMerchantFeed = createMerchantFeed({ catalogueUrl: seoCatalogueBase + "/products", isProductionRequest });'),
      ('  if (pathname === "/sitemap.xml") {', '  if (pathname === "/google-products.xml") return sendMerchantFeed(request, response);\n\n  if (pathname === "/sitemap.xml") {'),
      ('    verification,\n    isProductionRequest(request) ? clientMetadataScript : "",', '    verification,\n    /^\\/products\\/[a-z0-9-]+$/.test(pathname) && /^[A-Za-z0-9_-]{1,50}$/.test(new URL(request.url, "http://localhost").searchParams.get("variant") || "") ? \'<script defer src="/hidi-merchant-variant-v1.js"></script>\' : "",\n    isProductionRequest(request) ? clientMetadataScript : "",'),
    ]
    result=source
    for before,after in changes:
        assert result.count(before)==1 and after not in result,'Reviewed runtime anchor changed: '+before[:80]
        result=result.replace(before,after,1)
    restored=result
    for before,after in reversed(changes):restored=restored.replace(after,before,1)
    assert restored==source,'Unrelated runtime code changed'
    files={'server.mjs':result.encode(),'merchant-feed/feed.mjs':(HERE/'feed.mjs').read_bytes(),'dist/hidi-merchant-variant-v1.js':(HERE/'variant.js').read_bytes()}
    pricing=base/'pricing/storefront.mjs'
    if pricing.is_file():
        previous=pricing.read_text();compatible=patch_pricing(previous)
        if compatible!=previous:files['pricing/storefront.mjs']=compatible.encode()
    for name,data in files.items():
        assert name in ['server.mjs','pricing/storefront.mjs'] or not (base/name).exists(),'Feed already installed'
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'baselineServerSha256':hashlib.sha256(source.encode()).hexdigest(),'inverseTransformsVerified':True,'databaseWrites':False,'apiUnchanged':True}
