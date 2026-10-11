"""Five range cards over the current live image; preserve all unrelated bytes."""
from pathlib import Path
import hashlib
import importlib.util
import json
import re
import tempfile
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('media_slots',HERE.parent/'landing-media-fix/patch-runtime.py')
previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)
CARDS=json.loads((HERE/'cards.json').read_text())
SLOTS=(HERE/'admin-slots.txt').read_text()
OLD_IMAGE='imageProps:w.id==="ananyas-pick"&&a.ananya?.active&&a.ananya.items?.[0]?.type==="image"?ei({ananya:a.ananya.items[0]},"ananya",w.image,w.alt):ei(a,w.mediaSlot,w.image,w.alt)'
NEW_IMAGE='imageProps:ei(a,w.mediaSlot,w.image,w.alt)'
OLD_CLICK='m(Hr[w].id)'
NEW_CLICK='m(Hr[w].collectionId||Hr[w].id)'
def bundle(source):
    text=source.decode();match=re.search(r'const Hr=(\[.*?\]);function Xn',text)
    assert match, 'Expected retained range data anchor'
    old=json.loads(match[1]);assert [c['id'] for c in old]==['casual-wear','work-wear','occasional-wear','ananyas-pick'], 'Unexpected current range cards'
    updated=json.dumps(CARDS,ensure_ascii=True,separators=(',',':'))
    changes=[(match[1],updated),(OLD_IMAGE,NEW_IMAGE),(OLD_CLICK,NEW_CLICK),
        ('`Explore ${w.name}`','`Explore ${w.controlName||w.name}`'),
        ('`Show ${w.name}`','`Show ${w.controlName||w.name}`')]
    for before,after in changes:
        assert text.count(before)==1, 'Exactly one bounded range anchor required'
        text=text.replace(before,after)
    restored=text
    for before,after in reversed(changes):
        assert restored.count(after)==1
        restored=restored.replace(after,before)
    assert restored.encode()==source, 'Unrelated storefront bytes changed'
    return text.encode()
def admin(source):
    text=source.decode();assert text.count(previous.CURRENT_SLOTS)==1, 'Expected current Admin controls'
    changed=text.replace(previous.CURRENT_SLOTS,SLOTS)
    assert changed.replace(SLOTS,previous.CURRENT_SLOTS)==text
    return changed.encode()
def patch_runtime(base,overlay):
    base,overlay=Path(base),Path(overlay);html=(base/'dist/index.html').read_bytes()
    matches=re.findall(rb'<script type="module" crossorigin src="([^"\s]+)"></script>',html)
    assert len(matches)==1,'One retained active module required'
    reference=matches[0];name=reference.decode().removeprefix('./').removeprefix('/')
    assert re.fullmatch(r'assets/index-[A-Za-z0-9_-]+\.js',name)
    updated=bundle((base/'dist'/name).read_bytes())
    destination='assets/index-'+hashlib.sha256(updated).hexdigest()[:16]+'.js'
    newref=reference.replace(Path(name).name.encode(),Path(destination).name.encode())
    assert html.count(reference)==1
    assert not (base/'dist'/destination).exists()
    files={'dist/'+destination:updated,'dist/index.html':html.replace(reference,newref),'dist/landing-media-control.html':admin((base/'dist/landing-media-control.html').read_bytes())}
    for name,content in files.items():
        p=overlay/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content)
    return {'passed':True,'allowedFiles':sorted(files),'renamedAssets':{'dist/'+reference.decode().removeprefix('./').removeprefix('/'):'dist/'+destination},'fiveIndependentRangeSlots':True,'sameAnanyaCollectionRoute':True,'inverseTransformsVerified':True,'unrelatedRuntimeBytesPreserved':True}
def self_test():
    source=('const Hr='+json.dumps([{'id':id} for id in ['casual-wear','work-wear','occasional-wear','ananyas-pick']])+';function Xn(){}\n'+OLD_IMAGE+'\n'+OLD_CLICK+'\n`Explore ${w.name}`\n`Show ${w.name}`').encode()
    patched=bundle(source);assert NEW_CLICK.encode() in patched
    assert len(CARDS)==5 and len({c['id'] for c in CARDS})==5 and len({c['mediaSlot'] for c in CARDS})==5
    assert [c['collectionId'] for c in CARDS[-2:]]==['ananyas-pick']*2
    admin(previous.CURRENT_SLOTS.encode())
    print('PASS: five independent range photos, shared Ananya destination and exact inverse transforms')
if __name__=='__main__':self_test()
