import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {parseWorkbook,parseDelimited,batchPayload,creationId,duplicateTargets,identityConflict}=await import(pathToFileURL(resolve(process.argv[2],'admin-tools/product-batch.mjs')));
const parse=text=>parseWorkbook([{name:'Products',rows:parseDelimited(text)}],'NEW').entries;
const row=parse('product_name,color,sizes,selling_price,mrp\nCrème Floral Kurta,Cream,L,1999,2999')[0];
for(const slug of ['',undefined,'MixedCase','bad slug','KUR_001','https://example.com/kurta','double--hyphen','x'.repeat(101),'hidi-internal-deleted-test']){
 const body=batchPayload({...row,slug});assert.equal(body.slug,'creme-floral-kurta');assert.equal(await creationId(body),await creationId(batchPayload({...row,slug})));
}
assert.equal(batchPayload({...row,slug:'custom-kurta'}).slug,'custom-kurta');
for(const name of ['कुर्ता','పట్టు చీర','✨','Long Kurta '.repeat(14),'HIDI Internal Deleted Kurta']){
 const item={...row,fields:{...row.fields,name}},body=batchPayload(item);assert.match(body.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert(body.slug.length<=100);assert(!body.slug.startsWith('hidi-internal-deleted-'));assert.equal(body.slug,batchPayload(item).slug);
}
const rows=[row,{...row,slug:'BAD VALUE'}];assert.equal(duplicateTargets(rows,rows.map(r=>batchPayload(r))).size,2);
const record={id:'one',name:'Existing',slug:'existing',collections:[]},update={...row,mode:'UPDATE',record,id:'one',slug:'INVALID'};
assert(identityConflict(update,record));assert.equal(batchPayload(update).slug,undefined);
console.log('PASS: exact candidate slug generation, custom slugs, duplicate guards, updates and stable retry identities');
