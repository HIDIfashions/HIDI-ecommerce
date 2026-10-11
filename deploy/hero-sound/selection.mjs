import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sampleId='b135682c-f693-4761-8e9c-2455135d4895';
const keepId='ccb85470-43bb-4544-a533-7f0edcf927ac';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function run(expected,owner){
  assert.equal(process.env.AZURE_STORAGE_ACCOUNT,expected);
  assert(['azure','azblob','blob'].includes(process.env.MEDIA_STORAGE_PROVIDER));
  assert(/^\d+-\d+$/.test(owner.run));
  const container=process.env.AZURE_STORAGE_CONTAINER||process.env.MEDIA_STORAGE_CONTAINER||process.env.AZURE_BLOB_CONTAINER||process.env.BLOB_CONTAINER||process.env.R2_BUCKET||'hidi-product-media-prod';
  const endpoint=new URL(process.env.AZURE_STORAGE_BLOB_ENDPOINT||`https://${expected}.blob.core.windows.net`);
  assert.equal(endpoint.protocol,'https:');assert.equal(endpoint.hostname,`${expected}.blob.core.windows.net`);
  const identity=new URL(process.env.IDENTITY_ENDPOINT||'http://169.254.169.254/metadata/identity/oauth2/token');
  identity.searchParams.set('api-version',process.env.IDENTITY_ENDPOINT?'2019-08-01':'2018-02-01');
  identity.searchParams.set('resource','https://storage.azure.com/');
  const clientId=process.env.AZURE_CLIENT_ID||process.env.MANAGED_IDENTITY_CLIENT_ID;
  if(clientId)identity.searchParams.set('client_id',clientId);
  const auth=await fetch(identity,{headers:process.env.IDENTITY_ENDPOINT?{'X-IDENTITY-HEADER':process.env.IDENTITY_HEADER||''}:{Metadata:'true'},redirect:'error',signal:AbortSignal.timeout(10000)});
  const token=await auth.json();assert(auth.ok&&typeof token.access_token==='string');
  async function blob(method,key,value,etag){
    assert(key.startsWith('brand/hero/'));
    const url=new URL(endpoint);url.pathname='/'+container+'/'+key;
    const headers={Authorization:'Bearer '+token.access_token,'x-ms-version':'2023-11-03','x-ms-date':new Date().toUTCString()};
    if(method==='PUT')Object.assign(headers,{'Content-Type':'application/json','x-ms-blob-type':'BlockBlob','x-ms-blob-cache-control':'no-store',...(etag?{'If-Match':etag}:{'If-None-Match':'*'})});
    const r=await fetch(url,{method,headers,body:value===undefined?undefined:JSON.stringify(value),redirect:'error',signal:AbortSignal.timeout(20000)});
    if(method==='GET'&&r.status===404)return {value:null,etag:null};
    assert(r.ok,'Conditional hero metadata request failed: '+r.status);
    const nextEtag=r.headers.get('etag');assert(nextEtag);
    if(method==='PUT')return {etag:nextEtag};
    const text=await r.text();assert(Buffer.byteLength(text)<=1024*1024);
    return {value:JSON.parse(text),etag:nextEtag};
  }
  const current=await blob('GET','brand/hero/current.json');
  assert(current.value?.active===true);
  const items=Array.isArray(current.value.items)?current.value.items:[current.value];
  assert(items.some(i=>i.assetId===keepId&&i.type==='video'&&i.originalName==='IMG_3757.mp4'));
  const removed=items.filter(i=>i.assetId===sampleId);
  if(!removed.length){console.log('HIDI_HERO_SELECTION::'+JSON.stringify({passed:true,alreadyRemoved:true,selectionOnly:true,sampleRemoved:true,remainingVideo:'IMG_3757.mp4',databaseWrites:false}));return;}
  assert.equal(removed.length,1);assert.equal(removed[0].originalName,'SAMPLE.mp4');
  const retained=items.filter(i=>i.assetId!==sampleId);assert(retained.length);
  const previous=await blob('GET','brand/hero/previous.json');
  const libraryBefore=await blob('GET','brand/hero/library.json');
  const backupKey='brand/hero/backups/remove-sample-'+owner.run+'.json';
  await blob('PUT',backupKey,{current:current.value,currentEtag:current.etag,previous:previous.value,previousEtag:previous.etag});
  const next={...current.value,...retained[0],items:retained,updatedAt:new Date().toISOString()};
  const previousWrite=await blob('PUT','brand/hero/previous.json',current.value,previous.etag);
  let currentWrite;
  try{currentWrite=await blob('PUT','brand/hero/current.json',next,current.etag);}
  catch(error){
    if(previous.value)await blob('PUT','brand/hero/previous.json',previous.value,previousWrite.etag).catch(()=>{});
    throw error;
  }
  const verified=await blob('GET','brand/hero/current.json');
  assert.equal(verified.etag,currentWrite.etag);assert.equal(hash(verified.value),hash(next));
  const libraryAfter=await blob('GET','brand/hero/library.json');
  assert.equal(hash(libraryAfter.value),hash(libraryBefore.value),'Hero media library changed concurrently');
  console.log('HIDI_HERO_SELECTION::'+JSON.stringify({passed:true,selectionOnly:true,sampleRemoved:true,remainingVideo:'IMG_3757.mp4',remainingItems:retained.length,backupKey,libraryPreserved:true,etagVerified:true,databaseWrites:false}));
}
