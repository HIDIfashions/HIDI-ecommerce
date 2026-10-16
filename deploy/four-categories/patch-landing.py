"""Replace only the verified landing's category data and category links."""
import hashlib
import json
from pathlib import Path
import re
import importlib.util

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('four_category_landing_base', HERE.parent / 'product-skn/patch-landing.py')
baseline = importlib.util.module_from_spec(spec); spec.loader.exec_module(baseline)
CATEGORIES = [('casual-wear', 'Casual Wear'), ('work-wear', 'Work Wear'),
              ('occasional-wear', 'Occasional Wear'), ('ananyas-pick', 'Ananya’s Pick')]

def patch_bundle(content):
    assert hashlib.sha256(content).hexdigest() == baseline.BASE_SHA256, 'Fresh landing differs from the reviewed baseline'
    text = content.decode()
    changes = []
    def change(old, new, label):
        nonlocal text
        assert text.count(old) == 1, 'Expected one exact landing category anchor: ' + label
        text = text.replace(old, new); changes.append((old, new, label))
    route = 'const rc=Object.freeze({occasion:"/collections/occasion","new-arrivals":"/collections/new-arrivals","work-edit":"/collections/work-edit",everyday:"/collections/everyday"});'
    route_after = 'const rc=Object.freeze(' + json.dumps({slug:'/collections/' + slug for slug, _ in CATEGORIES}, ensure_ascii=True, separators=(',', ':')) + ');'
    change(route, route_after, 'fourRoutes')
    match = re.search(r'const Hr=(\[\{id:"occasion",name:"Occasion".*?\}\]);function Xn', text)
    assert match, 'Expected retained carousel category data'
    items = [
        {'id':'casual-wear','name':'Casual Wear','description':'For your everyday kind of lovely','image':'images/burgundy-set.webp','alt':'Burgundy kurta and trouser set with a matching dupatta','mediaSlot':'range-everyday'},
        {'id':'work-wear','name':'Work Wear','description':'From first meetings to last plans','image':'images/cream-set.webp','alt':'Cream Indian-wear set with a lightly embroidered kurta','mediaSlot':'range-work-edit'},
        {'id':'occasional-wear','name':'Occasional Wear','description':'For the moments that matter','image':'images/occasion-set.webp','alt':'Orange embellished occasion outfit with a deep teal dupatta','mediaSlot':'range-occasion'},
        {'id':'ananyas-pick','name':'Ananya’s Pick','description':'Ananya’s selected styles across all three wear categories','image':'images/ananya-top-picks/ananya-green.webp','alt':'Ananya’s Pick','mediaSlot':'ananya-green'},
    ]
    change(match[1], json.dumps(items, ensure_ascii=True, separators=(',', ':')), 'fourCarouselItems')
    change('imageProps:ei(a,`range-${w.id}`,w.image,w.alt)',
           'imageProps:w.id==="ananyas-pick"&&a.ananya?.active&&a.ananya.items?.[0]?.type==="image"?ei({ananya:a.ananya.items[0]},"ananya",w.image,w.alt):ei(a,w.mediaSlot,w.image,w.alt)', 'existingMediaSlots')
    old = 'o.jsx("h3",{children:"Collections"}),o.jsx("button",{onClick:()=>m("new-arrivals"),type:"button",children:"New Arrivals"}),o.jsx("button",{onClick:()=>m("work-edit"),type:"button",children:"Workwear Edit"}),o.jsx("button",{onClick:()=>m("everyday"),type:"button",children:"Everyday"}),o.jsx("button",{onClick:()=>m("occasion"),type:"button",children:"Occasion"}),o.jsx("button",{onClick:()=>m(),type:"button",children:"Shop All"})'
    new = 'o.jsx("h3",{children:"Collections"}),' + ','.join('o.jsx("button",{onClick:()=>m('+json.dumps(slug)+'),type:"button",children:'+json.dumps(title,ensure_ascii=True)+'})' for slug,title in CATEGORIES)
    change(old, new, 'fourFooterLinks')
    new_menu = 'o.jsxs("nav",{className:"campaign-panel-nav","aria-label":"Explore HIDI",children:[' + ','.join('o.jsxs("a",{href:'+json.dumps('/collections/'+slug)+',children:['+json.dumps(title+' ',ensure_ascii=True)+',o.jsx(ie,{name:"arrow"})]})' for slug,title in CATEGORIES) + ']})'
    change(baseline.MENU_BEFORE, new_menu, 'fourMenuLinks')
    change(baseline.CTA_BEFORE, baseline.CTA_AFTER, 'ananyaShopLink')
    restored = text
    for old,new,_ in reversed(changes): restored = restored.replace(new,old)
    assert restored == content.decode(), 'Unrelated landing changes detected'
    assert all(old not in text for old in ('children:"New Arrivals"','children:"Workwear Edit"','children:"Everyday"','children:"Occasion"','children:"Shop All"')), 'Old category remains visible'
    return text.encode(), [label for _,_,label in changes]

def patch_landing(base, overlay):
    base, overlay = Path(base), Path(overlay)
    original = (base / baseline.BASE_BUNDLE).read_bytes()
    html = (base / 'dist/index.html').read_bytes()
    reference = baseline.active_bundle_reference(html)
    updated, changes = patch_bundle(original)
    destination = 'dist/assets/index-' + hashlib.sha256(updated).hexdigest()[:16] + '.js'
    assert not (base / destination).exists(), 'Owned immutable category bundle already exists'
    after = reference.replace(Path(baseline.BASE_BUNDLE).name.encode(), Path(destination).name.encode())
    files = {destination: updated, 'dist/index.html': html.replace(reference, after)}
    for name, content in files.items():
        path = overlay / name; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(content)
    return {'passed':True, 'allowedFiles':sorted(files), 'renamedAssets':{baseline.BASE_BUNDLE:destination},
            'changes':changes, 'categories':[title for _,title in CATEGORIES], 'oldAssetsRetained':True,
            'existingMediaSlotsPreserved':True, 'unrelatedLandingCodePreserved':True}
