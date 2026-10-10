"""Version only product-image display helpers and add the isolated image handler."""
import hashlib
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ID = r'[A-Za-z_$][\w$]*'
SOURCE = re.compile(r'function (?P<fn>'+ID+r')\((?P<arg>'+ID+r')\)\{try\{(?:let|const) (?P<url>'+ID+r')=new URL\((?P=arg)\);if\((?P<condition>.*?)\)return (?P=url)\.pathname\+(?P=url)\.search\}catch\{\}return (?P=arg)\}')

def once(text, old, new):
    assert text.count(old) == 1, 'Product image runtime anchor differs: ' + old[:100]
    return text.replace(old, new)

def version(text):
    changed = 0
    def replace(match):
        nonlocal changed
        if '.pathname.startsWith("/media/products/")' not in match['condition']: return match[0]
        assert '.hostname.toLowerCase()' in match['condition'] and '"https:"' in match['condition']
        def display(value):
            return '((hidiPhotoPath)=>{const hidiPhotoUrl=new URL(hidiPhotoPath,"https://hidiindia.com");hidiPhotoUrl.pathname=hidiPhotoUrl.pathname.replace(/^\\/media\\/products\\/(?:_display_v2\\/)?/,"/media/products/_display_v2/");return hidiPhotoUrl.pathname+hidiPhotoUrl.search})('+value+')'
        old = match[0]
        old = once(old, 'return '+match['url']+'.pathname+'+match['url']+'.search}', 'return '+display(match['url']+'.pathname+'+match['url']+'.search')+'}')
        old = once(old, 'return '+match['arg']+'}', 'return '+match['arg']+'.startsWith("/media/products/")?'+display(match['arg'])+':'+match['arg']+'}')
        changed += 1
        return old
    result = SOURCE.sub(replace, text)
    return result, changed

def patch_web(base, overlay):
    base, overlay = Path(base), Path(overlay)
    assert not (base / 'product-images/images.mjs').exists(), 'Image handler already present; inspect before updating'
    original = {file.relative_to(base).as_posix():file.read_text() for file in (base / 'apps/web/.next').rglob('*') if file.is_file() and not file.is_symlink() and file.suffix in {'.js','.json','.html','.rsc','.meta'}}
    semantic = dict(original); helpers = {}
    for name, text in original.items():
        if '/media/products/' not in text or 'thidigk.thehidi.com' not in text: continue
        modified, count = version(text)
        if count: semantic[name] = modified; helpers[name] = count
    assert any(name.startswith('apps/web/.next/static/') for name in helpers), 'Retained browser image helper missing'
    assert any(name.startswith('apps/web/.next/server/') for name in helpers), 'Retained server image helper missing'
    mapping = {}
    for _ in range(12):
        final = {}
        for name, text in semantic.items():
            for old, new in mapping.items():
                text = text.replace(re.search(r'-([a-f0-9]{16})\.js$',old)[1], re.search(r'-([a-f0-9]{16})\.js$',new)[1])
            final[name] = text
        updated = {}
        for name, text in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and text != original[name]:
                match = re.search(r'-([a-f0-9]{16})\.js$',name); assert match, 'Content-addressed original asset required'
                updated[name] = name[:match.start(1)] + hashlib.sha256(text.encode()).hexdigest()[:16] + name[match.end(1):]
        if updated == mapping: break
        mapping = updated
    else: raise AssertionError('Product image asset references did not settle')
    files = {mapping.get(name,name):text for name,text in final.items() if text != original[name]}
    server = (base / 'server.mjs').read_text()
    server = once(server, 'import { createHeroMediaHandler } from "./hero-media.mjs";', 'import { createHeroMediaHandler } from "./hero-media.mjs";\nimport { createProductImageHandler } from "./product-images/images.mjs";')
    anchor = 'const handleHeroMedia = createHeroMediaHandler({ origin, hasStorefront });'
    server = once(server, anchor, anchor + '\nconst productImageHandler = createProductImageHandler({ origin });\nproductImageHandler.startWarm();')
    anchor = '  if (await handlePrivacyPolicy(request, response, pathname)) return;'
    server = once(server, anchor, '  if (await productImageHandler.handle(request, response, pathname)) return;\n' + anchor)
    files['server.mjs'] = server
    files['product-images/images.mjs'] = (HERE / 'images.mjs').read_text()
    for name, text in files.items():
        target = overlay / name; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(text)
    return {'passed':True,'allowedFiles':sorted(files),'renamedAssets':mapping,'displayHelpers':helpers,'oldAssetsRetained':True,'originalPhotosUnchanged':True,'apiUnchanged':True}
