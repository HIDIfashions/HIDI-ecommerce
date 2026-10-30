"""Bounded gallery-order patch. Preparation only: never deploys or writes live settings."""
from pathlib import Path
import hashlib, re, json, sys
HERE=Path(__file__).resolve().parent

def replace_checked(source,changes):
    text=source.decode('utf-8')
    for old,new in changes:
        assert text.count(old)==1,'Expected exactly one retained anchor: '+old[:90]
        text=text.replace(old,new)
    inverse=text
    for old,new in reversed(changes):
        assert inverse.count(new)==1,'Ambiguous inverse patch'
        inverse=inverse.replace(new,old)
    assert inverse.encode()==source,'Unrelated bytes changed'
    return text.encode()

def hero(source):
    marker='export function createHeroMediaHandler({ origin, hasStorefront }) {'
    imports='import {createPortraitOrderHandler} from "./portrait-order/handler.mjs";\nimport {createPortraitOrderStore} from "./portrait-order/storage.mjs";\n'
    factory='\n  const handlePortraitOrder=createPortraitOrderHandler({origin,store:createPortraitOrderStore({config:storageConfig,token:azureAccessToken}),loadMedia:()=>storageGetJson(LANDING_CURRENT_KEY)});'
    return imports.encode()+replace_checked(source,[(marker,marker+factory),('  return async function handleHeroMedia(request, response, pathname) {','  return async function handleHeroMedia(request, response, pathname) {\n    if(await handlePortraitOrder(request,response,pathname))return true;')])

def admin(source):
    form=(HERE/'editor.html').read_text(encoding='utf-8')
    assets='<link rel="stylesheet" href="/portrait-order-assets/editor.css">\n<script type="module" src="/portrait-order-assets/editor.mjs"></script>\n'
    return replace_checked(source,[('</head>',assets+'</head>'),('<div class="work-grid">',form+'\n<div class="work-grid">')])

def bundle(source):
    marker='function Rf(){'
    hook='''
  const [HidiPortraitOrder,setHidiPortraitOrder]=nt.useState(null);
  nt.useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/hidi/portrait-order',{cache:'no-store',signal:controller.signal})
      .then(response=>{if(!response.ok)throw Error('Order unavailable');return response.json();})
      .then(data=>{const ids=['DSC01671','DSC01431','DSC01567','DSC01529','DSC01849'];if(Array.isArray(data.order)&&data.order.length===5&&new Set(data.order).size===5&&data.order.every(id=>ids.includes(id)))setHidiPortraitOrder(data.order);})
      .catch(()=>{});
    return ()=>controller.abort();
  },[]);'''
    # Reorder complete story tuples so headings, captions and alt text never detach.
    return replace_checked(source,[(marker,marker+hook),(':K.map(([e,o,p,h])=>{',':(HidiPortraitOrder?HidiPortraitOrder.map(id=>K.find(story=>story[0]===id)):K).map(([e,o,p,h])=>{'),('caption:p}})},[p,V])','caption:p}})},[p,V,HidiPortraitOrder])')])

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay);html=(base/'dist/index.html').read_bytes()
    refs=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html);assert len(refs)==1
    old=refs[0];name=old.decode().removeprefix('./').removeprefix('/')
    assert re.fullmatch(r'assets/index-[A-Za-z0-9_-]+\.js',name)
    updated=bundle((base/'dist'/name).read_bytes());destination='assets/index-'+hashlib.sha256(updated).hexdigest()[:16]+'.js'
    new=old.replace(Path(name).name.encode(),Path(destination).name.encode())
    files={'hero-media.mjs':hero((base/'hero-media.mjs').read_bytes()),'dist/landing-media-control.html':admin((base/'dist/landing-media-control.html').read_bytes()),'dist/'+destination:updated,'dist/index.html':html.replace(old,new)}
    for file in ['model.mjs','storage.mjs','handler.mjs','editor.mjs','editor.css']:files['portrait-order/'+file]=(HERE/file).read_bytes()
    for name,data in files.items():
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'renamedAssets':{'dist/'+old.decode().removeprefix('./').removeprefix('/'):'dist/'+destination},'orderOnly':True,'captionsPaired':True,'productionWrites':0}

if __name__=='__main__':print(json.dumps(patch_runtime(sys.argv[1],sys.argv[2]),indent=2))
