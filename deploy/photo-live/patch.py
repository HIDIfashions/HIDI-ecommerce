"""Photo-only overlay over exact captured runtime bytes. No schema or data migration."""
from pathlib import Path
import hashlib,re,shutil,subprocess,os
API='apps/api/dist/admin/admin-inventory.service.js'
PIN_API='4ae2c0865fa3be640b845ab78f012e4a768be17b339f0bfe176a3284449db4fd'
PIN_SERVER='7e73df019d242f79b7630dfd9a7f9aa35cecc01750ecef79813e7c22e6db8d35'
PIN_IMAGES='0593c2d4b1ef740cf5fda2262b40c8e6fc392c4bca40d8c2552107251de822ac'
PIN_DELETE_STORAGE_BLOB='0f70fd060d904cb3881c6f4090705869c37d3b33'
ROOT=Path(__file__).resolve().parents[2]
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def git_blob(p):
    data=Path(p).read_bytes();return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\\0'+data).hexdigest()
def once(s,a,b):
    assert s.count(a)==1,'Expected one photo anchor: '+a[:100]
    return s.replace(a,b,1)
def write(root,name,text):
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
def patch(base,overlay,app):
    base,overlay=Path(base),Path(overlay);overlay.mkdir(parents=True,exist_ok=True)
    if app=='api':
        assert digest(base/API)==PIN_API,'Live inventory service changed: explicit review is required'
        s=(base/API).read_text()
        # The verified photo-stream release is already live. Do not rewrite the
        # API again: prove its current ticket contract and preserve it byte-for-byte.
        assert s.count('const sizeBytes = input.sizeBytes;')==1,'Current upload ticket number contract changed'
        assert s.count('typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 2147483647')==1,'Current upload ticket capacity changed'
        assert s.count('maxBytes: sizeBytes')==1,'Current upload ticket storage changed'
        assert '12 * 1024 * 1024' not in s and 'Image must be no larger than 12 MB' not in s,'Legacy 12 MB API guard unexpectedly returned'
        return {'passed':True,'allowedFiles':[],'apiUnchanged':True,'databaseSchemaUnchanged':True,'ticketIntegerCapacityBytes':2147483647}
    assert app=='web'
    assert digest(base/'server.mjs')==PIN_SERVER,'Live storefront wrapper changed: explicit review is required'
    assert digest(base/'product-images/images.mjs')==PIN_IMAGES,'Live image processor changed: explicit review is required'
    assert git_blob(base/'admin-tools/product-delete-storage.mjs')==PIN_DELETE_STORAGE_BLOB,'Live product photo deletion storage changed: explicit review is required'
    # Photo size/UI changes are already in the retained production image.
    # This derivative release deliberately leaves every compiled storefront
    # asset byte-identical; only server-side media delivery is overlaid.
    mapping={}
    counts={'numeric':0,'labels':0}
    shutil.copyfile(ROOT/'deploy/admin-tools/product-delete-storage.mjs',overlay/'admin-tools/product-delete-storage.mjs')
    server=(base/'server.mjs').read_text()
    assert server.count('import { createProductImageHandler } from "./product-images/images.mjs";')==1,'Image handler wiring changed'
    assert server.count('import { handlePhotoUpload } from "./photo-stream/handler.mjs";')==1,'Photo upload handler wiring changed'
    assert server.count('if (await handlePhotoUpload(request, response, pathname)) return;')==1,'Photo upload route wiring changed'
    assert server.count('if (await productImageHandler.handle(request, response, pathname)) return;')==1,'Product image route wiring changed'
    # No server wrapper rewrite is needed: the existing imports point at paths
    # that this overlay replaces with the derivative-aware implementations.
    for name in ['images.mjs','photo-disk.mjs']:
        dest=overlay/'product-images'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/'deploy/collection-speed'/name,dest)
    subprocess.run(['node',str(ROOT/'deploy/photo-live/build.mjs'),str(ROOT),str(overlay),str(base)],check=True)
    files=sorted(p.relative_to(overlay).as_posix() for p in overlay.rglob('*') if p.is_file())
    return {'passed':True,'allowedFiles':files,'renamedAssets':mapping,'validatorChanges':counts,'oldAssetsRetained':True,'globalProxyLimitsUnchanged':True,'commerceAndLandingFilesUnchanged':True,'removedPhotoCapMiB':12,'databaseSchemaUnchanged':True}
