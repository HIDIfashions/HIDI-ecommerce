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

def collection_patch(data):
    assert hashlib.sha256(data).hexdigest() == COLLECTION_SHA, 'Live collection chunk changed; inspect again'
    copy = json.loads((HERE/'collections.json').read_text(encoding='utf-8'))
    assert set(copy) == set(OLD_LABELS)
    compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    changes = [(compact({slug: OLD_LABELS[slug]})[1:-1], compact({slug: value})[1:-1]) for slug,value in copy.items()]
    changes.append((OLD_HEADER, NEW_HEADER))
    return exact(data.decode(), changes).encode()

def bundle_patch(data):
    assert hashlib.sha256(data).hexdigest() == BUNDLE_SHA, 'Live landing bundle changed; inspect again'
    return exact(data.decode(), [(OLD_CARD, NEW_CARD), (OLD_OPEN, NEW_OPEN)]).encode()

def all_patch(data):
    assert hashlib.sha256(data).hexdigest() == ALL_SHA, 'Dedicated Shop All renderer changed; inspect again'
    copy = json.loads((HERE/'collections.json').read_text(encoding='utf-8'))['all']
    old_header = '(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})'
    new_header = '(0,d.jsxs)("header",{className:"collection-header",style:{display:"block"},children:[(0,d.jsx)("h1",{children:i}),(0,d.jsx)("p",{className:"hidi-collection-intro",style:{display:"block",maxWidth:"68ch",margin:"12px auto 0",fontSize:"15px",lineHeight:1.6},children:'+json.dumps(copy['copy'])+'})]})'
    return exact(data.decode(), [('i="All Products"','i='+json.dumps(copy['title'])),(old_header,new_header)]).encode()

def patch_runtime(base, overlay):
    base, overlay = Path(base), Path(overlay)
    assert not overlay.exists(), 'Fresh overlay directory required'
    html = (base/'dist/index.html').read_bytes()
    refs = re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>', html)
    assert len(refs) == 1
    ref = refs[0]
    name = ref.decode().removeprefix('./').removeprefix('/')
    assert re.fullmatch(r'assets/index-[A-Za-z0-9_-]+\.js', name)
    bundle = bundle_patch((base/'dist'/name).read_bytes())
    newname = 'assets/index-' + hashlib.sha256(bundle).hexdigest()[:16] + '.js'
    assert not (base/'dist'/newname).exists()
    newref = ref.replace(Path(name).name.encode(), Path(newname).name.encode())
    files = {
        COLLECTION_PATH: collection_patch((base/COLLECTION_PATH).read_bytes()),
        ALL_PATH: all_patch((base/ALL_PATH).read_bytes()),
        'dist/'+newname: bundle,
        'dist/index.html': html.replace(ref, newref, 1),
    }
    assert files['dist/index.html'].replace(newref, ref, 1) == html
    for name,data in files.items():
        target = overlay/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return {'passed': True, 'allowedFiles': sorted(files), 'inverseTransformsVerified': True,
            'collectionCopyRoutes': list(OLD_LABELS), 'oldLandingAssetRetained': True,
            'wrapperUnchanged': True, 'metadataGeneratorPreserved': True, 'stylesheetsUnchanged': True,
            'publishedMediaAndCaptionsUnchanged': True, 'apiUnchanged': True,
            'databaseWrites': False, 'storageWrites': False}
