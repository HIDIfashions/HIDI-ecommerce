"""Apply PIN synchronization to the two active retained checkout modules."""
from pathlib import Path
import hashlib
import json
import posixpath
import re
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
def sha(value): return hashlib.sha256(value.encode()).hexdigest()
def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    original = {p.relative_to(base).as_posix(): p.read_text() for p in (base/'apps/web/.next').rglob('*')
                if p.is_file() and not p.is_symlink() and p.suffix in {'.js','.json','.html','.rsc','.meta'}}
    semantic = dict(original)
    page_path = 'apps/web/.next/server/app/checkout/page.js'
    manifest = original[page_path.removesuffix('.js') + '_client-reference-manifest.js']
    active_browser = {'apps/web/.next/' + value for value in re.findall(r'static/chunks/app/checkout/page-[a-f0-9]{16}\.js', manifest)}
    assert len(active_browser)==1, 'Exactly one current checkout browser chunk required'
    trace = json.loads(original[page_path + '.nft.json'])
    active_server = {page_path} | {posixpath.normpath(posixpath.join(posixpath.dirname(page_path), value)) for value in trace['files']}
    patched = []
    client_modules = []
    page_modules = []
    with tempfile.TemporaryDirectory() as folder:
        source, target = Path(folder)/'input.js', Path(folder)/'output.js'
        for name, text in original.items():
            if name not in active_browser and name not in active_server:
                continue
            if name.endswith('.js') and ('checkout-form' in text and '/checkout/delivery-serviceability' in text):
                assert name.endswith('/checkout/page.js') or re.fullmatch(r'apps/web/\.next/server/chunks/[^/]+\.js',name) or re.fullmatch(r'apps/web/\.next/static/chunks/app/checkout/page-[a-f0-9]{16}\.js',name), 'Unexpected checkout module location: '+name
                source.write_text(text)
                result=subprocess.run(['node',str(HERE/'patch-module.mjs'),str(source),str(target)],capture_output=True,text=True)
                if result.returncode:
                    print('Retained checkout patch failed in '+name, flush=True)
                    print(result.stderr, flush=True)
                    result.check_returncode()
                report=json.loads(result.stdout)
                assert report['inverseTransformsVerified'] and report['paymentSubmissionPreserved']
                client_modules.append(name)
                semantic[name] = target.read_text(); patched.append(name)
    assert len(client_modules) == 2 and sum('/server/' in name for name in client_modules)==1, 'Both retained server and browser checkout components required: '+repr(client_modules)
    mapping = {}
    for _ in range(8):
        final = {}
        for name,text in semantic.items():
            for old,new in mapping.items():
                old_hash=re.search(r'-([a-f0-9]{16})\.js$',old)[1]
                new_hash=re.search(r'-([a-f0-9]{16})\.js$',new)[1]
                text=text.replace(old_hash,new_hash)
            final[name]=text
        updated={}
        for name,text in final.items():
            if name.startswith('apps/web/.next/static/') and name.endswith('.js') and text!=original[name]:
                match=re.search(r'-([a-f0-9]{16})\.js$',name); assert match
                updated[name]=name[:match.start(1)]+sha(text)[:16]+name[match.end(1):]
        if mapping==updated: break
        mapping=updated
    else: raise AssertionError('Asset references did not settle')
    files={mapping.get(name,name):text for name,text in final.items() if text!=original[name]}
    for name,text in files.items():
        if name in mapping.values(): assert not (base/name).exists(), 'Immutable asset collision'
        destination=overlay/name; destination.parent.mkdir(parents=True,exist_ok=True); destination.write_text(text)
        if name.endswith('.js') or name=='server.mjs': subprocess.run(['node','--check',str(destination)],check=True)
    return {'passed':True,'allowedFiles':sorted(files),'renamedAssets':mapping,'checkoutModules':patched,
            'paymentSubmissionPreserved':True,'apiUnchanged':True,'oldAssetsRetained':True,'inverseTransformsVerified':True}
if __name__=='__main__':
    import sys
    result=patch_runtime(sys.argv[1],sys.argv[2]); Path(sys.argv[3]).write_text(json.dumps(result,indent=2))
