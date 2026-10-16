import hashlib,json,re,struct
from pathlib import Path
HERE=Path(__file__).resolve().parent
def once(text,before,after):
    assert text.count(before)==1,'Unexpected current anchor: '+before[:100]
    return text.replace(before,after,1)
def build_icons(base,overlay):
    html=(base/'dist/index.html').read_text()
    tags=re.findall(r'<link\b[^>]*rel=["\'](?:shortcut icon|icon)["\'][^>]*>',html,re.I)
    legacy=[tag for tag in tags if 'shortcut icon' in tag];assert len(legacy)==1
    href=re.search(r'href=["\']([^"\']+)',legacy[0])[1]
    relative=href.removeprefix('./').removeprefix('/');assert re.fullmatch(r'[A-Za-z0-9_/-]+\.ico',relative)
    choices=[base/'dist'/relative,base/'apps/web/public'/relative,base/'public'/relative]
    inputs=[file.read_bytes() for file in choices if file.is_file()];assert inputs,'Current icon not found'
    assert len({hashlib.sha256(data).hexdigest() for data in inputs})==1,'Conflicting icon copies; stop'
    source=inputs[0];reserved,kind,count=struct.unpack_from('<HHH',source);assert reserved==0 and kind==1 and 1<=count<=20
    frames=[]
    for index in range(count):
        width,height,_,_,planes,bpp,length,offset=struct.unpack_from('<BBBBHHII',source,6+index*16)
        width,height=width or 256,height or 256
        assert offset>=6+16*count and offset+length<=len(source)
        data=source[offset:offset+length];assert data.startswith(b'\x89PNG\r\n\x1a\n'),'Icon frame must already be PNG; no lossy conversion'
        assert struct.unpack_from('>II',data,16)==(width,height)
        digest=hashlib.sha256(data).hexdigest();name=f'icon-{digest[:16]}-{width}.png'
        target=overlay/'dist/media-performance/assets'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        assert target.read_bytes()==source[offset:offset+length]
        frames.append({'width':width,'height':height,'bytes':length,'sha256':digest,'url':'/media-performance/assets/'+name})
    by_size={row['width']:row for row in frames if row['width']==row['height']};assert all(size in by_size for size in [16,32,48,64])
    links=[f'<link rel="shortcut icon" type="image/png" sizes="32x32" href="{by_size[32]["url"]}" />']
    links += [f'<link rel="icon" type="image/png" sizes="{size}x{size}" href="{by_size[size]["url"]}" />' for size in [16,32,48,64]]
    return {'passed':True,'source':href,'sourceFile':next(file for file in choices if file.is_file()).relative_to(base).as_posix(),'originalBytes':len(source),'originalSha256':hashlib.sha256(source).hexdigest(),'frames':frames,'allFramePayloadsByteIdentical':True,'legacyOriginalPreserved':True,'originalTags':tags,'markup':'\n'.join(links)}

def patch_web(base,overlay,poster,icons=None):
    icons=icons or build_icons(base,overlay)
    html=(base/'dist/index.html').read_text();refs=re.findall(r'<script type="module" crossorigin src="([^"]+)"></script>',html);assert len(refs)==1
    old=refs[0].removeprefix('./').removeprefix('/');text=(base/'dist'/old).read_text()
    assert 'data-hidi-first-header' in html and 'HidiMediaManifest' in text and '__HidiHeroEarly' not in text
    assert (base/'lcp-performance/head.mjs').read_bytes()==(HERE.parent/'lcp-performance/head.mjs').read_bytes(),'Existing response transform changed; stop'
    original_manifest=re.search(r'^const HidiMediaManifest=(.*);$',text,re.M)[0]
    manifest=poster['manifest']
    original_video=(HERE.parent/'media-performance/client.js').read_text().split('function HidiMediaVideo(value) {',1)[1].split('function HidiMediaPoster',1)[0]
    text=once(text,'function HidiMediaVideo(value) {'+original_video,(HERE/'video-client.js').read_text())
    text=once(text,'      onCanPlay: revealLiveVideo,\n      onError: () => setFailedSource(liveHero.url),','      onCanPlay: revealLiveVideo,\n      onError: (event) => HidiMediaVideoFallback(event, liveHero.url, () => setFailedSource(liveHero.url)),')
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
    text=once(text,'    void loadSelection();','    window.__HidiHeroInitial = null;\n    void loadSelection();')
    text=once(text,'function Tf() {',(HERE/'hero-initial.js').read_text()+'\nfunction Tf() {\n  const initialHero = HidiHeroReact.useMemo(HidiHeroInitialSelection, []);')
    for before,after in [
        ('const [liveItems, setLiveItems] = HidiHeroReact.useState([]);','const [liveItems, setLiveItems] = HidiHeroReact.useState(() => initialHero?.items || []);'),
        ('const [heroAutoPlay, setHeroAutoPlay] = HidiHeroReact.useState(true);','const [heroAutoPlay, setHeroAutoPlay] = HidiHeroReact.useState(() => initialHero?.autoPlay ?? true);'),
        ('const [heroInterval, setHeroInterval] = HidiHeroReact.useState(6);','const [heroInterval, setHeroInterval] = HidiHeroReact.useState(() => initialHero?.interval || 6);'),
        ('const [heroConfigStatus, setHeroConfigStatus] = HidiHeroReact.useState("loading");','const [heroConfigStatus, setHeroConfigStatus] = HidiHeroReact.useState(() => initialHero ? "uploaded" : "loading");'),
        ('const [videoAllowed, setVideoAllowed] = HidiHeroReact.useState(false);','const [videoAllowed, setVideoAllowed] = HidiHeroReact.useState(() => Boolean(initialHero) && !reduced && !HidiHeroSaveData());')
    ]:text=once(text,before,after)
    text=once(text,'const G=await fetch("/api/hidi/landing-media-config",{cache:"no-store",signal:C.signal});','const HidiLandingEarly=window.__HidiLandingEarly;window.__HidiLandingEarly=null;const G=await HidiLandingEarly||await fetch("/api/hidi/landing-media-config",{cache:"no-store",signal:C.signal});')
    text=once(text,'const [soundEnabled, setSoundEnabled] = HidiHeroReact.useState(false);','const [soundEnabled, setSoundEnabled] = HidiHeroReact.useState(() => { const enabled = window.__HidiHeroSoundIntent === true; window.__HidiHeroSoundIntent = false; return enabled; });')
    text=once(text,'const [manualPlayback, setManualPlayback] = HidiHeroReact.useState(false);','const [manualPlayback, setManualPlayback] = HidiHeroReact.useState(() => soundEnabled);')
    text=once(text,'    return () => video.pause();\n  }, [liveHero?.url, videoAllowed, reduced, sequence.paused, heroVisible, pageVisible, dialogOpen, soundEnabled, manualPlayback]);','  }, [liveHero?.url, videoAllowed, reduced, sequence.paused, heroVisible, pageVisible, dialogOpen, soundEnabled, manualPlayback]);\n  HidiHeroReact.useEffect(() => {\n    const video = liveVideoRef.current;\n    return () => video?.pause();\n  }, [liveHero?.url]);')
    text=once(text,'  const toggleSound = async () => {\n    const video = liveVideoRef.current;\n    if (!video) return;\n    if (!video.getAttribute("src")) { video.src = HidiMediaVideo(liveHero.url); video.load(); }\n    const enabled = !soundEnabled;\n    setManualPlayback(true);\n    video.muted = !enabled;\n    setSoundEnabled(enabled);\n    try {\n      await video.play();\n    } catch {\n      video.muted = true;\n      setSoundEnabled(false);\n      video.play().catch(() => {\n      });\n    }\n  };\n','  const toggleSound = () => {\n    if (!liveVideoRef.current) return;\n    setManualPlayback(true);\n    setSoundEnabled(enabled => !enabled);\n  };\n')
    start=text.index('    setVideoAllowed(false);\n    let idleId = null;')
    end=text.index('  }, [showBundled, heroConfigStatus, mobile, reduced]);',start)
    expected=(HERE/'video-delay.txt').read_text()
    text=once(text,expected,'    setVideoAllowed(true);\n')
    text='if (location.pathname === "/" && document.visibilityState !== "hidden" && document.querySelector("video[data-hidi-first-hero]")) await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));\n'+text
    name='assets/index-'+hashlib.sha256(text.encode()).hexdigest()[:16]+'.js'
    assert html.count('/'+old)==2,'Expected app and preload references'
    html=html.replace('/'+old,'/'+name)
    html=once(html,'<link rel="modulepreload" fetchpriority="high"','<link rel="modulepreload" fetchpriority="low"')
    posters=re.findall(r'<link rel="preload" as="image" fetchpriority="high" media="[^"]+" href="/media-performance/assets/[^"]+">',html);assert len(posters)==2
    for hint in posters:html=once(html,hint,'')
    for row in poster['report']:
        posters=[hint.replace(row['original'],row['url']) for hint in posters]
    posters=[hint.replace('as="image"','as="image" type="image/avif"') for hint in posters]
    for index,tag in enumerate(icons['originalTags']):html=once(html,tag,icons['markup'] if index==0 else '')
    viewport='<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
    html=once(html,viewport,viewport+'\n'+'\n'.join(posters)+'\n<script data-hidi-early-hero="true">'+(HERE/'early-hero.js').read_text().replace('__AVIF_PROBE__',poster['probe'])+'</script>')
    runtime=(base/'server.mjs').read_text()
    runtime=once(runtime,'(?:webp|mp4)$','(?:webp|avif|png|mp4)$')
    runtime=once(runtime,'    if (pathname === "/") html = optimizeHomeHead(html);','    if (pathname === "/") { html = optimizeHomeHead(html); html = await renderInitialHome(html); }')
    runtime='import { renderInitialHome } from "./paint-performance/announcement.mjs";\n'+runtime
    runtime='import { sendCachedHome } from "./paint-performance/delivery.mjs";\n'+runtime
    runtime='import { sendPreparedAsset } from "./paint-performance/static-encoding.mjs";\n'+runtime
    runtime=once(runtime,'return sendBuffer(request, response, status, response.getHeaders(), readFileSync(filePath));','return sendPreparedAsset(request, response, status, response.getHeaders(), readFileSync(filePath));')
    anchor='    return sendBuffer(request, response, 200, response.getHeaders(), body);'
    runtime=once(runtime,anchor,'    return pathname === "/" ? sendCachedHome(request, response, 200, response.getHeaders(), body) : sendBuffer(request, response, 200, response.getHeaders(), body);')
    pricing=(base/'pricing/storefront.mjs').read_text()
    assert pricing==(HERE.parent/'pricing/storefront.mjs').read_text(),'Current offer module changed; stop'
    price_presentation=pricing.split('  if(ready){\n',1)[1].split('  }else ',1)[0]
    price_calculations=pricing.split('  // Compare only an explicit MRP',1)[1].split('async function refresh(){',1)[0]
    pricing=once(pricing,'let ready=false,pending=false','let ready=null,pending=false')
    pricing=once(pricing,'}else removeCampaign();','}else if(ready===false) removeCampaign();')
    pricing=once(pricing,"const response=await fetch('/api/store/products',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});", "const initial=window.__HidiCatalogueEarly;window.__HidiCatalogueEarly=null;const response=await initial||await fetch('/api/store/products',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});")
    pricing=once(pricing,"window.addEventListener('pageshow',refresh);", "window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});")
    assert price_presentation in pricing and price_calculations in pricing,'Pricing presentation, hydration protection and calculations must remain exact'
    files={'paint-performance/static-encoding.mjs':(HERE/'static-encoding.mjs').read_text(),'paint-performance/icons.json':json.dumps(icons),'paint-performance/initial-hero.json':json.dumps(manifest['videos']),'paint-performance/hero.mjs':(HERE/'hero.mjs').read_text(),'paint-performance/hero-template.html':(HERE/'hero-template.html').read_text(),'pricing/storefront.mjs':pricing,'paint-performance/announcement.mjs':(HERE/'announcement.mjs').read_text(),'dist/index.html':html,'dist/'+name:text,'lcp-performance/head.mjs':(HERE/'head.mjs').read_text(),'server.mjs':runtime,'paint-performance/delivery.mjs':(HERE/'delivery.mjs').read_text()}
    for key,value in files.items():
        target=overlay/key;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(value)
    return {'passed':True,'bundle':name,'originalBundle':old,'allowedFiles':list(files),'cssUnchanged':True,'pricingPresentationAndHydrationPreserved':True,'pricingPresentationSha256':hashlib.sha256(price_presentation.encode()).hexdigest(),'pricingCalculationsSha256':hashlib.sha256(price_calculations.encode()).hexdigest(),'manifest':manifest}
