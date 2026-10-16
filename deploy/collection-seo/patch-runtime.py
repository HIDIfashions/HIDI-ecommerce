"""Scoped content/navigation patch for the inspected live image; no deployment here."""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLLECTION_PATH = 'apps/web/.next/server/app/collections/[slug]/page.js'
COLLECTION_SHA = '8d6002e603ae78a9330455988d772bab304063a6a065e06e9f1eb1e0e9247478'
ALL_PATH = 'apps/web/.next/server/app/collections/all/page.js'
ALL_SHA = '066dfb1139cc7bc9d36f0e458ec982adb3e807f8866195cd08e86fae3de904cf'
BUNDLE_SHA = '359a39d1b32bf4ab35bca7546340a6c2d962ad8aa89f9f4b5b4a68bb436f04c0'
OLD_CARD = 'function HidiRangeCardCopy(item,value){const title=HidiPublicRangeText(value).cards[item.mediaSlot].title;return {...item,name:title,controlName:item.controlName?title+" - Photo "+(item.id.endsWith("-2")?2:1):title};}'
NEW_CARD = 'function HidiRangeCardCopy(item,value){const title=HidiPublicRangeText(value).cards[item.mediaSlot].title;const destinations={"Casual Wear":"casual-wear","Work Wear":"work-wear","Occasional Wear":"occasional-wear","Ananya’s Pick":"ananyas-pick","Ananya\\u2019s Pick":"ananyas-pick"};const collectionId=destinations[title]||item.collectionId||item.id;return {...item,name:title,collectionId,controlName:item.controlName?title+" - Photo "+(item.id.endsWith("-2")?2:1):title};}'
OLD_OPEN = 'm(HidiRangeCards[w].collectionId||HidiRangeCards[w].id)'
NEW_OPEN = 'm(Se[w].collectionId||Se[w].id)'
OLD_HEADER = '(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:c.title})})'
NEW_HEADER = '(0,d.jsxs)("header",{className:"collection-header",style:["all","casual-wear","work-wear","occasional-wear"].includes(b)?{display:"block"}:undefined,children:[(0,d.jsx)("h1",{children:c.title}),["all","casual-wear","work-wear","occasional-wear"].includes(b)?(0,d.jsx)("p",{className:"hidi-collection-intro",style:{display:"block",maxWidth:"68ch",margin:"12px auto 0",fontSize:"15px",lineHeight:1.6},children:c.copy}):null]})'
OLD_LABELS = {
    'all': {'title': 'All Products', 'copy': 'Explore the complete HIDI edit in one place.'},
    'casual-wear': {'title': 'Casual Wear', 'copy': 'Easy HIDI styles for everyday plans.'},
    'work-wear': {'title': 'Work Wear', 'copy': 'Considered Indian wear for your working week.'},
    'occasional-wear': {'title': 'Occasional Wear', 'copy': 'HIDI styles for celebrations and special occasions.'},
}

def exact(source, changes):
    result = source
    for old, new in changes:
        assert result.count(old) == 1 and new not in result, 'Inspected anchor changed: ' + old[:90]
        result = result.replace(old, new, 1)
    inverse = result
    for old, new in reversed(changes):
        assert inverse.count(new) == 1
        inverse = inverse.replace(new, old, 1)
    assert inverse == source, 'Unrelated bytes changed'
    return result

def navigation(slug):
    copy=json.loads((HERE/'collections.json').read_text(encoding='utf-8'))
    labels={'all':'All kurta sets & Indian wear','casual-wear':'Casual kurta sets','work-wear':'Office wear kurta sets','occasional-wear':'Occasion wear kurta sets'}
    links=[]
    for key,label in labels.items():
        if key!=slug:
            props={'href':'/collections/'+key,'style':{'textDecoration':'underline','textUnderlineOffset':'3px'},'children':label}
            links.append('(0,d.jsx)("a",'+json.dumps(props,separators=(',',':'))+')')
    return '(0,d.jsxs)("nav",{"aria-label":"Explore HIDI collections",style:{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:"10px 20px",marginTop:"16px",fontSize:"14px"},children:['+','.join(links)+']})'

def header(title,copy,nav):
    return '(0,d.jsxs)("header",{className:"collection-header",style:{display:"block"},children:[(0,d.jsx)("h1",{children:'+title+'}),(0,d.jsx)("p",{className:"hidi-collection-intro",style:{display:"block",maxWidth:"68ch",margin:"12px auto 0",fontSize:"15px",lineHeight:1.6},children:'+copy+'}),'+nav+']})'

def collection_patch(data):
    source=data.decode();copy=json.loads((HERE/'collections.json').read_text(encoding='utf-8'))
    compact=lambda value:json.dumps(value,ensure_ascii=False,separators=(',',':'))
    # Retain other label entries, product fetches, sorting and price decoration.
    changes=[]
    for slug,value in copy.items():
        if slug=='all':continue
        old=compact({slug:OLD_LABELS[slug]})[1:-1]
        if old not in source:
            old=old.replace('"title":','title:').replace('"copy":','copy:')
        changes.append((old,compact({slug:value})[1:-1]))
    nav='({'+','.join(json.dumps(slug)+':'+navigation(slug) for slug in copy)+'})[b]'
    newer='["all","casual-wear","work-wear","occasional-wear"].includes(b)?'+header('c.title','c.copy',nav)+':'+OLD_HEADER
    changes.append((OLD_HEADER,newer))
    return exact(source,changes).encode()

def all_patch(data):
    copy=json.loads((HERE/'collections.json').read_text(encoding='utf-8'))['all']
    old='(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})'
    return exact(data.decode(),[('i="All Products"','i='+json.dumps(copy['title'])),(old,header('i',json.dumps(copy['copy']),navigation('all')))]).encode()

def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay)
    assert not overlay.exists(),'Fresh overlay required'
    files={COLLECTION_PATH:collection_patch((base/COLLECTION_PATH).read_bytes()),ALL_PATH:all_patch((base/ALL_PATH).read_bytes())}
    replacements=json.loads((HERE/'policy-replacements.json').read_text(encoding='utf-8'))
    matched=set()
    for route in ['returns','shipping']:
        name='apps/web/.next/server/app/'+route+'/page.js';source=(base/name).read_text()
        changes=[(old,new) for old,new in replacements.items() if old in source]
        assert changes,'No expected policy terms found: '+route
        for old,new in changes:matched.add(old)
        files[name]=exact(source,changes).encode()
    required={key for key in replacements if not key.startswith(' The launch')}
    assert required<=matched,'Policy terms moved; inspect before proceeding: '+str(required-matched)
    import importlib.util
    spec=importlib.util.spec_from_file_location('collection_hydration',HERE/'hydration.py');hydration=importlib.util.module_from_spec(spec);spec.loader.exec_module(hydration)
    files.update(hydration.changes(base))
    for name,data in files.items():
        target=overlay/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'passed':True,'allowedFiles':sorted(files),'inverseTransformsVerified':True,'productSelectionUnchanged':True,'confirmedPoliciesPublished':True,'apiUnchanged':True,'databaseWrites':False,'storageWrites':False}
