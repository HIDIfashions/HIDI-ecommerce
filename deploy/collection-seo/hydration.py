"""Wait for the real collection commit before adding price display elements."""
import hashlib,re
from pathlib import Path
HOOK='(0,o.useEffect)(()=>{if(!B)return;'
READY='(0,o.useEffect)(()=>{const root=document.querySelector(".collection-page");if(root){root.dataset.hidiCollectionHydrated="true";window.dispatchEvent(new Event("hidi:collection-ready"));}},[]),'
GUARD='  if(location.pathname.startsWith("/collections/") && !document.querySelector(\'[data-hidi-collection-hydrated="true"]\'))return;\n'
PDP='  const product=document.querySelector("[data-hidi-react-pdp]");\n  if(product && product.dataset.hidiHydrated!=="true")return;\n'
EVENT="window.addEventListener('hidi:collection-ready',apply);\n"
PDP_EVENT="window.addEventListener('hidi:product-ready',apply);\n"
def changes(base):
    base=Path(base);root=base/'apps/web/.next';files={}
    candidates=[p for p in (root/'static/chunks').glob('*.js') if HOOK in p.read_text() and 'Sort products' in p.read_text()]
    assert len(candidates)==1,'One inspected collection client chunk required'
    path=candidates[0];source=path.read_text();assert source.count(HOOK)==1
    result=source.replace(HOOK,READY+HOOK,1);assert result.replace(READY,'',1)==source
    oldhash=re.search(r'-([0-9a-f]{16})\.js$',path.name).group(1);newhash=hashlib.sha256(result.encode()).hexdigest()[:16]
    newpath=path.with_name(path.name.replace(oldhash,newhash));files[newpath.relative_to(base).as_posix()]=result.encode()
    # Publish the readiness effect under a new URL, retaining every old asset.
    replacements={oldhash:newhash};originals={p:p.read_text() for p in root.rglob('*') if p.is_file() and p.suffix in ['.js','.json'] and p!=path}
    # The webpack mapping is content-addressed as well, so cached runtimes stay valid.
    runtimes=[p for p in (root/'static/chunks').glob('webpack-*.js') if oldhash in p.read_text()]
    assert len(runtimes)==1,'One collection chunk loader mapping required'
    runtime=runtimes[0];previous=originals.pop(runtime);updated=previous.replace(oldhash,newhash)
    runtimehash=re.search(r'webpack-([0-9a-f]{16})\.js$',runtime.name).group(1);nextHash=hashlib.sha256(updated.encode()).hexdigest()[:16]
    replacements[runtimehash]=nextHash
    files[runtime.with_name('webpack-'+nextHash+'.js').relative_to(base).as_posix()]=updated.encode()
    for p,previous in originals.items():
        updated=previous
        for old,new in replacements.items():updated=updated.replace(old,new)
        if updated!=previous:
            assert '/static/chunks/' not in p.as_posix(),'Unexpected static asset references; inspect before changing'
            inverse=updated
            for old,new in reversed(list(replacements.items())):inverse=inverse.replace(new,old)
            assert inverse==previous
            files[p.relative_to(base).as_posix()]=updated.encode()
    source=(base/'pricing/storefront.mjs').read_text();updated=source
    if PDP not in updated:updated=updated.replace('function apply(){\n','function apply(){\n'+PDP,1)
    assert GUARD not in updated
    updated=updated.replace('function apply(){\n','function apply(){\n'+GUARD,1)
    if PDP_EVENT not in updated:updated=updated.replace("window.addEventListener('pageshow',refresh);",PDP_EVENT+"window.addEventListener('pageshow',refresh);",1)
    updated=updated.replace("window.addEventListener('pageshow',refresh);",EVENT+"window.addEventListener('pageshow',refresh);",1)
    restored=updated.replace(GUARD,'',1).replace(EVENT,'',1)
    if PDP not in source:restored=restored.replace(PDP,'',1)
    if PDP_EVENT not in source:restored=restored.replace(PDP_EVENT,'',1)
    assert restored==source
    files['pricing/storefront.mjs']=updated.encode()
    return files
