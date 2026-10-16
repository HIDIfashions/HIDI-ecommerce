import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const copy=JSON.parse(readFileSync(new URL('./collections.json',import.meta.url),'utf8'));
const patch=readFileSync(new URL('./patch-runtime.py',import.meta.url),'utf8');
const card=patch.match(/^NEW_CARD = '(.*)'$/m)[1].replace(/\\\\/g,'\\');
const context={HidiPublicRangeText:value=>value};
runInNewContext(card+';this.card=HidiRangeCardCopy',context);

test('each saved caption resolves to its matching collection for native and ordinary clicks',()=>{
  const titles=['Occasional Wear','Ananya’s Pick','Ananya’s Pick','Work Wear','Casual Wear'];
  const expected=['occasional-wear','ananyas-pick','ananyas-pick','work-wear','casual-wear'];
  for(let i=0;i<titles.length;i++){
    const item={id:'slot-'+i,collectionId:'old-destination',mediaSlot:'slot-'+i,image:'keep.webp',alt:'keep'};
    const next=context.card(item,{cards:{[item.mediaSlot]:{title:titles[i]}}});
    assert.equal(next.collectionId,expected[i]);
    assert.equal(next.name,titles[i]);assert.equal(next.image,item.image);assert.equal(next.alt,item.alt);
  }
  const fallback=context.card({id:'original',mediaSlot:'custom'},{cards:{custom:{title:'Custom edit'}}});
  assert.equal(fallback.collectionId,'original');
});

test('collection copy describes existing stock without unverified promises or new categories',()=>{
  assert.deepEqual(Object.keys(copy),['all','casual-wear','work-wear','occasional-wear']);
  for(const entry of Object.values(copy)){
    assert(entry.title.length<65);assert(entry.copy.length<300);
    assert(!/Punjabi|free shipping|guaranteed|number one|\b1st\b/i.test(JSON.stringify(entry)));
    assert(/sizes/.test(entry.copy));
  }
});
