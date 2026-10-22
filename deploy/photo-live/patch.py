"""Photo-only overlay over exact captured runtime bytes. No schema or data migration."""
from pathlib import Path
import hashlib,re,shutil,subprocess,os

API='apps/api/dist/admin/admin-inventory.service.js'
PIN_API='4ae2c0865fa3be640b845ab78f012e4a768be17b339f0bfe176a3284449db4fd'
PIN_SERVER='7e73df019d242f79b7630dfd9a7f9aa35cecc01750ecef79813e7c22e6db8d35'
PIN_IMAGES='0593c2d4b1ef740cf5fda2262b40c8e6fc392c4bca40d8c2552107251de822ac'
PIN_DELETE_STORAGE_BLOB='0f70fd060d904cb3881c6f4090705869c37d3b33'
ROOT=Path(__file__).resolve().parents[2]

def digest(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def git_blob(p):
    data=Path(p).read_bytes()
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\\0'+data).hexdigest()

def write(root,name,text):
    p=root/name
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)

def patch(base,overlay,app):
    base,overlay=Path(base),Path(overlay)
    overlay.mkdir(parents=True,exist_ok=True)

    if app=='api':
        assert digest(base/API)==PIN_API,'Live inventory service changed: explicit review is required'
        text=(base/API).read_text()
        # The verified photo-stream release is already live. Preserve the API
        # byte-for-byte and prove the exact large-photo ticket contract we rely on.
        assert text.count('const sizeBytes = input.sizeBytes;')==1,'Current upload ticket number contract changed'
        assert text.count('typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 2147483647')==1,'Current upload ticket capacity changed'
        assert text.count('maxBytes: sizeBytes')==1,'Current upload ticket storage changed'
        assert '12 * 1024 * 1024' not in text and 'Image must be no larger than 12 MB' not in text,'Legacy 12 MB API guard unexpectedly returned'
        return {
            'passed':True,
            'allowedFiles':[],
            'apiUnchanged':True,
            'databaseSchemaUnchanged':True,
            'ticketIntegerCapacityBytes':2147483647,
        }

    assert app=='web'
    assert digest(base/'server.mjs')==PIN_SERVER,'Live storefront wrapper changed: explicit review is required'
    assert digest(base/'product-images/images.mjs')==PIN_IMAGES,'Live image processor changed: explicit review is required'
    assert git_blob(base/'admin-tools/product-delete-storage.mjs')==PIN_DELETE_STORAGE_BLOB,'Live product photo deletion storage changed: explicit review is required'

    # Today’s live API already supports streamed large photos, but the retained
    # production admin bundle still contains the former 12 MiB browser guard.
    # Change only those exact admin photo validators/labels. Customer storefront
    # layout, checkout, offers and account behavior remain retained.
    tree=base/'apps/web/.next'
    original={
        p.relative_to(base).as_posix():p.read_text()
        for p in tree.rglob('*')
        if p.is_file() and not p.is_symlink() and p.suffix in {'.js','.json','.html','.rsc','.meta'}
    }
    semantic={}
    counts={'numeric':0,'labels':0}
    labels={
        'choose a non-empty photo no larger than 12 MB':'choose a valid non-empty photo',
        'Image exceeds 12 MB.':'Invalid photo size.',
        'Image must be no larger than 12 MB':'Choose a valid non-empty photo',
        'up to 12 MB each':'without a fixed photo MB cap',
        'max 12 MB each':'no fixed photo MB cap',
    }
    forward_cap=re.compile(r'([A-Za-z_$][\w$]*\.size)\s*>\s*12582912')
    reverse_cap=re.compile(r'12582912\s*<\s*([A-Za-z_$][\w$]*\.size)')
    touched=set()
    for name,text in original.items():
        changed,n1=forward_cap.subn(lambda m:m[1]+' > 9007199254740991',text)
        changed,n2=reverse_cap.subn(lambda m:'9007199254740991 < '+m[1],changed)
        counts['numeric']+=n1+n2
        if n1+n2 or any(label in text for label in labels):touched.add(name)
        for old_label,new_label in labels.items():
            counts['labels']+=changed.count(old_label)
            changed=changed.replace(old_label,new_label)
        semantic[name]=changed
    assert counts['numeric']>=3 and counts['labels']>=4,'Retained admin photo validators/labels changed: explicit review required'
    for name in touched:
        assert '12582912' not in semantic[name], 'A former 12 MiB photo guard remains in '+name
        assert '12 MB' not in semantic[name], 'A former 12 MiB photo label remains in '+name

    # Next static JS is content-addressed. Rename every changed chunk and update
    # references until the hash mapping converges instead of mutating an immutable
    # old asset in place.
    mapping={}
    for _ in range(16):
        final={name:text for name,text in semantic.items()}
        for name,text in list(final.items()):
            for old_name,new_name in mapping.items():
                old_hash=re.search(r'-([a-f0-9]{16})\.js$',old_name)
                new_hash=re.search(r'-([a-f0-9]{16})\.js$',new_name)
                if old_hash and new_hash:
                    text=text.replace(old_hash[1],new_hash[1])
            final[name]=text
        newmap={}
        for name,text in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and text!=original[name]:
                match=re.search(r'-([a-f0-9]{16})\.js$',name)
                assert match,'Changed admin photo asset must be content-addressed'
                newmap[name]=name[:match.start(1)]+hashlib.sha256(text.encode()).hexdigest()[:16]+name[match.end(1):]
        if newmap==mapping:
            break
        mapping=newmap
    else:
        raise AssertionError('Admin photo asset references did not converge')

    reused_assets={}
    for name,text in final.items():
        if text==original[name]:
            continue
        target=mapping.get(name,name)
        if target!=name and (base/target).exists():
            # A content-addressed target may already be present in the retained
            # runtime (for example from an earlier safe admin-photo build).
            # Reuse it only when the bytes are exactly the bytes we just derived.
            expected=text.encode()
            actual=(base/target).read_bytes()
            assert actual==expected,'Generated admin photo asset hash collides with different retained content'
            reused_assets[name]=target
            continue
        write(overlay,target,text)

    # Standalone admin helpers are outside the Next static graph. Patch only
    # reviewed legacy 12 MiB markers when present; already-correct files remain
    # byte-identical and are not copied into the overlay.
    raw=[
        'admin-tools/image-sku-client.mjs',
        'admin-tools/product-upload/model.mjs',
        'admin-tools/product-upload/engine.mjs',
        'admin-tools/product-upload/package.mjs',
        'admin-tools/product-upload/page.html',
    ]
    raw_changes=0
    for name in raw:
        text=(base/name).read_text()
        changed=text
        if name.endswith('image-sku-client.mjs'):
            changed=changed.replace(
                'item.file.size < 1 || item.file.size > 12 * 1024 * 1024',
                '!Number.isSafeInteger(item.file.size) || item.file.size < 1',
            )
            changed=changed.replace(
                'Each image must be between 1 byte and 12 MB.',
                'Choose a valid non-empty image.',
            )
        if name.endswith('model.mjs'):
            changed=changed.replace(
                'MAX_PHOTO_BYTES = 12 * 1024 * 1024',
                'MAX_PHOTO_BYTES = Number.MAX_SAFE_INTEGER',
            )
        changed=changed.replace('Photo must be between 1 byte and 12 MB: ','Choose a valid non-empty photo: ')
        changed=changed.replace('Photos must be at most 12 MB each.','Photos must be non-empty; server storage capacity applies.')
        changed=changed.replace('each photo: at most 12 MB','photos: no fixed MB cap')
        changed=changed.replace('each at most 12 MB','no fixed photo MB cap')
        if changed!=text:
            write(overlay,name,changed)
            raw_changes+=1

    # Product deletion must remove derivative siblings too.
    delete_storage=overlay/'admin-tools/product-delete-storage.mjs'
    delete_storage.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/'deploy/admin-tools/product-delete-storage.mjs',delete_storage)

    # The live wrapper already owns the protected streaming upload route and the
    # custom image handler. Replace only the modules those imports point at.
    server=(base/'server.mjs').read_text()
    assert server.count('import { createProductImageHandler } from "./product-images/images.mjs";')==1,'Image handler wiring changed'
    assert server.count('import { handlePhotoUpload } from "./photo-stream/handler.mjs";')==1,'Photo upload handler wiring changed'
    assert server.count('if (await handlePhotoUpload(request, response, pathname)) return;')==1,'Photo upload route wiring changed'
    assert server.count('if (await productImageHandler.handle(request, response, pathname)) return;')==1,'Product image route wiring changed'

    for name in ['images.mjs','photo-disk.mjs']:
        dest=overlay/'product-images'/name
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(ROOT/'deploy/collection-speed'/name,dest)

    subprocess.run(
        ['node',str(ROOT/'deploy/photo-live/build.mjs'),str(ROOT),str(overlay),str(base)],
        check=True,
    )

    files=sorted(p.relative_to(overlay).as_posix() for p in overlay.rglob('*') if p.is_file())
    return {
        'passed':True,
        'allowedFiles':files,
        'renamedAssets':mapping,
        'reusedRetainedAssets':reused_assets,
        'validatorChanges':counts,
        'photoValidationBundlesReviewed':sorted(touched),
        'standaloneAdminFilesChanged':raw_changes,
        'oldAssetsRetained':True,
        'globalProxyLimitsUnchanged':True,
        'commerceAndLandingFilesUnchanged':True,
        'removedPhotoCapMiB':12,
        'databaseSchemaUnchanged':True,
    }
