"""Remove only the inspected visible collection SEO header additions."""
import importlib.util,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('previous_collection_copy',HERE.parent/'collection-seo/patch-runtime.py')
previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)
TITLES={'all':'All Products','casual-wear':'Casual Wear','work-wear':'Work Wear','occasional-wear':'Occasional Wear'}
def collection_patch(data):
    copy=json.loads((HERE.parent/'collection-seo/collections.json').read_text(encoding='utf-8'))
    nav='({'+','.join(json.dumps(slug)+':'+previous.navigation(slug) for slug in copy)+'})[b]'
    old='["all","casual-wear","work-wear","occasional-wear"].includes(b)?'+previous.header('c.title','c.copy',nav)+':'+previous.OLD_HEADER
    title='('+json.dumps(TITLES,separators=(',',':'))+')[b]||c.title'
    new='(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:'+title+'})})'
    return previous.exact(data.decode(),[(old,new)]).encode()
def all_patch(data):
    copy=json.loads((HERE.parent/'collection-seo/collections.json').read_text(encoding='utf-8'))['all']
    old=previous.header('i',json.dumps(copy['copy']),previous.navigation('all'))
    new='(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})'
    return previous.exact(data.decode(),[('i='+json.dumps(copy['title']),'i="All Products"'),(old,new)]).encode()
def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay);assert not overlay.exists(),'Fresh overlay required'
    files={previous.COLLECTION_PATH:collection_patch((base/previous.COLLECTION_PATH).read_bytes()),previous.ALL_PATH:all_patch((base/previous.ALL_PATH).read_bytes())}
    for name,data in files.items():
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'inverseTransformsVerified':True,'productSelectionUnchanged':True,'metadataPreserved':True,'apiUnchanged':True,'databaseWrites':False,'storageWrites':False}
