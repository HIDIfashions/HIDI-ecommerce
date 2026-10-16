"""Text-only CMS additions over the exact retained five-card runtime."""
from pathlib import Path
import hashlib
import json
import re
HERE=Path(__file__).resolve().parent
DEFAULTS=json.loads((HERE/'defaults.json').read_text())
SERVER=(HERE/'server-text.mjs.txt').read_text()
HANDLERS=(HERE/'server-handlers.mjs.txt').read_text()
FORM=(HERE/'admin-form.html').read_text()
STYLE=(HERE/'admin-style.css').read_text()
EDITOR=(HERE/'admin-editor.mjs.txt').read_text()
COMMON=SERVER[:SERVER.index('const RANGE_TEXT_KEY')]
CLIENT=COMMON.replace('RANGE_TEXT_DEFAULTS','HidiRangeTextDefaults').replace('RANGE_TEXT_LIMITS','HidiRangeTextLimits').replace('publicRangeText','HidiPublicRangeText')+'''
function HidiRangeCardCopy(item,value){const title=HidiPublicRangeText(value).cards[item.mediaSlot].title;return {...item,name:title,controlName:item.controlName?title+" - Photo "+(item.id.endsWith("-2")?2:1):title};}
'''
def replace_checked(source,changes):
    text=source.decode()
    for old,new in changes:
        assert text.count(old)==1,'Expected one exact text-only patch anchor: '+old[:80]
        text=text.replace(old,new)
    inverse=text
    for old,new in reversed(changes):
        assert inverse.count(new)==1,'Inverse patch anchor ambiguous'
        inverse=inverse.replace(new,old)
    assert inverse.encode()==source,'Unrelated retained bytes changed'
    return text.encode()
def hero(source):
    return replace_checked(source,[
      ('function publicLandingConfig(raw) {',SERVER+'\nfunction publicLandingConfig(raw, rangeText = null) {'),
      ('    ananya: raw?.ananya ? publicSequence(raw.ananya, true) : null,','    ananya: raw?.ananya ? publicSequence(raw.ananya, true) : null,\n    rangeText: publicRangeText(rangeText),'),
      ('        value = publicLandingConfig(await storageGetJson(LANDING_CURRENT_KEY));','        const [media,text]=await Promise.all([storageGetJson(LANDING_CURRENT_KEY),storageGetJson(RANGE_TEXT_KEY)]);\n        value = publicLandingConfig(media,text);'),
      ('      if (pathname === "/api/hidi/hero-library" && request.method === "GET") {',HANDLERS+'      if (pathname === "/api/hidi/hero-library" && request.method === "GET") {')])
def admin(source):
    return replace_checked(source,[
      ('<div class="work-grid">',FORM+'<div class="work-grid">'),
      ('</style>',STYLE+'</style>'),
      ('function updateCurrent(current)',EDITOR+'\nfunction updateCurrent(current)'),
      ('  selectSlot(new URLSearchParams(location.search).get("section") || "hero");','  loadRangeText().catch(error=>rangeTextMessage(error.message,true));\n  selectSlot(new URLSearchParams(location.search).get("section") || "hero");')])
def bundle(source):
    changes=[
      ('const A={status:"ready"};for(const[R,b]of Object.entries(_.slots))','const A={status:"ready",rangeText:_.rangeText||null};for(const[R,b]of Object.entries(_.slots))'),
      ('const Jl=HidiRangeCards.length;function Hf(){',CLIENT+'const Jl=HidiRangeCards.length;function Hf(){'),
      ('HidiRangeCards.map(w=>({...w,imageProps:ei(a,w.mediaSlot,w.image,w.alt)})','HidiRangeCards.map(w=>({...HidiRangeCardCopy(w,a.rangeText),imageProps:ei(a,w.mediaSlot,w.image,w.alt)})'),
      ('`${HidiRangeCards[w].name} selected.`','`${Se[w].name} selected.`'),
      ('children:"A WARDROBE FOR EVERY YOU"','children:HidiPublicRangeText(a.rangeText).eyebrow'),
      ('children:["Explore our ",o.jsx("em",{children:"range."})]','children:[HidiPublicRangeText(a.rangeText).heading+" ",o.jsx("em",{children:HidiPublicRangeText(a.rangeText).accent})]'),
      ('children:"Your next favourite is waiting to be found."','children:HidiPublicRangeText(a.rangeText).subtitle'),
      ('children:["A little preview of what’s inside.",o.jsxs("button",{type:"button",className:"text-link",onClick:()=>m(),children:["Explore the collections ",','children:[HidiPublicRangeText(a.rangeText).footer,o.jsxs("button",{type:"button",className:"text-link",onClick:()=>m(),children:[HidiPublicRangeText(a.rangeText).buttonLabel+" ",'),
    ]
    return replace_checked(source,changes)
def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay);html=(base/'dist/index.html').read_bytes()
    refs=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html);assert len(refs)==1
    reference=refs[0];name=reference.decode().removeprefix('./').removeprefix('/')
    assert re.fullmatch(r'assets/index-[A-Za-z0-9_-]+\.js',name)
    updated=bundle((base/'dist'/name).read_bytes());destination='assets/index-'+hashlib.sha256(updated).hexdigest()[:16]+'.js'
    assert not (base/'dist'/destination).exists()
    newref=reference.replace(Path(name).name.encode(),Path(destination).name.encode())
    files={'hero-media.mjs':hero((base/'hero-media.mjs').read_bytes()),'dist/landing-media-control.html':admin((base/'dist/landing-media-control.html').read_bytes()),'dist/'+destination:updated,'dist/index.html':html.replace(reference,newref)}
    for name,content in files.items():
        p=overlay/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content)
    return {'passed':True,'allowedFiles':sorted(files),'renamedAssets':{'dist/'+reference.decode().removeprefix('./').removeprefix('/'):'dist/'+destination},'rangeTextEditable':True,'fiveCaptionsEditable':True,'dedicatedTextStorage':True,'inverseTransformsVerified':True,'unrelatedRuntimeBytesPreserved':True}
def self_test():
    assert len(DEFAULTS['cards'])==5
    assert 'storagePutJson(LANDING_CURRENT_KEY' not in SERVER
    assert 'storagePutJson(LANDING_PREVIOUS_KEY' not in SERVER
    assert '<input' in FORM and 'Save Text' in FORM
    assert 'textContent' in EDITOR and 'innerHTML' not in EDITOR
    print('PASS: isolated range text documents, safe text preview and five caption fields')
if __name__=='__main__':self_test()
