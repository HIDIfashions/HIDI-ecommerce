"""Add the editor to a freshly captured Web image, retaining unrelated bytes."""
from pathlib import Path
import hashlib
import shutil

SOURCE = Path(__file__).resolve().parents[1] / 'admin-tools'
FILES = ['product-page.html', 'product-page.css', 'product-page.mjs', 'product-page-model.mjs']
TOOL = "    { key: 'product-page', label: 'Product Page Editor', href: '/admin/product-page', icon: '<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M12 3v18M15 8h3m-3 4h3m-3 4h3\"/>', marker: 'hidiProductPage' },\n"

def once(value, old, new):
    assert value.count(old) == 1, 'Retained Admin insertion anchor changed'
    return value.replace(old, new)

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    assert not base.is_symlink() and not overlay.is_symlink(), 'Regular runtime directories required'
    server = (base / 'server.mjs').read_text()
    assert 'handleQuickTools(request, response, pathname' in server, 'Existing Admin dispatcher required'
    originals = {name: (base / name).read_text() for name in ['admin-tools/handler.mjs', 'admin-tools/navigation.js']}
    assert all('/admin/product-page' not in value for value in originals.values()), 'Editor already installed; review fresh runtime before updating'
    handler = once(originals['admin-tools/handler.mjs'], 'const assets=new Map([', "const assets=new Map(['product-page.css','product-page.mjs','product-page-model.mjs',")
    handler = once(handler, 'const pages=new Map([', "const pages=new Map([['/admin/product-page','product-page.html'],")
    # Insert precisely the reviewed source's additive links; do not replace the
    # retained navigation file, which also carries the live Product Upload tab.
    source_nav = (SOURCE / 'navigation.js').read_text()
    start = source_nav.index("    for(const a of document.querySelectorAll('a[href^=\"/admin/products/\"]')){")
    end = source_nav.index("    if(['/admin/import','/admin/product-bulk'].includes", start)
    links = source_nav[start:end]
    nav = once(originals['admin-tools/navigation.js'], '  const tools = [\n', '  const tools = [\n' + TOOL)
    anchor = "    const path=location.pathname;if(!path.startsWith('/admin'))return;\n"
    nav = once(nav, anchor, anchor + links)
    assert handler.replace("'product-page.css','product-page.mjs','product-page-model.mjs',", '', 1).replace("['/admin/product-page','product-page.html'],", '', 1) == originals['admin-tools/handler.mjs']
    assert nav.replace(TOOL, '', 1).replace(links, '', 1) == originals['admin-tools/navigation.js']
    report = []
    for name, value in [('admin-tools/handler.mjs', handler), ('admin-tools/navigation.js', nav)]:
        destination = overlay / name
        assert not destination.exists(), 'Overlay path already owned'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(value)
        report.append({'path': name, 'before': hashlib.sha256(originals[name].encode()).hexdigest(), 'after': hashlib.sha256(value.encode()).hexdigest()})
    for name in FILES:
        source, destination = SOURCE / name, overlay / 'admin-tools' / name
        assert source.is_file() and not source.is_symlink() and not (base / 'admin-tools' / name).exists()
        assert not destination.exists()
        shutil.copyfile(source, destination)
    return {'passed': True, 'files': report, 'allowedFiles': ['admin-tools/handler.mjs', 'admin-tools/navigation.js', *['admin-tools/' + name for name in FILES]], 'inverseTransformsVerified': True, 'compiledNextUntouched': True, 'apiUnchanged': True, 'serverUntouched': True}
