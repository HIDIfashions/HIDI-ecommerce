from pathlib import Path
import importlib.util
import tempfile

here=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('patch',here/'patch-runtime.py')
patch=importlib.util.module_from_spec(spec);spec.loader.exec_module(patch)
links='(0,n.jsx)(o(),{prefetch:!1,href:"/lookbook",children:"The HIDI Lookbook"}),(0,n.jsx)(o(),{prefetch:!1,href:"/lookbook",className:"footer-lookbook-link",children:"Explore our editorial archive →"})'
with tempfile.TemporaryDirectory() as temp:
    base=Path(temp)/'base';base.mkdir()
    server='const storefrontLayerFix = `<style data-hidi-storefront-layer-fix="true">existing css</style>`;\n  if (pathname === "/health") {\n}\n'
    (base/'server.mjs').write_text(server)
    for name in ['apps/web/.next/server/chunks/layout.js','apps/web/.next/static/chunks/layout.js']:
        target=base/name;target.parent.mkdir(parents=True);target.write_text('unchanged_before;['+links+'];unchanged_after;')
    (base/'dist').mkdir();(base/'dist/index.html').write_text('<head></head><nav><a href="/collections/all">Shop</a><a href="/lookbook">Lookbook</a></nav>')
    overlay=Path(temp)/'overlay';report=patch.patch_runtime(base,overlay)
    assert report['passed'] and len(report['compiledFooterLinks'])==2
    for item in report['compiledFooterLinks']:
        assert (overlay/item['path']).read_text()=='unchanged_before;[null,null];unchanged_after;'
    assert (base/'server.mjs').read_text()==server
    assert (overlay/'dist/index.html').read_text()=='<head><style data-hidi-lookbook-removal="true">'+patch.CSS+'</style></head><nav><a href="/collections/all">Shop</a></nav>'
print('PASS: exact link expressions removed; unrelated markup and source bytes retained')
