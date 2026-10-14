"""Remove exact compiled footer links and retire the route over the fresh live image."""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
LINK = re.compile(r'\(0,[\w$]+\.jsx\)\([^,]+,\{prefetch:!1,href:"/lookbook",(?:className:"footer-lookbook-link",)?children:"(?:The HIDI Lookbook|Explore our editorial archive (?:→|\\u2192))"\}\)')
HTML_LINK = re.compile(r'<a\b[^>]*\bhref=[\"\']/lookbook/?[\"\'][^>]*>[\s\S]*?</a>', re.I)
CSS = '\n/* hidi-lookbook-removal-20261014 */\na[href="/lookbook"],a[href="/lookbook/"],a[href="https://hidiindia.com/lookbook"],a[href="https://hidiindia.com/lookbook/"]{display:none!important}\n'

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    original = (base/'server.mjs').read_text()
    assert 'handleLookbookRemoval' not in original, 'Removal already installed'
    anchor = '  if (pathname === "/health") {'
    assert original.count(anchor) == 1
    prefix = 'import { handleLookbookRemoval } from "./lookbook-removal/handler.mjs";\n'
    hook = '  if (handleLookbookRemoval(request, response, pathname)) return;\n\n'
    start = original.index('const storefrontLayerFix = `')
    end = original.index('</style>', start)
    source = original[:end] + CSS + original[end:]
    source = prefix + source.replace(anchor, hook + anchor, 1)
    assert source.removeprefix(prefix).replace(hook, '', 1).replace(CSS, '', 1) == original
    files = {'server.mjs': source, 'lookbook-removal/handler.mjs': (HERE/'handler.mjs').read_text()}
    compiled = []
    for path in base.rglob('*.js'):
        name = path.relative_to(base).as_posix()
        if '/.next/' not in '/'+name or 'node_modules/' in name: continue
        before = path.read_text()
        after, count = LINK.subn('null', before)
        if count:
            assert count == 2, 'Expected both reviewed footer links in '+name
            files[name] = after
            compiled.append({'path':name,'removedLinks':count})
    assert any('/static/' in item['path'] for item in compiled), 'Reviewed client footer must be removed'
    assert any('/server/' in item['path'] for item in compiled), 'Reviewed server footer must be removed'
    static = []
    for path in (base/'dist').glob('*.html'):
        before = path.read_text()
        after, count = HTML_LINK.subn('', before)
        if count:
            name = path.relative_to(base).as_posix()
            files[name] = after
            static.append({'path':name,'removedLinks':count})
    for name, value in files.items():
        target = overlay/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)
    return {'passed':True,'allowedFiles':sorted(files),'compiledFooterLinks':compiled,
            'staticLinks':static,'routeRedirect':'/collections/all','databaseWrites':False,
            'blobWrites':False,'inverseWrapperTransformVerified':True}
