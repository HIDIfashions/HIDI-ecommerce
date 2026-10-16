"""Recognize explicit approved set statements in SSR and versioned client code."""
import pathlib,hashlib,re,json
HERE=pathlib.Path(__file__).resolve().parent
SERVER='apps/web/.next/server/app/products/[slug]/page.js'
CLIENT='apps/web/.next/static/chunks/app/products/[slug]/page-7c49fc199b11b33e.js'
def replacement(source,server):
    label,clean,description=('c','d','b') if server else ('i','r','t')
    old='includes:'+label+'("Includes")'
    counted=r'(/^(?:2|3)\s*[- ]\s*piece\s+set\b/i.test(line)&&/\bkurta\b/i.test(line)&&/\b(?:pants?|bottom|trousers?)\b/i.test(line)&&(/^3/.test(line)?/\bdupatta\b/i.test(line):!/\bdupatta\b/i.test(line)))'
    components=r'/^(?:(?:designer|embroidered|printed|anarkali|co-ord)\s+)*(?:kurta|kurti|suit)\s+set\s+with\s+(?:bottom|pants?|palazzo)(?:\s+and\s+dupatta)?[.!]?$/i.test(line)||/^(?:co-ord|coord)\s+set\s+with\s+top\s+and\s+bottom[.!]?$/i.test(line)'
    statement=description+r'.split(/\r?\n/).map(line=>line.trim()).find(line=>('+counted+'||'+components+r')&&!/\b(?:not|excluding|without|optional|may|or)\b/i.test(line))'
    bullet=description+r'.match(/(?:^|\n)\s*[-*•]\s*Includes\s*:\s*([^\n]+)/i)?.[1]'
    new=old+'||'+clean+'('+bullet+')||'+clean+'('+statement+')'
    assert source.count(old)==1 and new not in source,'Inspected catalogue facts function changed'
    updated=source.replace(old,new,1)
    assert updated.replace(new,old,1)==source
    return updated
def patch_runtime(base,overlay):
    base,overlay=pathlib.Path(base),pathlib.Path(overlay)
    assert not overlay.exists()
    assert (base/'seo-document/discovery.mjs').is_file(),'Discovery release must pass before product-fact rollout'
    server=(base/SERVER).read_bytes();client=(base/CLIENT).read_bytes()
    assert hashlib.sha256(server).hexdigest()=='a5d36b1e20758a904e643a46e3a9854d38434ff8aa21fd427cf4c4d7c14539f8','Product renderer changed; inspect first'
    assert hashlib.sha256(client).hexdigest()=='9f0e3b4079c8ca5dbffb2839174902703ac619a5cb1bd5d76bdcd68df88dc7a1','Product client changed; inspect first'
    root=base/'apps/web/.next'
    manifest=root/'server/app/products/[slug]/page_client-reference-manifest.js'
    assert '7c49fc199b11b33e' in manifest.read_text(),'Inspected product chunk is no longer active'
    files={SERVER:replacement(server.decode(),True).encode()}
    imageFile='seo-discovery/published-product-images.json'
    previousImages=set(json.loads((base/imageFile).read_text()))
    approvedImages=set(json.loads((HERE.parent/'seo-discovery/published-product-images.json').read_text()))
    reviewed=json.loads((HERE/'image-audit.json').read_text())['results']
    assert all(row['status']==200 and row['type'].split(';')[0] in ['image/jpeg','image/png','image/webp','image/avif'] for row in reviewed),'Image verification incomplete'
    reviewedPaths={row['path'] for row in reviewed}
    assert approvedImages==previousImages|reviewedPaths,'Image allowlist must preserve existing entries and add only verified published paths'
    assert all(path.startswith('/media/products/') and '?' not in path and '#' not in path for path in approvedImages)
    files[imageFile]=(json.dumps(sorted(approvedImages),indent=2)+'\n').encode()
    metadata='seo-discovery/metadata.mjs'
    assert hashlib.sha256((base/metadata).read_bytes()).hexdigest()=='caf67764e9b0419c1002fc4560ddba8b34cc99512f8a517922012a01074f7fde','Inspected SEO helper changed'
    files[metadata]=(HERE.parent/'seo-discovery/metadata.mjs').read_bytes()
    sitemapFile='seo-discovery/sitemap.mjs';sitemap=(base/sitemapFile).read_text()
    changes=[("import { canonicalOrigin, identityUrl, isPublishedProductImage } from './metadata.mjs';","import { canonicalOrigin, identityUrl, isPublishedProductImage, registerPublishedProductImages } from './metadata.mjs';"),('        cached = sitemapXml(JSON.parse(body)); expires = Date.now() + 30000;','        const products=JSON.parse(body);\n        registerPublishedProductImages(products);\n        cached = sitemapXml(products); expires = Date.now() + 30000;')]
    updated=sitemap
    for old,new in changes:
        assert updated.count(old)==1 and new not in updated,'Sitemap refresh anchor changed'
        updated=updated.replace(old,new,1)
    inverse=updated
    for old,new in reversed(changes):inverse=inverse.replace(new,old,1)
    assert inverse==sitemap,'Unrelated sitemap routes changed'
    assert '/guides/choosing-kurta-set-size' in updated,'Released guide URLs must remain in sitemap'
    files[sitemapFile]=updated.encode()
    wrapper=(base/'server.mjs').read_text()
    old='    if (shouldIndexPublishedImage(status, contentType, requestHost(request), pathname)) {\n      delete responseHeaders["x-robots-tag"];\n    }'
    new='    if (shouldIndexPublishedImage(status, contentType, requestHost(request), pathname)) {\n      responseHeaders["x-robots-tag"] = "index, follow";\n    }'
    assert wrapper.count(old)==1 and new not in wrapper,'Image response header anchor changed'
    files['server.mjs']=wrapper.replace(old,new,1).encode()
    assert files['server.mjs'].decode().replace(new,old,1)==wrapper
    updated=replacement(client.decode(),False).encode()
    newhash=hashlib.sha256(updated).hexdigest()[:16]
    files[CLIENT.replace('7c49fc199b11b33e',newhash)]=updated
    replacements={'7c49fc199b11b33e':newhash}
    runtimes=[p for p in (root/'static/chunks').glob('webpack-*.js') if '7c49fc199b11b33e' in p.read_text()]
    assert len(runtimes)<=1,'Ambiguous active webpack mapping'
    for runtime in runtimes:
        previous=runtime.read_text();changed=previous.replace('7c49fc199b11b33e',newhash)
        oldhash=re.search(r'webpack-([a-f0-9]{16})\.js',runtime.name).group(1)
        nextHash=hashlib.sha256(changed.encode()).hexdigest()[:16];replacements[oldhash]=nextHash
        files[runtime.with_name('webpack-'+nextHash+'.js').relative_to(base).as_posix()]=changed.encode()
    for p in root.rglob('*'):
        if not p.is_file() or p.suffix not in ['.js','.json'] or '/static/' in p.as_posix():continue
        name=p.relative_to(base).as_posix();previous=files.get(name,p.read_bytes()).decode();changed=previous
        for old,new in replacements.items():changed=changed.replace(old,new)
        if changed!=previous:
            inverse=changed
            for old,new in reversed(list(replacements.items())):inverse=inverse.replace(new,old)
            assert inverse==previous,'Unrelated chunk-reference changes'
            files[name]=changed.encode()
    assert manifest.relative_to(base).as_posix() in files,'Client manifest was not versioned'
    for name,data in files.items():
        p=overlay/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'apiUnchanged':True,'databaseWrites':False,'blobWrites':False,'stylesheetsUnchanged':True,'catalogueRecordsUnchanged':True,'priceStockSelectionUnchanged':True,'oldClientAssetsRetained':True,'newClientHash':newhash,'inverseTransformsVerified':True,'verifiedCurrentImages':len(reviewedPaths),'newlyEligibleImagePaths':len(approvedImages-previousImages),'cachedImageHeadersCorrected':True}
