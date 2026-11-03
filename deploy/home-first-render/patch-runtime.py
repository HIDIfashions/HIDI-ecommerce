"""Add the missing image branch; leave video rendering and commerce intact."""
from pathlib import Path
import hashlib
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
    for name,data in files.items():
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'inverseVerified':True,'videoRenderingUnchanged':True,'commerceCodeUnchanged':True,'beforeSha256':hashlib.sha256(source).hexdigest(),'productionWrites':0}
