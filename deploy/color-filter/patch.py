import hashlib, json, re
from pathlib import Path

ID = r'[A-Za-z_$][\w$]*'

def palette():
    source = Path('apps/web/components/collection-browser.tsx').read_text()
    body = source.split('const COLOR_SWATCHES: Record<string, string> = {', 1)[1].split('\n};', 1)[0]
    values = {}
    for key, value in re.findall(r'^\s*("[^"\n]+"|\w+): ("[^"\n]+"),', body, re.M):
        name = json.loads(key) if key.startswith('"') else key
        values[re.sub(r'\s+', ' ', re.sub('[-_]+', ' ', name.strip().lower()))] = json.loads(value)
    assert len(values) > 55
    return values

def patch_text(source):
    anchor = re.search(r'(?P<map>'+ID+r')=\{Sage:"#9fa88d",.*?Grey:"#9ca3a6"\}', source)
    if not anchor: return source, 0
    name = anchor['map']
    modified = source[:anchor.start()] + name+'='+json.dumps(palette(), separators=(',', ':')) + source[anchor.end():]
    component = re.search(r'function '+ID+r'\(\{products:(?P<products>'+ID+r')\}\)\{', modified[anchor.start():])
    assert component, 'Collection component signature changed'
    offset = anchor.start()+component.end()
    products = component['products']
    prefix = 'const hidiFilterHexes=new Map;for(const p of '+products+')for(const v of p.variants){const h=v.colorHex?.trim();if(h&&/^#[0-9a-f]{6}$/i.test(h)&&!hidiFilterHexes.has(v.color))hidiFilterHexes.set(v.color,h)}'
    modified = modified[:offset] + prefix + modified[offset:]
    pattern = r'backgroundColor:'+re.escape(name)+r'\[(?P<color>'+ID+r')\]\?\?"#b8b5ae"'
    def swatch(m):
        c=m['color']
        return 'background:hidiFilterHexes.get('+c+')??'+name+'['+c+'.trim().toLowerCase().replace(/[-_]+/g," ").replace(/\\s+/g," ")]??(/multi\\s*colou?r|floral/.test('+c+'.toLowerCase())?"conic-gradient(#c9575c, #dda0b5, #c7a445, #6ba268, #4f7fb7, #c9575c)":"#b8b5ae")'
    modified, count = re.subn(pattern, swatch, modified)
    assert count == 1, 'Expected one colour swatch style'
    modified, count = re.subn(r'\$\{'+ID+r'\.has\('+ID+r'\)\?('+ID+r'\(\)\.colorSwatchLight):""\}', r'${\1}', modified)
    assert count == 1, 'Expected one swatch border condition'
    return modified, 1

def patch_web(base, overlay):
    original = {p.relative_to(base).as_posix():p.read_text() for p in (base/'apps/web/.next').rglob('*') if p.is_file() and not p.is_symlink() and p.suffix in {'.js','.json','.html','.rsc','.meta'}}
    semantic = dict(original); patched=[]
    for name, text in original.items():
        changed, count = patch_text(text)
        if count: semantic[name]=changed; patched.append(name)
    assert any('/static/' in p for p in patched) and any('/server/' in p for p in patched), 'Both browser and SSR swatches must be patched'
    mapping={}
    for _ in range(12):
        final={}
        for name,text in semantic.items():
            for old,new in mapping.items():
                text=text.replace(re.search(r'-([a-f0-9]{16})\.js$',old)[1],re.search(r'-([a-f0-9]{16})\.js$',new)[1])
            final[name]=text
        updated={}
        for name,text in final.items():
            if '/static/' in name and name.endswith('.js') and text!=original[name]:
                match=re.search(r'-([a-f0-9]{16})\.js$',name); assert match
                updated[name]=name[:match.start(1)]+hashlib.sha256(text.encode()).hexdigest()[:16]+name[match.end(1):]
        if updated==mapping: break
        mapping=updated
    else: raise AssertionError('Asset hashes did not settle')
    files={mapping.get(name,name):text for name,text in final.items() if text!=original[name]}
    for name,text in files.items():
        dest=overlay/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text)
    return {'passed':True,'allowedFiles':sorted(files),'renamedAssets':mapping,'swatchModules':patched,'palette':palette()}
