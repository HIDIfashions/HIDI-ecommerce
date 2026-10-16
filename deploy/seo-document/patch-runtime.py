"""Exact-image, reversible discovery overlay. Never rewrites product/commerce code."""
import pathlib,hashlib,re,json
HERE=pathlib.Path(__file__).resolve().parent
def exact(source,changes):
    result=source
    for old,new in changes:
        assert result.count(old)==1 and new not in result,'Reviewed anchor changed: '+old[:90]
        result=result.replace(old,new,1)
    inverse=result
    for old,new in reversed(changes):inverse=inverse.replace(new,old,1)
    assert inverse==source,'Unrelated bytes changed'
    return result
def patch_runtime(base,overlay):
    base,overlay=pathlib.Path(base),pathlib.Path(overlay)
    assert not overlay.exists()
    server=(base/'server.mjs').read_bytes()
    assert hashlib.sha256(server).hexdigest()=='6a62c78c71f98dc7c060abd25ce44289229ca4e34a8f5d7641195aef176c294a','Deployed wrapper changed; inspect before release'
    changes=[
      ('import { createSeoSitemap } from "./seo-discovery/sitemap.mjs";','import { createSeoSitemap } from "./seo-discovery/sitemap.mjs";\nimport { addHomeDiscovery, addReturnPolicy, handleGuide } from "./seo-document/discovery.mjs";'),
      ('        "Disallow: /api/",','        "Disallow: /api/",\n        "Allow: /api/hidi/hero-asset/",'),
      ('  html = normalizeSeoIdentity(html, isProductionRequest(request) ? pathname : undefined);','  html = normalizeSeoIdentity(html, isProductionRequest(request) ? pathname : undefined);\n  if (isProductionRequest(request)) html = addReturnPolicy(html, pathname);'),
      ('  if (handleCatalogueAlias(request, response, pathname)) return;','  if (handleGuide(request, response, pathname, isProductionRequest(request))) return;\n  if (handleCatalogueAlias(request, response, pathname)) return;'),
      ('    if (pathname === "/") html = optimizeHomeHead(html);','    if (pathname === "/") html = addHomeDiscovery(optimizeHomeHead(html));'),
    ]
    files={'server.mjs':exact(server.decode(),changes).encode(),'seo-document/discovery.mjs':(HERE/'discovery.mjs').read_bytes()}
    sitemap=(base/'seo-discovery/sitemap.mjs').read_text()
    files['seo-discovery/sitemap.mjs']=sitemap.replace("'/privacy'];","'/privacy', '/guides', '/guides/kurta-set-buying-guide', '/guides/choosing-kurta-set-size'];",1).encode()
    assert files['seo-discovery/sitemap.mjs'].decode().replace("'/privacy', '/guides', '/guides/kurta-set-buying-guide', '/guides/choosing-kurta-set-size'];","'/privacy'];",1)==sitemap
    assert files['seo-discovery/sitemap.mjs']!=sitemap.encode()
    html=(base/'dist/index.html').read_bytes()
    refs=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html)
    assert len(refs)==1
    ref=refs[0];name='dist/'+ref.decode().lstrip('/')
    bundle=(base/name).read_text()
    old='o.jsx("a",{href:"/collections/all",children:"Our range"})'
    new=old+',o.jsx("a",{href:"/guides",children:"Kurta set buying guides"})'
    updated=exact(bundle,[(old,new)]).encode()
    newref=('/assets/index-'+hashlib.sha256(updated).hexdigest()[:16]+'.js').encode()
    files['dist'+newref.decode()]=updated
    assert html.count(ref)==2,'Expected module preload and module script references'
    files['dist/index.html']=html.replace(ref,newref)
    assert files['dist/index.html'].replace(newref,ref)==html
    for name,data in files.items():
        p=overlay/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'inverseTransformsVerified':True,'apiUnchanged':True,'databaseWrites':False,'blobWrites':False,'stylesheetsUnchanged':True,'productRecordsUnchanged':True,'commerceCodeUnchanged':True,'oldLandingAssetRetained':True}
