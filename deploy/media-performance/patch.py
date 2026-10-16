import hashlib,json,re
from pathlib import Path
HERE=Path(__file__).resolve().parent

def once(text,before,after):
    assert text.count(before)==1,'Unexpected live anchor: '+before[:110]
    return text.replace(before,after,1)

def bundle(text,manifest):
    assert 'HidiMediaManifest' not in text
    text,count=re.subn(r'([\w$]+)\.(jsx|jsxs|createElement)\(\s*"img"\s*,',r'HidiMediaCreate(\1.\2, "img",',text)
    assert count>=8,'Homepage image creation sites missing'
    text=once(text,'src: liveHero.url,\n      autoPlay:', 'src: videoAllowed || manualPlayback ? HidiMediaVideo(liveHero.url) : undefined,\n      poster: HidiMediaPoster(liveHero.url),\n      autoPlay: (videoAllowed || manualPlayback) &&')
    text=once(text,'      preload: "auto",\n      onLoadedData: revealLiveVideo,','      preload: videoAllowed || manualPlayback ? "metadata" : "none",\n      onLoadedData: revealLiveVideo,')
    old_style='style: { visibility: liveReady ? "visible" : "hidden", "--hero-position-desktop": liveHero.desktopPosition, "--hero-position-mobile": liveHero.mobilePosition }'
    assert text.count(old_style)==2,'Uploaded image/video readiness styles changed'
    text=text.replace(old_style,'style: { visibility: liveReady || (liveHero.type === "video" && HidiMediaPoster(liveHero.url)) ? "visible" : "hidden", "--hero-position-desktop": liveHero.desktopPosition, "--hero-position-mobile": liveHero.mobilePosition }')
    text=once(text,'if (!showBundled || reduced || HidiHeroSaveData()) {','if ((!showBundled && heroConfigStatus !== "uploaded") || reduced || HidiHeroSaveData()) {')
    text=once(text,'}, [showBundled, mobile, reduced]);','}, [showBundled, heroConfigStatus, mobile, reduced]);')
    text=once(text,'if ((reduced || HidiHeroSaveData()) && !manualPlayback || sequence.paused','if ((!videoAllowed || reduced || HidiHeroSaveData()) && !manualPlayback || sequence.paused')
    text=once(text,'}, [liveHero?.url, reduced, sequence.paused, heroVisible, pageVisible, dialogOpen, soundEnabled, manualPlayback]);','}, [liveHero?.url, videoAllowed, reduced, sequence.paused, heroVisible, pageVisible, dialogOpen, soundEnabled, manualPlayback]);')
    text=once(text,'    const enabled = !soundEnabled;','    if (!video.getAttribute("src")) { video.src = HidiMediaVideo(liveHero.url); video.load(); }\n    const enabled = !soundEnabled;')
    return 'const HidiMediaManifest='+json.dumps(manifest,separators=(',',':'))+';\n'+(HERE/'client.js').read_text()+'\n'+text

def runtime(text):
    text=once(text,'import { sendBuffer, streamHtml } from "./performance/delivery.mjs";','import { sendBuffer, streamHtml } from "./performance/delivery.mjs";\nimport { compressCatalogue } from "./media-performance/compression.mjs";')
    text=once(text,'    if (!canInject) {','    if (compressCatalogue(request, response, incoming, status, responseHeaders, pathname)) return;\n    if (!canInject) {')
    text=once(text,'    responseHeaders["server-timing"] = "api;dur=" + (performance.now() - started).toFixed(1);','    responseHeaders["server-timing"] = "api;dur=" + (performance.now() - started).toFixed(1);\n    if (compressCatalogue(request, response, incoming, incoming.statusCode || 502, responseHeaders, pathname)) return;')
    text=once(text,'  const isVersionedBundle = isPerformanceImage ||','  const isOptimizedMedia = /[/\\\\]media-performance[/\\\\]assets[/\\\\][a-z0-9-]+\\.(?:webp|mp4)$/.test(filePath);\n  const isVersionedBundle = isOptimizedMedia || isPerformanceImage ||')
    anchor='  response.setHeader("Content-Length", stat.size === 0 ? 0 : end - start + 1);\n  response.writeHead(status);'
    text=once(text,anchor,'  if (status === 200 && !range && request.method === "GET" && [".js", ".css", ".json", ".svg", ".xml", ".webmanifest", ".txt"].includes(extension)) {\n    return sendBuffer(request, response, status, response.getHeaders(), readFileSync(filePath));\n  }\n'+anchor)
    return text

def patch_web(base,overlay,manifest):
    html=(base/'dist/index.html').read_text()
    refs=re.findall(r'<script type="module" crossorigin src="([^"\s]+)"></script>',html);assert len(refs)==1
    old=refs[0].removeprefix('./').removeprefix('/')
    original=(base/'dist'/old).read_text();updated=bundle(original,manifest)
    name='assets/index-'+hashlib.sha256(updated.encode()).hexdigest()[:16]+'.js'
    html=once(html,refs[0],'/'+name)
    posters=[]
    for video in manifest['videos'].values():
        for kind,media in [('mobile','(max-width: 700px)'),('desktop','(min-width: 701px)')]:
            posters.append('<link rel="preload" as="image" fetchpriority="high" media="'+media+'" href="'+video[kind]['poster']+'">')
    html=once(html,'</head>','\n'.join(posters)+'\n</head>')
    files={'dist/index.html':html,'dist/'+name:updated,'server.mjs':runtime((base/'server.mjs').read_text()),'media-performance/compression.mjs':(HERE/'compression.mjs').read_text()}
    for name,value in files.items():
        p=overlay/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(value)
    return {'passed':True,'allowedFiles':sorted(files),'bundle':name,'originalBundle':old,'cssUnchanged':True,'mediaSelectionsPreserved':True}
