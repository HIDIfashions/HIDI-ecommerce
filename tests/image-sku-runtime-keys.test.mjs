import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.env.HIDI_CANDIDATE_RUNTIME||'evidence/image-sku/local-overlay';
const source=readFileSync(join(root,'apps/web/.next/server/app/api/admin/inventory/[variantId]/images/route.js'),'utf8');
const prelude=source.slice(source.indexOf('let hidiUploadKey,hidiImageSku='),source.indexOf('await ',source.indexOf('].join("\\u0000"));}')+20));
// Capture the exact injected block, including its awaited digest calculation.
const end=source.indexOf('].join("\\u0000"));}',source.indexOf('let hidiUploadKey,hidiImageSku='))+' ].join("\\u0000"));}'.trimStart().length;
const block=source.slice(source.indexOf('let hidiUploadKey,hidiImageSku='),end);
const form=block.match(/String\((\w+)\.get\("imageSku"\)/)[1],file=block.match(/,(\w+)\.type,/)[1],hashName=block.match(/hidiUploadKey=(\w+)\(/)[1];
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const calculate=new AsyncFunction(form,file,hashName,block+'return hidiUploadKey;');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function key(code='KUR_001',number='1',bytes='original',type='image/jpeg'){
  const formData=new FormData();formData.set('imageSku',code);formData.set('photoNumber',number);
  return calculate(formData,new File([bytes],'photo.jpeg',{type}),hash);
}
process.env.MEDIA_STORAGE_PROVIDER='azure';
test('actual retained upload route derives stable keys from server-read file bytes',async()=>{
  assert.equal(await key(),hash(['KUR_001','1','image/jpeg',hash('original')].join('\u0000')));
  assert.equal(await key(),await key());
  for(const changed of [await key('KUR_002'),await key('KUR_001','2'),await key('KUR_001','1','changed'),await key('KUR_001','1','original','image/webp')])assert.notEqual(changed,await key());
});
test('actual retained route validates mapping fields and keeps legacy uploads optional',async()=>{
  assert.equal(await key(''),undefined);await assert.rejects(key('../bad'));await assert.rejects(key('KUR_001','0'));await assert.rejects(key('KUR_001','0001'));
  process.env.MEDIA_STORAGE_PROVIDER='other';try{await assert.rejects(key(),/Azure/);}finally{process.env.MEDIA_STORAGE_PROVIDER='azure';}
});
