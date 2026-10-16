"""Exact, reversible SEO navigation and one About-copy edit over the retained runtime."""
from pathlib import Path
import hashlib,re
HERE=Path(__file__).resolve().parent
BUNDLE_SHA='6d615d58728d497767628ffc21e1b1426dd4c1fc067f6761203b8dd53d2049f8'
ABOUT_OLD='From responsibility and ambition to the moments that are entirely your own, HIDI is made for women who move through every day with ease, confidence and quiet elegance.'
ABOUT_NEW='Introduced by actress Ananya Nagalla, HIDI offers women’s Indian wear for work, everyday dressing and occasions — made for every role you carry.'

def bundle_patch(data):
    assert hashlib.sha256(data).hexdigest()==BUNDLE_SHA,'Retained homepage bundle changed'
    text=data.decode();changes=[]
    def replace(old,new):
        nonlocal text
        assert text.count(old)==1,'Expected one navigation anchor: '+old[:100]
        text=text.replace(old,new,1);changes.append((old,new))
    replace('re=le.map(O=>O.querySelector("button"))','re=le.map(O=>O.querySelector(".hidi-collection-link"))')
    replace('o.jsxs("button",{type:"button",className:"hidi-collection-link","aria-label":`Explore ${w.controlName||w.name}`,onClick:()=>Ne(F),children:', 'o.jsxs("a",{...HidiSeoLinkProps(Ar(w.collectionId||w.id),()=>Ne(F)),className:"hidi-collection-link","aria-label":`Explore ${w.controlName||w.name}`,children:')
    replace('o.jsxs("button",{type:"button",className:"text-link",onClick:()=>m(),children:[HidiPublicRangeText(a.rangeText).buttonLabel', 'o.jsxs("a",{...HidiSeoLinkProps("/collections/all",()=>m()),className:"text-link",style:{textAlign:"center"},children:[HidiPublicRangeText(a.rangeText).buttonLabel')
    replace('HidiHeroReact.createElement("button", { type: "button", className: "campaign-shop-button", onClick: () => openCollection() }', 'HidiHeroReact.createElement("a", { ...HidiSeoLinkProps("/collections/all", () => openCollection()), className: "campaign-shop-button", style: { textAlign: "center" } }')
    for slug,label in [('casual-wear','Casual Wear'),('work-wear','Work Wear'),('occasional-wear','Occasional Wear'),('ananyas-pick','Ananya\\u2019s Pick')]:
        replace('o.jsx("button",{onClick:()=>m("'+slug+'"),type:"button",children:"'+label+'"})','o.jsx("a",{...HidiSeoLinkProps("/collections/'+slug+'",()=>m("'+slug+'")),children:"'+label+'"})')
    for slug,label in [('shipping','Shipping'),('returns','Returns & exchanges'),('contact','Contact HIDI')]:
        replace('o.jsx("button",{onClick:()=>k("'+slug+'"),type:"button",children:"'+label+'"})','o.jsx("a",{...HidiSeoLinkProps("/'+slug+'",()=>k("'+slug+'")),children:"'+label+'"})')
    for slug,label in [('returns','Read the policy'),('contact','Contact HIDI')]:
        replace('o.jsxs("button",{className:"small-link",onClick:()=>a("'+slug+'"),type:"button",children:["'+label+' ', 'o.jsxs("a",{...HidiSeoLinkProps("/'+slug+'",()=>a("'+slug+'")),className:"small-link",style:{textAlign:"center"},children:["'+label+' ')
    replace('o.jsx("button",{className:"social-link","aria-label":"HIDI Instagram",onClick:()=>y("instagram"),type:"button",children:', 'o.jsx("a",{...HidiSeoLinkProps("https://www.instagram.com/hidiindia/",()=>y("instagram")),target:"_blank",rel:"noopener noreferrer",className:"social-link",style:{textAlign:"center"},"aria-label":"HIDI Instagram",children:')
    inverse=text
    for old,new in reversed(changes):
        assert inverse.count(new)==1,'Navigation inverse is ambiguous';inverse=inverse.replace(new,old,1)
    assert inverse.encode()==data,'Unrelated homepage bytes changed'
    helper=(HERE/'links.mjs').read_text().replace('export function HidiSeoLinkProps','function HidiSeoLinkProps',1)
    assert 'HidiSeoLinkProps' not in data.decode(),'Helper collision'
    return (helper+'\n'+text).encode(),len(changes)

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    html=(base/'dist/index.html').read_bytes()
    refs=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html)
    assert len(refs)==1,'Expected one retained landing module'
    ref=refs[0];name=ref.decode().removeprefix('./').removeprefix('/')
    assert re.fullmatch(r'assets/index-[A-Za-z0-9_-]+\.js',name)
    updated,count=bundle_patch((base/'dist'/name).read_bytes())
    newname='assets/index-'+hashlib.sha256(updated).hexdigest()[:16]+'.js'
    assert not (base/'dist'/newname).exists(),'New landing asset collision'
    newref=ref.replace(Path(name).name.encode(),Path(newname).name.encode())
    files={'dist/'+newname:updated,'dist/index.html':html.replace(ref,newref,1)}
    about=[]
    for path in base.rglob('*'):
        if not path.is_file() or path.suffix not in ['.js','.html','.rsc']:continue
        data=path.read_bytes()
        if ABOUT_OLD.encode() not in data:continue
        relative=path.relative_to(base).as_posix()
        assert '/.next/' in '/'+relative and 'node_modules' not in relative,'About copy found outside retained Next output'
        changed=data.replace(ABOUT_OLD.encode(),ABOUT_NEW.encode())
        assert changed.replace(ABOUT_NEW.encode(),ABOUT_OLD.encode())==data,'Unrelated About bytes changed'
        files[relative]=changed;about.append({'path':relative,'occurrences':data.count(ABOUT_OLD.encode())})
    assert about,'Compiled About paragraph not found; stop rather than publish a partial correction'
    for name,data in files.items():
        dest=overlay/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    return {'allowedFiles':sorted(files),'navigationAnchors':count,'aboutCopyFiles':about,'inverseTransformsVerified':True,'oldHomepageAssetRetained':True,'stylesheetsUnchanged':True,'buttonAlignmentPreserved':True}
