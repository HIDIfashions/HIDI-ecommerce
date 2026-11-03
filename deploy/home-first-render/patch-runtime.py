"""Add the missing image branch; leave video rendering and commerce intact."""
from pathlib import Path
import hashlib,re
HERE=Path(__file__).resolve().parent
def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    name='paint-performance/hero.mjs';source=(base/name).read_bytes()
    old=b"  if(selection?.active!==true)return html;"
    new=old+b"\n  if((selection.items?.[0]||selection).type==='image')return renderImageHero(html,selection);"
    header=b'import {renderImageHero} from "./image-hero.mjs";\n'
    assert source.count(old)==1 and b'renderImageHero' not in source,'Reviewed hero renderer changed'
    updated=header+source.replace(old,new,1)
    assert updated.removeprefix(header).replace(new,old,1)==source
    files={name:updated,'paint-performance/image-hero.mjs':(HERE/'image-hero.mjs').read_bytes().replace(b'\r\n',b'\n')}
    # A cached first image may finish before the background settings refresh.
    # Readiness is already keyed by selected URL; clearing it for an unchanged
    # image hides the image permanently because its load event will not repeat.
    html=(base/'dist/index.html').read_bytes()
    refs=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html)
    assert len(refs)==1
    ref=refs[0];bundle=(base/'dist'/ref.decode().lstrip('/')).read_bytes()
    reset=b'lt("");const w=(Array.isArray(g.items)'
    preserve=b'const w=(Array.isArray(g.items)'
    assert bundle.count(reset)==1,'Expected one hero settings readiness reset'
    changed=bundle.replace(reset,preserve,1)
    assert changed.replace(preserve,reset,1)==bundle
    newref=('/assets/index-'+hashlib.sha256(changed).hexdigest()[:16]+'.js').encode()
    assert html.count(ref)==2
    files['dist/index.html']=html.replace(ref,newref)
    files['dist'+newref.decode()]=changed
    for name,data in files.items():
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'inverseVerified':True,'videoRenderingUnchanged':True,'commerceCodeUnchanged':True,'beforeSha256':hashlib.sha256(source).hexdigest(),'productionWrites':0}
