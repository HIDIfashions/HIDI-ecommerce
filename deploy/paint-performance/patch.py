import hashlib,json,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
def once(text,before,after):
    assert text.count(before)==1,'Unexpected current anchor: '+before[:100]
    return text.replace(before,after,1)
def patch_web(base,overlay):
    html=(base/'dist/index.html').read_text();refs=re.findall(r'<script type="module" crossorigin src="([^"]+)"></script>',html);assert len(refs)==1
    old=refs[0].removeprefix('./').removeprefix('/');text=(base/'dist'/old).read_text()
    assert 'data-hidi-first-header' in html and 'HidiMediaManifest' in text and '__HidiHeroEarly' not in text
    assert (base/'lcp-performance/head.mjs').read_bytes()==(HERE.parent/'lcp-performance/head.mjs').read_bytes(),'Existing response transform changed; stop'
    manifest=json.loads(re.search(r'^const HidiMediaManifest=(.*);$',text,re.M)[1])
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
    name='assets/index-'+hashlib.sha256(text.encode()).hexdigest()[:16]+'.js'
    assert html.count('/'+old)==2,'Expected app and preload references'
    html=html.replace('/'+old,'/'+name)
    posters=re.findall(r'<link rel="preload" as="image" fetchpriority="high" media="[^"]+" href="/media-performance/assets/[^"]+">',html);assert len(posters)==2
    for poster in posters:html=once(html,poster,'')
    html=once(html,'<meta charset="UTF-8" />','<meta charset="UTF-8" />\n'+'\n'.join(posters)+'\n<script data-hidi-early-hero="true">'+(HERE/'early-hero.js').read_text()+'</script>')
    files={'dist/index.html':html,'dist/'+name:text,'lcp-performance/head.mjs':(HERE/'head.mjs').read_text()}
    for key,value in files.items():
        target=overlay/key;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(value)
    return {'passed':True,'bundle':name,'originalBundle':old,'allowedFiles':list(files),'cssUnchanged':True,'manifest':manifest}
