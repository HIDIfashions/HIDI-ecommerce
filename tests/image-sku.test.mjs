import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
async function photoUrl(form){const file=form.get('file'),digest=createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),key=createHash('sha256').update([form.get('imageSku'),form.get('photoNumber'),file.type,digest].join('\u0000')).digest('hex');return '/media/products/variants/source/batch-'+key+'.'+({'image/jpeg':'jpg','image/webp':'webp'})[file.type];}
import {parseImageSkuPhoto, validateImageSkuRows, prepareMappedPhotos, uploadMappedPhotoCandidate} from '../deploy/admin-tools/image-sku-client.mjs';
import {createImageSkuHandler} from '../deploy/admin-tools/image-sku-handler.mjs';
import {createImageSkuStore} from '../deploy/admin-tools/image-sku-store.mjs';
const product = () => ({id:'p1',name:'Magenta Set',slug:'magenta-set',status:'DRAFT',updatedAt:'2026-10-10T00:00:00.000Z',variants:['M','L','XL','XXL'].map(size=>({id:'v'+size,color:'Magenta',size,active:true,images:[]}))});
const binding = {imageSku:'KUR_001',productId:'p1',productSlug:'magenta-set',color:'Magenta'};
const row = extra => ({mode:'NEW',productSlug:'magenta-set',color:'Magenta',imageSku:'KUR_001',errors:[],...extra});
const candidate = name => ({file:new File(['bytes'],name,{type:name.toLowerCase().endsWith('.webp')?'image/webp':'image/jpeg'}),sourceName:name,variantId:null,sku:null,error:'Unknown SKU'});
const api = data => async path => path.includes('product-image-skus') ? {bindings:[binding]} : data;
test('filename parsing keeps underscores in Image SKU and handles uppercase extensions',()=>{
  assert.deepEqual(parseImageSkuPhoto('folder/KUR_001_1.JPEG'),{imageSku:'KUR_001',sequence:1,mime:'image/jpeg',isMain:true});
  assert.equal(parseImageSkuPhoto('KUR_001_0002.WEBP').sequence,2); assert.equal(parseImageSkuPhoto('KUR_001_3.jpeg').imageSku,'KUR_001');
});
test('shared codes are valid across sizes; missing code in another size inherits the same colour code',()=>{
  const rows=validateImageSkuRows([row({size:'M'}),row({size:'L',imageSku:''})]);assert(rows.every(row=>!row.errors.length));assert.equal(rows[1].imageSku,'KUR_001');
});
test('codes cannot cross products or colours, or disagree across one colour size matrix',()=>{
  for(const other of [row({productSlug:'another'}),row({color:'Blue'}),row({imageSku:'KUR_002'})])assert(validateImageSkuRows([row({}),other]).some(row=>row.errors.length));
  assert(validateImageSkuRows([row({imageSku:'../KUR_001'})])[0].errors.length);
});
test('photos sort numerically, target every size, and reject duplicate JPEG/WebP photo numbers',async()=>{
  const output=await prepareMappedPhotos(['KUR_001_10.JPEG','KUR_001_2.WEBP','KUR_001_1.JPEG'].map(candidate),api(product()));
  assert.deepEqual(output.map(row=>row.sequence),[1,2,10]);assert.equal(output[0].targetVariantIds.length,4);assert(output.every(row=>!row.error));
  const duplicates=await prepareMappedPhotos(['KUR_001_1.JPEG','KUR_001_1.WEBP'].map(candidate),api(product()));assert(duplicates.every(row=>/Duplicate photo number/.test(row.error)));
});
test('unknown codes, zero photo numbers, incorrect types, oversized photos and archived products stay blocked',async()=>{
  const zero=await prepareMappedPhotos([candidate('KUR_001_0.JPEG')],api(product()));assert.match(zero[0].error,/Photo number/);
  const unknown=await prepareMappedPhotos([candidate('KUR_002_1.JPEG')],api(product()));assert.match(unknown[0].error,/No saved/);
  const wrong=candidate('KUR_001_1.JPEG');wrong.file=new File(['bytes'],wrong.sourceName,{type:'image/png'});assert.match((await prepareMappedPhotos([wrong],api(product())))[0].error,/type/);
  const large=candidate('KUR_001_1.JPEG');large.file={size:12*1024*1024+1,type:'image/jpeg'};assert.match((await prepareMappedPhotos([large],api(product())))[0].error,/12 MB/);
  assert.match((await prepareMappedPhotos([candidate('KUR_001_1.JPEG')],api({...product(),status:'ARCHIVED'})))[0].error,/archived/);
});
test('existing HIDI SKU photos keep their original matching path',async()=>{
  const legacy={...candidate('HIDI-EXISTING_01.jpeg'),variantId:'legacy',sku:'HIDI-EXISTING',error:null};
  assert.deepEqual(await prepareMappedPhotos([legacy],()=>{throw Error('Unexpected registry read');}),[legacy]);
});
test('lost successful uploads are confirmed across sizes and are not sent twice',async()=>{
  const data=product(),[item]=await prepareMappedPhotos([candidate('KUR_001_1.JPEG')],api(data));let writes=0;const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{writes++;assert.equal(options.body.get('applyToColor'),'true');const alt=options.body.get('alt'),imageUrl=await photoUrl(options.body);assert(!alt.includes('sha256'));for(const variant of data.variants)variant.images.push({id:'photo-'+variant.id,url:imageUrl,alt});return new Response(JSON.stringify({message:'Lost successful response'}),{status:500});};
  try{await uploadMappedPhotoCandidate(item,api(data));await uploadMappedPhotoCandidate(item,api(data));assert.equal(writes,1);
    const [again]=await prepareMappedPhotos([candidate('KUR_001_1.JPEG')],api(data));assert.equal((await uploadMappedPhotoCandidate(again,api(data))).skipped,true);assert.equal(writes,1);
  }finally{globalThis.fetch=original;}
});
test('an unconfirmed upload is not blindly retried',async()=>{
  const data=product(),[item]=await prepareMappedPhotos([candidate('KUR_001_2.JPEG')],api(data));let writes=0;const original=globalThis.fetch;
  globalThis.fetch=async()=>{writes++;return new Response('{}',{status:500});};
  try{await assert.rejects(uploadMappedPhotoCandidate(item,api(data)),/Check the product photos/);await assert.rejects(uploadMappedPhotoCandidate(item,api(data)),/previous upload/);assert.equal(writes,1);}finally{globalThis.fetch=original;}
});
function harness({role='OWNER',bindings=[],onWrite}={}){
  let saved=structuredClone(bindings),writes=0,etag=1;const data=product();
  const handler=createImageSkuHandler({hasStorefront:true,env:{},apiCall:async({path})=>path==='me'?{admin:{role}}:data,storage:{read:async()=>({bindings:structuredClone(saved),etag:String(etag)}),write:async(values,expected)=>{writes++;if(onWrite)await onWrite({saved,values,writes});assert.equal(expected,String(etag));saved=structuredClone(values);etag++;}}});
  return {data,get saved(){return saved;},get writes(){return writes;},call:async(method,path,body,headers={})=>{const request=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);request.method=method;request.headers={host:'hidi.test',origin:'https://hidi.test',cookie:'hidi_admin_access=fixture','content-type':'application/json',...headers};let status,result;
    const response={writeHead:code=>status=code,end:value=>result=JSON.parse(value)};await handler(request,response,path);return {status,result};}};
}
const endpoint='/api/hidi/product-image-skus';const payload={imageSku:'KUR_001',productId:'p1',color:'Magenta',expectedUpdatedAt:'2026-10-10T00:00:00.000Z'};
test('mapping persists, repeated size registrations are idempotent, and existing mappings cannot be reassigned',async()=>{
  const h=harness();assert.equal((await h.call('POST',endpoint,payload)).status,200);assert.equal((await h.call('POST',endpoint,payload)).result.alreadySaved,true);assert.equal(h.writes,1);assert.deepEqual(h.saved,[binding]);
  const conflict=harness({bindings:[{...binding,productId:'another'}]});assert.equal((await conflict.call('POST',endpoint,payload)).status,409);assert.equal(conflict.writes,0);
});
test('preflight rejects collisions without saving mappings or products',async()=>{
  const h=harness({bindings:[binding]});const response=await h.call('POST',endpoint+'/preflight',{bindings:[{imageSku:'KUR_001',productSlug:'other',color:'Magenta'}]});assert.equal(response.status,409);assert.equal(h.writes,0);
});
test('read-only staff, cross-origin writes, missing staff cookies, changed product versions and arbitrary fields are rejected',async()=>{
  assert.equal((await harness({role:'SUPPORT'}).call('POST',endpoint,payload)).status,403);
  assert.equal((await harness().call('POST',endpoint,payload,{origin:'https://other.test'})).status,403);
  assert.equal((await harness().call('GET',endpoint,null,{cookie:''})).status,401);
  assert.equal((await harness().call('POST',endpoint,{...payload,expectedUpdatedAt:'old'})).status,409);
  assert.equal((await harness().call('POST',endpoint,{...payload,status:'ACTIVE'})).status,400);
});
test('concurrent registry writes retry with a fresh ETag and preserve the other mapping',async()=>{
  let saved=[],etag='one',writes=0;
  const storage={read:async()=>({bindings:structuredClone(saved),etag}),write:async(bindings,version)=>{writes++;if(writes===1){saved=[{...binding,imageSku:'KUR_002',productId:'p2'}];etag='two';throw Object.assign(new Error('Changed'),{status:409});}assert.equal(version,'two');saved=bindings;}};
  const h=createImageSkuHandler({hasStorefront:true,env:{},apiCall:async({path})=>path==='me'?{admin:{role:'OWNER'}}:product(),storage});
  const request=Readable.from([Buffer.from(JSON.stringify(payload))]);request.method='POST';request.headers={host:'hidi.test',origin:'https://hidi.test',cookie:'hidi_admin_access=fixture','content-type':'application/json'};
  let status;await h(request,{writeHead:code=>status=code,end:()=>{}},endpoint);assert.equal(status,200);assert.equal(saved.length,2);assert.equal(saved[0].imageSku,'KUR_002');
});
test('Azure store uses the fixed product container, conditional writes, and bounded validated reads',async()=>{
  const calls=[];const store=createImageSkuStore({env:{AZURE_STORAGE_ACCOUNT:'hidistore'},getToken:async()=>'fixture-token',requestFetch:async(url,options)=>{calls.push({url,options});return options.method==='GET'?new Response(JSON.stringify({version:1,bindings:[binding]}),{status:200,headers:{etag:'"one"'}}):new Response(null,{status:201});}});
  const result=await store.read();await store.write([...result.bindings],result.etag);assert.match(calls[0].url,/product-media\/admin\/product-image-skus\/v1.json$/);assert.equal(calls[1].options.headers['If-Match'],'"one"');assert.equal(calls[1].options.headers['If-None-Match'],undefined);
});
