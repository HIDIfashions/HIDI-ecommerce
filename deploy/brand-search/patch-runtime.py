"""Update only the inspected brand metadata module in the captured live image."""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    name='seo-discovery/metadata.mjs'
    original=(base/name).read_bytes()
    expected=json.loads((HERE/'baseline.json').read_text())['metadataSha256']
    assert hashlib.sha256(original.replace(b'\r\n',b'\n')).hexdigest()==expected,'Live metadata differs from inspected source; inspect before releasing'
    updated=(HERE.parent/name).read_bytes()
    assert updated!=original,'No brand metadata change'
    dest=overlay/name
    assert not dest.exists()
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(updated)
    return {'passed':True,'allowedFiles':[name],'beforeSha256':hashlib.sha256(original).hexdigest(),'afterSha256':hashlib.sha256(updated).hexdigest(),'metadataOnly':True,'apiUnchanged':True,'databaseWrites':False}
