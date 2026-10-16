import base64,hashlib,json,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
def once(text,before,after):
    assert text.count(before)==1,'Unexpected current anchor: '+before[:100]
    return text.replace(before,after,1)
def patch_web(base,overlay,poster):
    html=(base/'dist/index.html').read_text();refs=re.findall(r'<script type="module" crossorigin src="([^"]+)"></script>',html);assert len(refs)==1
    old=refs[0].removeprefix('./').removeprefix('/');text=(base/'dist'/old).read_text()
    assert 'data-hidi-first-header' in html and 'HidiMediaManifest' in text and '__HidiHeroEarly' not in text
    assert (base/'lcp-performance/head.mjs').read_bytes()==(HERE.parent/'lcp-performance/head.mjs').read_bytes(),'Existing response transform changed; stop'
    original_manifest=re.search(r'^const HidiMediaManifest=(.*);$',text,re.M)[0]
    manifest=poster['manifest']
    text=once(text,original_manifest,'const HidiMediaManifest='+json.dumps(manifest,separators=(',',':'))+';')
    text=once(text,'return item ? (matchMedia("(max-width: 700px)").matches ? item.mobile.poster : item.desktop.poster) : undefined;', 'if (!item) return undefined; const variant = matchMedia("(max-width: 700px)").matches ? item.mobile : item.desktop; return window.__HidiAvifEnabled && variant.avifPoster ? variant.avifPoster : variant.poster;')
    text=once(text,'const value = await response.json();','const value = await response.json();\n        window.__HidiAvifEnabled = await window.__HidiAvifSupport || false;')
    anchor='''        const response = await fetch("/api/hidi/hero-config", {
          cache: "no-store",
          signal: controller.signal
        });'''
    replacement='''        const early = window.__HidiHeroEarly;
        window.__HidiHeroEarly = null;
        const response = await early || await fetch("/api/hidi/hero-config", {
          cache: "no-store",
          signal: controller.signal
        });'''
    text=once(text,anchor,replacement)
    logo=(base/'dist/assets/images/hidi-logo.png').read_bytes();assert len(logo)<=32768
    text=once(text,'src:Tt("images/hidi-logo.png"),fetchPriority:"high"','src:'+json.dumps('data:image/png;base64,'+base64.b64encode(logo).decode())+',fetchPriority:"high"')
    name='assets/index-'+hashlib.sha256(text.encode()).hexdigest()[:16]+'.js'
    assert html.count('/'+old)==2,'Expected app and preload references'
    html=html.replace('/'+old,'/'+name)
    posters=re.findall(r'<link rel="preload" as="image" fetchpriority="high" media="[^"]+" href="/media-performance/assets/[^"]+">',html);assert len(posters)==2
    for hint in posters:html=once(html,hint,'')
    for row in poster['report']:
        posters=[hint.replace(row['original'],row['url']) for hint in posters]
    posters=[hint.replace('as="image"','as="image" type="image/avif"') for hint in posters]
    viewport='<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
    html=once(html,viewport,viewport+'\n'+'\n'.join(posters)+'\n<script data-hidi-early-hero="true">'+(HERE/'early-hero.js').read_text().replace('__AVIF_PROBE__',poster['probe'])+'</script>')
    runtime=(base/'server.mjs').read_text()
    runtime=once(runtime,'(?:webp|mp4)$','(?:webp|avif|mp4)$')
    runtime=once(runtime,'    if (pathname === "/") html = optimizeHomeHead(html);','    if (pathname === "/") { html = optimizeHomeHead(html); html = await renderAnnouncement(html); }')
    runtime='import { renderAnnouncement } from "./paint-performance/announcement.mjs";\n'+runtime
    runtime='import { sendCachedHome } from "./paint-performance/delivery.mjs";\n'+runtime
    anchor='    return sendBuffer(request, response, 200, response.getHeaders(), body);'
    runtime=once(runtime,anchor,'    return pathname === "/" ? sendCachedHome(request, response, 200, response.getHeaders(), body) : sendBuffer(request, response, 200, response.getHeaders(), body);')
    pricing=(base/'pricing/storefront.mjs').read_text()
    assert pricing==(HERE.parent/'pricing/storefront.mjs').read_text(),'Current offer module changed; stop'
    pricing=once(pricing,'let ready=false,pending=false','let ready=null,pending=false')
    pricing=once(pricing,'}else removeCampaign();','}else if(ready===false) removeCampaign();')
    files={'pricing/storefront.mjs':pricing,'paint-performance/announcement.mjs':(HERE/'announcement.mjs').read_text(),'dist/index.html':html,'dist/'+name:text,'lcp-performance/head.mjs':(HERE/'head.mjs').read_text(),'server.mjs':runtime,'paint-performance/delivery.mjs':(HERE/'delivery.mjs').read_text()}
    for key,value in files.items():
        target=overlay/key;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(value)
    return {'passed':True,'bundle':name,'originalBundle':old,'allowedFiles':list(files),'cssUnchanged':True,'manifest':manifest}
