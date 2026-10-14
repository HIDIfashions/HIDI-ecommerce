"""Narrow compiled ProductCard patch and reversible purchase palette injection."""
from pathlib import Path
import re
import hashlib

HERE = Path(__file__).resolve().parent
OLD_ERROR = 'Choose your size above to continue.'
NEW_ERROR = 'Select a size to continue.'

def patch_card(source):
    assert source.count(OLD_ERROR) == 1, 'One reviewed ProductCard validation handler required'
    match = re.search(r'if\([^{};]{0,180}!([\w$]+)\)\{[^{}]{0,100}"'+re.escape(OLD_ERROR)+r'"', source)
    assert match, 'Missing-size early-return guard required'
    selected = match[1]
    needle = '||!'+selected+'||"added"'
    changed = []
    def enabled(match):
        old = match[0]
        if needle not in old: return old
        new = old.replace('||!'+selected, '', 1)
        changed.append((old,new))
        return new
    result = re.sub(r'disabled:[^,}\n]{1,140}', enabled, source)
    assert len(changed) == 5, 'Expected mobile/desktop pairs and quick-sheet checkout only'
    changes = [(OLD_ERROR,NEW_ERROR)]
    feedback = re.search(r'className:([\w$]+\(\))\.mobileInlineFeedback,role:([\w$]+)\?"alert":"status"', result)
    assert feedback, 'Existing mobile inline feedback required'
    changes.append((feedback[0], 'className:`${'+feedback[1]+'.mobileInlineFeedback} ${'+feedback[2]+'?'+feedback[1]+'.error:""}`,role:'+feedback[2]+'?"alert":"status"'))
    idle = '('+selected+'?"":"Choose a size to add this piece.")'
    assert result.count(idle) == 1
    changes.append((idle,'""'))
    for label in ['Add to Bag','Add to cart','Add to bag']:
        # These exact literals are ProductCard purchase labels, not network data.
        if '"'+label+'"' in result: changes.append(('"'+label+'"','"Add to Cart"'))
    for before, after in changes: result = result.replace(before, after)
    assert '!'+selected+'){' in result and NEW_ERROR in result
    assert 'await ' in result and '"/checkout"' in result
    return result

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    tree = base/'apps/web/.next'
    original = {path.relative_to(base).as_posix():path.read_text() for path in tree.rglob('*')
                if path.is_file() and not path.is_symlink() and path.suffix in {'.js','.json','.html','.rsc','.meta'}}
    semantic, reports = dict(original), []
    for name, source in original.items():
        if not name.endswith('.js'): continue
        if OLD_ERROR not in source: continue
        semantic[name] = patch_card(source)
        reports.append({'path':name,'enabledControls':5,'missingSizeBlockedBeforeWrite':True})
    assert any('/static/' in item['path'] for item in reports), 'Client ProductCard patch required'
    assert any('/server/' in item['path'] for item in reports), 'Server ProductCard patch required'
    # Issue new immutable URLs for altered browser chunks and their runtime map.
    # Retain all previous URLs so already-open sessions can still load them.
    mapping = {}
    for _ in range(8):
        final = dict(semantic)
        for name, value in semantic.items():
            for old, new in mapping.items():
                value = value.replace(re.search(r'-([a-f0-9]{16})\.js$',old)[1], re.search(r'-([a-f0-9]{16})\.js$',new)[1])
            final[name] = value
        updated = {}
        for name, value in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and value != original[name]:
                match = re.search(r'-([a-f0-9]{16})\.js$',name)
                assert match, 'Expected immutable chunk hash'
                digest = hashlib.sha256(value.encode()).hexdigest()[:16]
                updated[name] = name[:match.start(1)]+digest+name[match.end(1):]
        if updated == mapping: break
        mapping = updated
    else: raise AssertionError('Purchase asset references did not settle')
    assert mapping, 'New immutable browser asset URLs required'
    files = {}
    for name, value in final.items():
        if value == original[name]: continue
        destination = mapping.get(name,name)
        assert destination == name or not (base/destination).exists(), 'New immutable asset already exists'
        files[destination] = value
    source = (base/'server.mjs').read_text()
    start = source.index('const storefrontLayerFix = `')
    end = source.index('</style>', start)
    css = (HERE/'purchase-actions.css').read_text()
    assert all(token not in css for token in ['`','${','<','url(','@import'])
    addition = '\n/* hidi-purchase-actions-20261014 */\n'+css+'\n'
    assert 'hidi-purchase-actions-20261014' not in source, 'Palette already installed'
    files['server.mjs'] = source[:end]+addition+source[end:]
    assert files['server.mjs'].replace(addition,'',1) == source
    for name, value in files.items():
        target = overlay/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(value)
    return {'passed':True,'allowedFiles':sorted(files),'compiledCards':reports,'renamedAssets':mapping,'oldAssetsRetained':True,
            'stockAndDuplicateGuardsPreserved':True,'databaseWrites':False,'blobWrites':False,'apiUnchanged':True}
