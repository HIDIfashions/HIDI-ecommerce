"""Exact, reversible content edits to the current runtime. Fail closed on drift."""
from pathlib import Path
import hashlib,json,re
HERE=Path(__file__).resolve().parent
COPY=json.loads((HERE/'copy.json').read_text(encoding='utf-8'))

def exact(source,old,new):
    assert source.count(old)==1 and new not in source,'Reviewed anchor changed: '+old[:120]
    result=source.replace(old,new,1)
    assert result.replace(new,old,1)==source
    return result

def home_inner():
    return '<h2 style="font-size:clamp(24px,4vw,36px);line-height:1.25;margin:0 0 16px">'+COPY['heading']+'</h2><p style="max-width:65ch;margin:0 auto 20px;line-height:1.7">'+COPY['intro']+'</p><nav aria-label="Shop HIDI collections" style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px 24px"><a href="/collections/all">'+COPY['cta']+'</a><a href="/collections/work-wear">Work wear</a><a href="/collections/casual-wear">Casual wear</a><a href="/collections/occasional-wear">Occasion wear</a></nav><p style="margin:20px 0 0"><a href="/guides">Kurta set buying guides</a> · <a href="/about">Meet HIDI India</a></p>'

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay);assert not overlay.exists()
    files={};read=lambda name:(base/name).read_text(encoding='utf-8')
    # Keep the same useful copy in the early HTML and the React-owned page.
    name='seo-document/discovery.mjs';source=read(name)
    match=re.search(r"  const content='[^\n]+';",source);assert match
    inner=home_inner()
    initial='<main id="main" data-hidi-home-discovery style="padding:48px 24px;max-width:1080px;margin:auto;text-align:center;color:#602124;background:#fffdf8">'+inner.replace('<h2 ','<h1 ').replace('</h2>','</h1>')+'</main>'
    source=exact(source,match.group(), '  const content='+json.dumps(initial,ensure_ascii=False)+';')
    source=source.replace('The existing client mounts with createRoot, replacing this useful fallback','The client mounts the same content in its React-owned main, replacing this fallback')
    source=exact(source,'<nav aria-label="Main navigation"><a href="/collections/all">Shop kurta sets</a>','<nav aria-label="Main navigation"><a href="/collections/all">'+COPY['cta']+'</a>')
    source=exact(source,'<p><a href="/collections/all">Find a kurta set and check its size information</a> ·','<p><a href="/collections/all">'+COPY['cta']+'</a> ·')
    source=exact(source,'property="og:site_name" content="HIDI"','property="og:site_name" content="HIDI India"')
    files[name]=source.encode()
    name='seo-discovery/metadata.mjs';source=read(name)
    source=exact(source,"title: 'Women’s Kurta Sets & Indian Wear | HIDI India'","title: "+json.dumps(COPY['collectionTitle'],ensure_ascii=False))
    files[name]=source.encode()
    name='apps/web/.next/server/app/collections/all/page.js';source=read(name)
    source=exact(source,'i="All Products"','i='+json.dumps(COPY['collectionHeading']))
    old='(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})'
    new='(0,d.jsxs)("header",{className:"collection-header",style:{display:"block",paddingBottom:"20px"},children:[(0,d.jsx)("h1",{style:{fontSize:"clamp(24px,4vw,36px)"},children:i}),(0,d.jsx)("p",{className:"hidi-collection-intro",style:{display:"block",maxWidth:"65ch",margin:"12px auto 0",fontSize:"14px",lineHeight:1.6},children:'+json.dumps(COPY['intro'],ensure_ascii=False)+'})]})'
    files[name]=exact(source,old,new).encode()
    name='apps/web/.next/server/app/about/page.js';source=read(name)
    files[name]=exact(source,'children:"Explore HIDI"','children:'+json.dumps(COPY['cta'])).encode()
    html=read('dist/index.html');refs=re.findall(r'<script type="module" crossorigin src="([^"\s]+)"></script>',html)
    # Additional independent pricing modules are allowed; exactly one index bundle.
    refs=[ref for ref in refs if re.fullmatch(r'/assets/index-[\w-]+\.js',ref)];assert len(refs)==1
    ref=refs[0];bundle=read('dist'+ref)
    old='H.jsx(Af,{})]}),H.jsx(Vf,{})'
    props={'data-hidi-home-discovery':'','aria-label':'Explore HIDI','style':{'padding':'48px 24px','maxWidth':'1080px','margin':'auto','textAlign':'center','color':'#602124','background':'#fffdf8'},'dangerouslySetInnerHTML':{'__html':inner}}
    new='H.jsx(Af,{}),H.jsx("section",'+json.dumps(props,ensure_ascii=False,separators=(',',':'))+')]}),H.jsx(Vf,{})'
    bundle=exact(bundle,old,new)
    bundle=exact(bundle,'href:"/collections/all",children:"Our range"','href:"/collections/all",children:'+json.dumps(COPY['cta']))
    newref='/assets/index-'+hashlib.sha256(bundle.encode()).hexdigest()[:16]+'.js'
    assert html.count(ref)==2
    files['dist/index.html']=html.replace(ref,newref).encode();files['dist'+newref]=bundle.encode()
    for name,data in files.items():
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'exactAnchorsVerified':True,'commerceCodeUnchanged':True,'apiUnchanged':True,'databaseWrites':False,'oldBundleRetained':True}
