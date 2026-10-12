"""Add one Admin uploader without replacing any retained runtime module."""
from pathlib import Path
import re
import shutil
import zipfile

HERE = Path(__file__).resolve().parent
SOURCE = HERE
ASSETS = {'client.mjs', 'model.mjs', 'engine.mjs', 'styles.css', 'HIDI_Product_Upload_Template.xlsx'}
FILES = ASSETS | {'page.html'}
HANDLER = 'admin-tools/handler.mjs'
NAVIGATION = 'admin-tools/navigation.js'
PAGE = '/admin/product-upload'
ASSET_PREFIX = '/admin-tools-assets/product-upload/'
XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
TOOL = "    { key: 'product-upload', label: 'Product Upload', href: '/admin/product-upload', icon: '<path d=\"M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5\"/>', marker: 'hidiProductUpload' },\n"


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
    new = "page?'text/html; charset=utf-8':file==='product-upload/HIDI_Product_Upload_Template.xlsx'?'" + XLSX_TYPE + "':file.endsWith('.css')?"
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
    new = "...(file==='product-upload/HIDI_Product_Upload_Template.xlsx'?{'Content-Disposition':'attachment; filename=\"HIDI_Product_Upload_Template.xlsx\"'}:{}),'Content-Length':body.length"
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
    handler, handler_edits = insert_handler(originals[HANDLER])
    navigation, nav_edit = insert_navigation(originals[NAVIGATION])
    assert inverse(handler, handler_edits) == originals[HANDLER], 'Admin handler changed beyond the uploader entries'
    assert inverse(navigation, [nav_edit]) == originals[NAVIGATION], 'Admin navigation changed beyond one uploader row'
    for name, value in ((HANDLER, handler), (NAVIGATION, navigation)):
        destination = overlay / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(value)
        destination.chmod((base / name).stat().st_mode & 0o777)
    for name in sorted(FILES):
        relative = 'admin-tools/product-upload/' + name
        assert not (base / relative).exists(), 'New uploader asset would replace a retained file'
        destination = overlay / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SOURCE / name, destination)
        destination.chmod(0o644)
    return {
        'passed': True,
        'allowedFiles': sorted({HANDLER, NAVIGATION} | {'admin-tools/product-upload/' + name for name in FILES}),
        'changedExistingFiles': [HANDLER, NAVIGATION],
        'newPage': PAGE,
        'newAssets': sorted(ASSET_PREFIX + name for name in ASSETS),
        'inverseTransformsVerified': True,
        'compiledNextUntouched': True,
        'serverUntouched': True,
        'apiUnchanged': True,
        'retainedPagePoliciesPreserved': True,
    }
