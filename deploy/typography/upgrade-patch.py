"""Upgrade only six typography files; preserve all runtime hooks and font files."""
from pathlib import Path
import hashlib
HERE=Path(__file__).resolve().parent
FILES={'registry.mjs','css.mjs','handler.mjs','editor.html','editor.js','editor.css'}
def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    assert 'createTypographyHandler' in (base/'server.mjs').read_text()
    for name in ['storage.mjs','wrap.mjs','refresh.js']:
        assert (base/'typography'/name).read_bytes()==(HERE/name).read_bytes(),'Retained typography support changed: '+name
    hashes={}
    for name in FILES:
        old=(base/'typography'/name).read_bytes();new=(HERE/name).read_bytes();assert old!=new,'Expected reviewed typography upgrade: '+name
        target=overlay/'typography'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(new)
        hashes[name]={'before':hashlib.sha256(old).hexdigest(),'after':hashlib.sha256(new).hexdigest()}
    return {'passed':True,'allowedFiles':sorted('typography/'+name for name in FILES),'hashes':hashes,'fontsUnchanged':True,'runtimeHooksUnchanged':True,'storageUnchanged':True}
