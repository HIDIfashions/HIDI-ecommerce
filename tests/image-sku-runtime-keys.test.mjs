import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.env.HIDI_CANDIDATE_RUNTIME||'evidence/image-sku/local-overlay';
const source=readFileSync(join(root,'apps/web/.next/server/app/api/admin/inventory/[variantId]/images/route.js'),'utf8');
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
const storage=source.match(/let (?<blob>\w+)=(?<container>\w+)\(\)\.getBlockBlobClient\((?<key>\w+)\);try\{await \k<blob>\.uploadData\((?<bytes>\w+),\{conditions:\{ifNoneMatch:"\*"\},blobHTTPHeaders:\{blobContentType:(?<mime>\w+),/);
assert(storage,'Retained Azure upload retry guard must be installed');
const result=source.slice(storage.index).match(/return\{url:`\$\{(?<base>\w+)\}\/\$\{\w+\}`,storagePath:`azure:\/\/product-media\/\$\{\w+\}`\}/);
assert(result,'Retained Azure upload result must remain unchanged');
const storageBlock=source.slice(storage.index,storage.index+result.index+result[0].length);
const upload=new AsyncFunction(storage.groups.key,storage.groups.bytes,storage.groups.mime,result.groups.base,storage.groups.container,storageBlock);
function blobFixture({status=412,bytes=Buffer.from('original'),type='image/jpeg',length=bytes.length}={}){
  const calls={writes:0,properties:0,reads:0};
  const blob={uploadData:async(body,options)=>{calls.writes++;assert.equal(options.conditions.ifNoneMatch,'*');if(status)throw Object.assign(new Error('Upload conflict'),{statusCode:status});},getProperties:async()=>{calls.properties++;return {contentLength:length,contentType:type};},downloadToBuffer:async(offset,count)=>{calls.reads++;assert.equal(offset,0);assert.equal(count,Buffer.byteLength('original'));return bytes;}};
  return {calls,container:()=>({getBlockBlobClient:()=>blob})};
}
const batchPath='products/variants/v1/batch-'+hash('key')+'.jpg';
test('actual retained helper recovers a stored batch file only after checking its exact bytes',async()=>{
  for(const status of [409,412]){const fixture=blobFixture({status});const saved=await upload(batchPath,Buffer.from('original'),'image/jpeg','https://hidi.test/media',fixture.container);assert.equal(saved.url,'https://hidi.test/media/'+batchPath);assert.equal(saved.storagePath,'azure://product-media/'+batchPath);assert.deepEqual(fixture.calls,{writes:1,properties:1,reads:1});}
  const fresh=blobFixture({status:0});await upload(batchPath,Buffer.from('original'),'image/jpeg','https://hidi.test/media',fresh.container);assert.deepEqual(fresh.calls,{writes:1,properties:0,reads:0});
});
test('actual retained helper never overwrites conflicting files or bypasses legacy and permission failures',async()=>{
  for(const options of [{bytes:Buffer.from('replaced')},{type:'image/webp'},{length:1}]){const fixture=blobFixture(options);await assert.rejects(upload(batchPath,Buffer.from('original'),'image/jpeg','https://hidi.test/media',fixture.container),/differs/);assert.equal(fixture.calls.writes,1);}
  for(const [path,status] of [['products/variants/v1/random.jpg',412],[batchPath,403]]){const fixture=blobFixture({status});await assert.rejects(upload(path,Buffer.from('original'),'image/jpeg','https://hidi.test/media',fixture.container),/Upload conflict/);assert.equal(fixture.calls.properties,0);assert.equal(fixture.calls.reads,0);}
});
