import hashlib,json,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
def once(text,before,after):
    assert text.count(before)==1,'Unexpected current anchor: '+before[:100]
    return text.replace(before,after,1)
def patch_web(base,overlay,header):
    html=(base/'dist/index.html').read_text();old=re.findall(r'<script type="module" crossorigin src="([^"]+)"></script>',html);assert len(old)==1
    old=old[0].removeprefix('./').removeprefix('/');text=(base/'dist'/old).read_text()
    assert 'HidiMediaManifest' in text and 'data-hidi-first-header' not in html
    manifest=json.loads(re.search(r'^const HidiMediaManifest=(.*);$',text,re.M)[1])
    # These two calls use a local createElement alias and escaped the previous
    # responsive-image wrapper. Preserve original URLs as state/selection keys.
    text=once(text,"h('img', { ...image, key: image.src, className: 'portrait-gallery__portrait',","HidiMediaCreate(h, 'img', { ...image, sizes: '(max-width: 700px) 88vw, 42vw', key: image.src, className: 'portrait-gallery__portrait',")
    text=once(text,"h('img', { src: item.props.src, alt: '', width:","HidiMediaCreate(h, 'img', { src: item.props.src, sizes: '(max-width: 700px) 18vw, 8vw', alt: '', width:")
    text=once(text,'children:HidiMediaCreate(o.jsx, "img",{src:Tt("images/hidi-logo.png"),width:"265"','children:HidiMediaCreate(o.jsx, "img",{src:Tt("images/hidi-logo.png"),fetchPriority:"high",decoding:"async",width:"265"')
    name='assets/index-'+hashlib.sha256(text.encode()).hexdigest()[:16]+'.js';html=once(html,'/'+old,'/'+name)
    html=once(html,'<link rel="preload" as="image" href="./assets/images/hidi-logo.png" />','<link rel="preload" as="image" fetchpriority="high" href="./assets/images/hidi-logo.png" />')
    html=once(html,'<meta charset="UTF-8" />','<meta charset="UTF-8" />\n<link rel="modulepreload" fetchpriority="high" href="/'+name+'">')
    assert header.startswith('<header ') and 'id="site-header"' in header and 'is-solid' not in header
    # Same public header as React, available to the HTML parser before the bundle.
    header=header.replace('<header ','<header data-hidi-first-header="true" ',1).replace('src="./assets/images/hidi-logo.png"','fetchpriority="high" decoding="async" src="./assets/images/hidi-logo.png"')
    html=once(html,'<div id="root"></div>','<div id="root"><div class="site-shell">'+header+'</div></div>')
    runtime=(base/'server.mjs').read_text()
    runtime=once(runtime,'const root = resolve(', 'const optimizeHomeHead = createHomeHead(resolve(process.env.LANDING_DIST_DIR || resolve(process.cwd(), "dist")));\nconst root = resolve(')
    runtime='import { createHomeHead } from "./lcp-performance/head.mjs";\n'+runtime
    runtime=once(runtime,'    const body = Buffer.from(html);','    if (pathname === "/") html = optimizeHomeHead(html);\n    const body = Buffer.from(html);')
    files={'dist/index.html':html,'dist/'+name:text,'server.mjs':runtime,'lcp-performance/head.mjs':(HERE/'head.mjs').read_text()}
    for key,value in files.items():
        target=overlay/key;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(value)
    return {'passed':True,'bundle':name,'originalBundle':old,'allowedFiles':list(files),'cssUnchanged':True,'manifest':manifest}
