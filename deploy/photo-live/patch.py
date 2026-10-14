"""Photo-only overlay over exact captured runtime bytes. No schema or data migration."""
from pathlib import Path
import hashlib,re,shutil,subprocess,os
API='apps/api/dist/admin/admin-inventory.service.js'
PIN_API='d22e01c31343910b570e73ec9ce09d03f6c6312e9bc0684f988182a4c404668d'
PIN_SERVER='e3bdbf6695088c61cd573a7cd84d33d9a58785a3502fd0d3a319f34793ed454e'
PIN_IMAGES='4138a628b649d8b8aa94a15a4d8fb910522e5204af5d238f0013f1cc31bdca89'
ROOT=Path(__file__).resolve().parents[2]
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
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
        s=once(s,'const sizeBytes = Number(input.sizeBytes);','const sizeBytes = input.sizeBytes;')
        s=once(s,'!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 12 * 1024 * 1024','typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 2147483647')
        s=once(s,'Image must be no larger than 12 MB','Choose a non-empty photo within the server storage capacity')
        s=s.replace('//# sourceMappingURL=admin-inventory.service.js.map','// Photo-only runtime overlay; retained source map is not used for this patched file.')
        write(overlay,API,s)
        return {'passed':True,'allowedFiles':[API],'removedPhotoCapMiB':12,'databaseSchemaUnchanged':True,'ticketIntegerCapacityBytes':2147483647}
    assert app=='web'
    assert digest(base/'server.mjs')==PIN_SERVER,'Live storefront wrapper changed: explicit review is required'
    assert digest(base/'product-images/images.mjs')==PIN_IMAGES,'Live image processor changed: explicit review is required'
    tree=base/'apps/web/.next'
    original={p.relative_to(base).as_posix():p.read_text() for p in tree.rglob('*') if p.is_file() and not p.is_symlink() and p.suffix in {'.js','.json','.html','.rsc','.meta'}}
    semantic={};counts={'numeric':0,'labels':0}
    labels={
      'choose a non-empty photo no larger than 12 MB':'choose a valid non-empty photo',
      'Image exceeds 12 MB.':'Invalid photo size.',
      'Image must be no larger than 12 MB':'Choose a valid non-empty photo',
      'up to 12 MB each':'without a fixed photo MB cap',
      'max 12 MB each':'no fixed photo MB cap',
    }
    pattern=re.compile(r'([A-Za-z_$][\w$]*\.size)\s*>\s*12582912(?=[^\n]{0,160}(?:12 MB|Image exceeds))')
    for name,s in original.items():
        t,n=pattern.subn(lambda m:'!Number.isSafeInteger('+m[1]+')',s);counts['numeric']+=n
        for a,b in labels.items():counts['labels']+=t.count(a);t=t.replace(a,b)
        semantic[name]=t
    assert counts['numeric']>=3 and counts['labels']>=4,'Photo validators/labels missing'
    mapping={}
    for _ in range(16):
        final={name:text for name,text in semantic.items()}
        for name,s in list(final.items()):
            for old,new in mapping.items():
                s=s.replace(re.search(r'-([a-f0-9]{16})\.js$',old)[1],re.search(r'-([a-f0-9]{16})\.js$',new)[1])
            final[name]=s
        newmap={}
        for name,s in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and s!=original[name]:
                m=re.search(r'-([a-f0-9]{16})\.js$',name);assert m,'Changed photo asset must be content-addressed'
                newmap[name]=name[:m.start(1)]+hashlib.sha256(s.encode()).hexdigest()[:16]+name[m.end(1):]
        if newmap==mapping:break
        mapping=newmap
    else:raise AssertionError('Photo asset references did not converge')
    for name,s in final.items():
        if s==original[name]:continue
        target=mapping.get(name,name)
        if target!=name:assert not (base/target).exists(),'Generated photo asset collides with retained asset'
        write(overlay,target,s)
    raw=['admin-tools/image-sku-client.mjs','admin-tools/product-upload/model.mjs','admin-tools/product-upload/engine.mjs','admin-tools/product-upload/package.mjs','admin-tools/product-upload/page.html']
    for name in raw:
        s=(base/name).read_text();t=s
        if name.endswith('image-sku-client.mjs'):
            t=once(t,'item.file.size < 1 || item.file.size > 12 * 1024 * 1024','!Number.isSafeInteger(item.file.size) || item.file.size < 1')
            t=once(t,'Each image must be between 1 byte and 12 MB.','Choose a valid non-empty image.')
        if name.endswith('model.mjs'):t=once(t,'MAX_PHOTO_BYTES = 12 * 1024 * 1024','MAX_PHOTO_BYTES = Number.MAX_SAFE_INTEGER')
        t=t.replace('Photo must be between 1 byte and 12 MB: ','Choose a valid non-empty photo: ')
        t=t.replace('Photos must be at most 12 MB each.','Photos must be non-empty; server storage capacity applies.')
        t=t.replace('each photo: at most 12 MB','photos: no fixed MB cap').replace('each at most 12 MB','no fixed photo MB cap')
        assert t!=s,'Expected photo-only change in '+name
        write(overlay,name,t)
    server=(base/'server.mjs').read_text()
    anchor='import { createProductImageHandler } from "./product-images/images.mjs";'
    server=once(server,anchor,anchor+'\nimport { handlePhotoUpload } from "./photo-stream/handler.mjs";')
    anchor='  if (await productImageHandler.handle(request, response, pathname)) return;'
    server=once(server,anchor,'  if (await handlePhotoUpload(request, response, pathname)) return;\n'+anchor)
    write(overlay,'server.mjs',server)
    for name in ['images.mjs','photo-disk.mjs']:
        dest=overlay/'product-images'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/'deploy/collection-speed'/name,dest)
    subprocess.run(['node',str(ROOT/'deploy/photo-live/build.mjs'),str(ROOT),str(overlay)],check=True)
    files=sorted(p.relative_to(overlay).as_posix() for p in overlay.rglob('*') if p.is_file())
    return {'passed':True,'allowedFiles':files,'renamedAssets':mapping,'validatorChanges':counts,'oldAssetsRetained':True,'globalProxyLimitsUnchanged':True,'commerceAndLandingFilesUnchanged':True,'removedPhotoCapMiB':12,'databaseSchemaUnchanged':True}
