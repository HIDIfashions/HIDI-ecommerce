"""Add one Admin uploader and repair only proven copies of its Blob helper."""
import hashlib
from pathlib import Path
import re
import shutil
import zipfile

HERE = Path(__file__).resolve().parent
SOURCE = HERE
ASSETS = {'photo-digest.mjs', 'client.mjs', 'model.mjs', 'engine.mjs', 'styles.css', 'HIDI_Product_Upload_Template.xlsx', 'package.mjs', 'HIDI_Product_Upload_Package.zip'}
FILES = ASSETS | {'page.html'}
HANDLER = 'admin-tools/handler.mjs'
NAVIGATION = 'admin-tools/navigation.js'
PAGE = '/admin/product-upload'
ASSET_PREFIX = '/admin-tools-assets/product-upload/'
XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
PRIOR_ASSET_HASHES = {'page.html': '07f49c1516c7ace5c047d78ff18fd0870b567536605d5f7b365986f889ddb6a6', 'client.mjs': '434dfec4bf52cb7d3a7cd29dc1d0f1e73fb084b26ce3c66bc0c97869940c89ed', 'model.mjs': 'ea74ed62421452faba8420a4252f6183c3182f8e48522eaf35911f03b5c4a3cf', 'engine.mjs': '05002d2dc22e62cefa1f445275a582d346f65a46931fab5fda5699524f7e7022', 'styles.css': 'd5a0764e416345198e21714f3b0fb6ff0b46ac45612b4193a1550f67ee8b9514', 'HIDI_Product_Upload_Template.xlsx': 'caa2ac549a2bdf5a73c616801f0281df63b215c6f9a05969ce6fc0d3883082ec'}
TOOL = "    { key: 'product-upload', label: 'Product Upload', href: '/admin/product-upload', icon: '<path d=\"M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5\"/>', marker: 'hidiProductUpload' },\n"

# The actual retained Next HTTP probe bound module 80441 and its cached export
# to these exact function/factory hashes. Identical registered copies must all
# recover immutable batch images, regardless of which route warms the cache.
MODULE_ID = 80441
OLD_UPLOAD_HELPER = r'''async function h(a,b,c){if(!a.startsWith("products/")||a.includes(".."))throw Error("Invalid product image key");let d=process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/,"");if(!d||!d.startsWith("https://"))throw Error("MEDIA_PUBLIC_BASE_URL must be an HTTPS media origin");let e=g().getBlockBlobClient(a);return await e.uploadData(b,{conditions:{ifNoneMatch:"*"},blobHTTPHeaders:{blobContentType:c,blobCacheControl:"public, max-age=31536000, immutable"}}),{url:`${d}/${a}`,storagePath:`azure://product-media/${a}`}}'''
OLD_FUNCTION_SHA256 = 'c8a90498b6228a163576fa02da7b069c98a1afb2b4bd63298ebb45d9d5772f48'
MODULE_PREFIX = '80441:(a,b,c)=>{"use strict";let d;c.d(b,{P:()=>g,i:()=>h});var e=c(36742),f=c(55031);'
CONTAINER_HELPER = r'''function g(){let a=process.env.AZURE_STORAGE_ACCOUNT?.trim()??"";if(!/^[a-z0-9]{3,24}$/.test(a))throw Error("AZURE_STORAGE_ACCOUNT is not configured");return(d??=new f.wS(`https://${a}.blob.core.windows.net`,new e.gv)).getContainerClient("product-media")}'''
_OLD_UPLOAD = 'return await e.uploadData(b,{conditions:{ifNoneMatch:"*"},blobHTTPHeaders:{blobContentType:c,blobCacheControl:"public, max-age=31536000, immutable"}}),'
_GUARDED_UPLOAD = r'''try{await e.uploadData(b,{conditions:{ifNoneMatch:"*"},blobHTTPHeaders:{blobContentType:c,blobCacheControl:"public, max-age=31536000, immutable"}})}catch(hidiStorageError){if(!/^products\/variants\/[a-z0-9_-]+\/batch-[a-f0-9]{64}\.(?:jpg|png|webp|avif)$/.test(a)||![409,412].includes(hidiStorageError?.statusCode))throw hidiStorageError;let hidiSavedBlob=await e.getProperties();if(hidiSavedBlob.contentLength!==b.length||hidiSavedBlob.contentType!==c||!(await e.downloadToBuffer(0,b.length)).equals(b))throw Error("Saved batch image differs from this upload");}return'''
assert OLD_UPLOAD_HELPER.count(_OLD_UPLOAD) == 1, 'Exact proven Blob upload anchor required'
NEW_UPLOAD_HELPER = OLD_UPLOAD_HELPER.replace(_OLD_UPLOAD, _GUARDED_UPLOAD)
OLD_UPLOAD_FACTORY = MODULE_PREFIX + CONTAINER_HELPER + OLD_UPLOAD_HELPER + '}'
NEW_UPLOAD_FACTORY = MODULE_PREFIX + CONTAINER_HELPER + NEW_UPLOAD_HELPER + '}'
# Preserve the previously installed route copy byte-for-byte. Its sole known
# formatting difference is this exact newline before the guarded Blob call.
EXISTING_GUARDED_HELPER = NEW_UPLOAD_HELPER.replace('let e=g().getBlockBlobClient(a);', '\nlet e=g().getBlockBlobClient(a);', 1)
EXISTING_GUARDED_FACTORY = MODULE_PREFIX + CONTAINER_HELPER + EXISTING_GUARDED_HELPER + '}'
EXISTING_GUARDED_SHA256 = 'd0aea5457f0161e44f619ed2ef358afa6db0f22199514d807249d2f847f3a0a9'


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode('utf-8')).hexdigest()


assert digest(OLD_UPLOAD_HELPER) == OLD_FUNCTION_SHA256, 'Loaded helper provenance differs'
assert digest(OLD_UPLOAD_FACTORY.removeprefix('80441:')) == '91b13a59b37b350ccd205c5aff2d80b46134d919f1db5f3fa7c4f45cb65d4e39', 'Loaded factory provenance differs'
assert digest(EXISTING_GUARDED_HELPER) == EXISTING_GUARDED_SHA256, 'Previously installed guarded helper differs'


def validate_upload_factory(value):
    """Return old/new only for one exact known registered module/export."""
    markers = list(re.finditer(r'(?<![A-Za-z0-9_$])80441\s*:', value))
    assert len(markers) == 1, 'Exactly one registered Blob module 80441 per file required'
    assert sum(value.count(helper) for helper in (OLD_UPLOAD_HELPER, NEW_UPLOAD_HELPER, EXISTING_GUARDED_HELPER)) == 1, 'Missing, duplicate or unregistered Blob helper copy'
    start = markers[0].start()
    for mode, factory in [('old', OLD_UPLOAD_FACTORY), ('guarded', NEW_UPLOAD_FACTORY), ('guarded', EXISTING_GUARDED_FACTORY)]:
        if value.startswith(factory, start):
            end = start + len(factory)
            assert end == len(value) or value[end] in ',}] ;\r\n', 'Unexpected Blob module factory boundary'
            return mode
    raise AssertionError('Blob helper module/export/factory differs from the proven runtime')


def scan_upload_retry(base):
    """Validate all registered copies before any overlay file is written."""
    base = Path(base)
    assert base.is_dir() and not base.is_symlink(), 'Regular non-symlink retained runtime root required'
    server = base / 'apps/web/.next/server'
    assert server.is_dir() and not server.is_symlink(), 'Actual regular retained Next server tree required'
    assert all(not entry.is_symlink() for entry in server.rglob('*')), 'Symlinked retained server entries are not allowed'
    copies = []
    for file in sorted(server.rglob('*.js')):
        relative = file.relative_to(base)
        assert relative.parts[:4] == ('apps', 'web', '.next', 'server'), 'Blob helper path outside the retained Next server'
        assert not file.is_symlink() and file.is_file(), 'Regular non-symlink server JavaScript required'
        assert all(not parent.is_symlink() for parent in file.parents if parent != base), 'Symlinked server path is not allowed'
        original = file.read_bytes()
        value = original.decode('utf-8')
        registered = bool(re.search(r'(?<![A-Za-z0-9_$])80441\s*:', value))
        helper = any(function in value for function in (OLD_UPLOAD_HELPER, NEW_UPLOAD_HELPER, EXISTING_GUARDED_HELPER))
        if not registered and not helper:
            continue
        assert registered, 'An identical Blob helper is not registered as module 80441'
        mode = validate_upload_factory(value)
        copies.append({'path': relative.as_posix(), 'mode': mode, 'beforeSha256': digest(original), 'copies': 1})
    assert copies, 'No proven Blob helper module 80441 found in the actual runtime'
    return copies


def patch_upload_retry(base, overlay):
    base, overlay = Path(base), Path(overlay)
    assert not overlay.is_symlink(), 'Regular overlay directory required'
    copies = scan_upload_retry(base)
    planned = []
    for copy in copies:
        if copy['mode'] == 'guarded':
            continue
        relative = copy['path']
        original = (base / relative).read_bytes()
        assert digest(original) == copy['beforeSha256'], 'Blob helper changed during overlay preparation'
        candidate = original.replace(OLD_UPLOAD_HELPER.encode(), NEW_UPLOAD_HELPER.encode())
        assert candidate != original and candidate.count(NEW_UPLOAD_HELPER.encode()) == 1, 'Blob helper replacement is not unique'
        assert candidate.replace(NEW_UPLOAD_HELPER.encode(), OLD_UPLOAD_HELPER.encode()) == original, 'Blob repair exceeds its exact helper transform'
        assert validate_upload_factory(candidate.decode('utf-8')) == 'guarded', 'Repaired Blob factory/export must remain exact'
        destination = overlay / relative
        assert not destination.exists() and not destination.is_symlink(), 'Another overlay owns the Blob helper path'
        assert all(not parent.is_symlink() for parent in destination.parents if parent != overlay), 'Symlinked overlay path is not allowed'
        planned.append((relative, original, candidate, destination))
    files = []
    for relative, original, candidate, destination in planned:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(candidate)
        destination.chmod((base / relative).stat().st_mode & 0o777)
        files.append({'path': relative, 'copies': 1, 'beforeSha256': digest(original), 'afterSha256': digest(candidate), 'inverseTransformsVerified': True})
    return {'passed': True, 'moduleId': MODULE_ID,
        'oldFunctionSha256': OLD_FUNCTION_SHA256, 'newFunctionSha256': digest(NEW_UPLOAD_HELPER),
        'copiesScanned': len(copies), 'copiesPatched': len(files), 'copiesAlreadyGuarded': len(copies) - len(files),
        'changedFiles': sorted(file['path'] for file in files), 'files': files,
        'registeredCopies': copies, 'inverseTransformsVerified': True,
        'legacyUploadsPreserved': True, 'apiUnchanged': True}


def once(value, old, new):
    assert value.count(old) == 1, 'Retained uploader insertion anchor differs'
    return value.replace(old, new), (old, new)


def insert_handler(value):
    assert PAGE not in value and 'product-upload/' not in value, 'Uploader already exists in retained handler'
    changes = []
    names = ','.join(repr('product-upload/' + name) for name in sorted(ASSETS)) + ','
    value, edit = once(value, 'const assets=new Map([', 'const assets=new Map([' + names)
    changes.append(edit)
    value, edit = once(value, 'const pages=new Map([', "const pages=new Map([['/admin/product-upload','product-upload/page.html'],")
    changes.append(edit)
    old = "page?'text/html; charset=utf-8':file.endsWith('.css')?"
    new = "page?'text/html; charset=utf-8':file==='product-upload/HIDI_Product_Upload_Template.xlsx'?'" + XLSX_TYPE + "':file==='product-upload/HIDI_Product_Upload_Package.zip'?'application/zip':file.endsWith('.css')?"
    value, edit = once(value, old, new)
    changes.append(edit)
    match = re.search(r"'Content-Security-Policy':(?P<policy>\"[^\n\"]+\")", value)
    assert match and value.count(match[0]) == 1, 'Retained Admin CSP must be explicit and unique'
    policy = match['policy']
    assert policy.count("img-src 'self' https: http:;") == 1, 'Retained Admin image policy differs'
    scoped = policy.replace("img-src 'self' https: http:;", "img-src 'self' https: http: blob:;")
    value, edit = once(value, match[0], "'Content-Security-Policy':pathname==='/admin/product-upload'?" + scoped + ':' + policy)
    changes.append(edit)
    old = "'Content-Length':body.length"
    new = "...(file==='product-upload/HIDI_Product_Upload_Template.xlsx'?{'Content-Disposition':'attachment; filename=\"HIDI_Product_Upload_Template.xlsx\"'}:file==='product-upload/HIDI_Product_Upload_Package.zip'?{'Content-Disposition':'attachment; filename=\"HIDI_Product_Upload_Package.zip\"'}:{}),'Content-Length':body.length"
    value, edit = once(value, old, new)
    changes.append(edit)
    return value, changes


def insert_navigation(value):
    assert PAGE not in value and "key: 'product-upload'" not in value, 'Uploader already exists in retained navigation'
    return once(value, '  const tools = [\n', '  const tools = [\n' + TOOL)


def inverse(candidate, edits):
    for old, new in reversed(edits):
        assert candidate.count(new) == 1, 'Uploader transform cannot be reversed uniquely'
        candidate = candidate.replace(new, old)
    return candidate


def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    assert (base / 'server.mjs').is_file() and (base / 'apps/web/server.js').is_file(), 'Retained combined Web runtime required'
    server = (base / 'server.mjs').read_text()
    assert re.search(r"(?:from|import\()\s*['\"]\./admin-tools/handler\.mjs['\"]", server), 'Retained Admin handler is not connected'
    assert 'handleQuickTools(request, response, pathname' in server, 'Retained Admin route dispatch differs'
    assert SOURCE.is_dir(), 'Uploader source assets missing'
    assert all((SOURCE / name).is_file() and not (SOURCE / name).is_symlink() for name in FILES), 'Complete regular uploader assets required'
    with zipfile.ZipFile(SOURCE / 'HIDI_Product_Upload_Template.xlsx') as book:
        assert {'[Content_Types].xml', 'xl/workbook.xml'} <= set(book.namelist()), 'Real XLSX workbook required'
    originals = {name: (base / name).read_text() for name in (HANDLER, NAVIGATION)}
    updating = PAGE in originals[HANDLER]
    if updating:
        assert originals[HANDLER].count("['/admin/product-upload','product-upload/page.html']") == 1, 'Exactly one retained uploader route required'
        assert originals[NAVIGATION].count(TOOL) == 1, 'Exactly one unchanged Product Upload navigation row required'
        handler, handler_edits = originals[HANDLER], []
        old = 'const assets=new Map(['
        additions = ','.join(repr('product-upload/' + name) for name in sorted(ASSETS - set(PRIOR_ASSET_HASHES))) + ','
        assert all('product-upload/' + name not in handler for name in ASSETS - set(PRIOR_ASSET_HASHES)), 'Package assets already present; fresh prior-version runtime required'
        handler, edit = once(handler, old, old + additions)
        handler_edits.append(edit)
        old = "'" + XLSX_TYPE + "':file.endsWith('.css')?"
        handler, edit = once(handler, old, "'" + XLSX_TYPE + "':file==='product-upload/HIDI_Product_Upload_Package.zip'?'application/zip':file.endsWith('.css')?")
        handler_edits.append(edit)
        old = 'attachment; filename="HIDI_Product_Upload_Template.xlsx"\'}:{}),\'Content-Length\':body.length'
        new = 'attachment; filename="HIDI_Product_Upload_Template.xlsx"\'}:file===\'product-upload/HIDI_Product_Upload_Package.zip\'?{\'Content-Disposition\':\'attachment; filename="HIDI_Product_Upload_Package.zip"\'}:{}),\'Content-Length\':body.length'
        handler, edit = once(handler, old, new)
        handler_edits.append(edit)
        navigation = originals[NAVIGATION]
        for name, expected_hash in PRIOR_ASSET_HASHES.items():
            retained = base / 'admin-tools/product-upload' / name
            assert retained.is_file() and not retained.is_symlink() and digest(retained.read_bytes()) == expected_hash, 'Retained uploader asset differs from verified prior release: ' + name
    else:
        handler, handler_edits = insert_handler(originals[HANDLER])
        navigation, nav_edit = insert_navigation(originals[NAVIGATION])
        assert inverse(navigation, [nav_edit]) == originals[NAVIGATION], 'Admin navigation changed beyond one uploader row'
    assert inverse(handler, handler_edits) == originals[HANDLER], 'Admin handler changed beyond uploader asset entries'
    retry_repair = patch_upload_retry(base, overlay)
    allowed = set(retry_repair['changedFiles'])
    for name, value in ((HANDLER, handler), (NAVIGATION, navigation)):
        if value == originals[name]:
            continue
        allowed.add(name)
        destination = overlay / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(value)
        destination.chmod((base / name).stat().st_mode & 0o777)
    for name in sorted(FILES):
        relative = 'admin-tools/product-upload/' + name
        retained = base / relative
        if retained.exists():
            assert updating and name in PRIOR_ASSET_HASHES, 'Unreviewed retained uploader asset replacement'
            if retained.read_bytes() == (SOURCE / name).read_bytes():
                continue
        allowed.add(relative)
        destination = overlay / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SOURCE / name, destination)
        destination.chmod(0o644)
    return {
        'passed': True,
        'allowedFiles': sorted(allowed),
        'updatingExistingUploader': updating,
        'changedExistingFiles': sorted(name for name in allowed if (base / name).exists()),
        'newPage': PAGE,
        'newAssets': sorted(ASSET_PREFIX + name for name in ASSETS),
        'inverseTransformsVerified': True,
        'uploadRetryRepair': retry_repair,
        'compiledNextUntouched': not retry_repair['changedFiles'],
        'compiledNextPreservedExceptUploadRetry': True,
        'serverUntouched': True,
        'apiUnchanged': True,
        'retainedPagePoliciesPreserved': True,
    }
