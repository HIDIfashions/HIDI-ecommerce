import {photoToDisk} from '../collection-speed/photo-disk.mjs';
import {
  PERSISTENT_DERIVATIVE_WIDTHS,
  mediaPath,
  persistentDerivativeBlobKey,
} from '../collection-speed/images.mjs';
import {persistProductDerivatives} from '../../apps/web/lib/product-image-derivative-store.mjs';

const apply=process.argv.includes('--apply');
const origin=(process.env.HIDI_STOREFRONT_ORIGIN||'https://hidiindia.com').replace(/\/$/,'');
const limitArg=process.argv.find(x=>x.startsWith('--limit='));
const limit=limitArg?Number(limitArg.slice('--limit='.length)):undefined;
if(limitArg&&(!Number.isInteger(limit)||limit<1))throw new Error('Invalid --limit value');

async function json(url){
  const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok)throw new Error('HTTP '+response.status+' for '+url);
  return response.json();
}
function collectImages(product){
  return [...(product.images||[]),...(product.variants||[]).flatMap(v=>v.images||[])]
    .map(image=>mediaPath(image?.url))
    .filter(Boolean);
}
const list=await json(origin+'/api/store/products');
if(!Array.isArray(list))throw new Error('Published product list is not an array');
const sources=new Set(),external=new Set();
for(const card of list){
  if(typeof card?.slug!=='string'||!card.slug)continue;
  const product=await json(origin+'/api/store/products/'+encodeURIComponent(card.slug));
  const images=[...(product.images||[]),...(product.variants||[]).flatMap(v=>v.images||[])];
  for(const image of images){
    const value=typeof image?.url==='string'?image.url:'';
    const source=mediaPath(value);
    if(source)sources.add(source);else if(value)external.add(value);
  }
}
const selected=limit?[...sources].slice(0,limit):[...sources];
const plan=selected.map(source=>{
  const originalKey=source.slice('/media/'.length);
  return {
    source,
    originalKey,
    derivatives:PERSISTENT_DERIVATIVE_WIDTHS.map(width=>persistentDerivativeBlobKey(originalKey,width,'webp')),
  };
});
if(!apply){
  const externalHosts=[...new Set([...external].map(value=>{try{return new URL(value,origin).hostname;}catch{return 'invalid';}}))].sort();
  console.log(JSON.stringify({mode:'dry-run',origin,publishedProducts:list.length,azureMediaSources:sources.size,externalMediaReferences:external.size,externalHosts,selected:plan.length,plan},null,2));
  process.exit(0);
}
if(process.env.HIDI_ALLOW_PRODUCTION_IMAGE_BACKFILL!=='YES'){
  throw new Error('Refusing Azure writes. Set HIDI_ALLOW_PRODUCTION_IMAGE_BACKFILL=YES only for an approved backfill run.');
}
const account=(process.env.AZURE_STORAGE_ACCOUNT||'').trim();
if(!/^[a-z0-9]{3,24}$/.test(account))throw new Error('AZURE_STORAGE_ACCOUNT is not configured');
const [{DefaultAzureCredential},{BlobServiceClient}]=await Promise.all([import('@azure/identity'),import('@azure/storage-blob')]);
const service=new BlobServiceClient('https://'+account+'.blob.core.windows.net',new DefaultAzureCredential());
const container=service.getContainerClient('product-media');
const results=[];
for(const item of plan){
  const original=container.getBlobClient(item.originalKey);
  const properties=await original.getProperties();
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(properties.contentType||'')){
    throw new Error('Unsupported original content type for '+item.originalKey);
  }
  let missing=0;
  const existingSourceHashes=new Set();
  for(let index=0;index<item.derivatives.length;index++){
    const key=item.derivatives[index],width=PERSISTENT_DERIVATIVE_WIDTHS[index];
    if(!key)throw new Error('Invalid derivative key for '+item.originalKey);
    try{
      const ready=await container.getBlobClient(key).getProperties();
      const meta=ready.metadata||{};
      const valid=ready.contentType==='image/webp' &&
        Number.isInteger(ready.contentLength) && ready.contentLength>0 && ready.contentLength<=10*1024*1024 &&
        meta.hidi_derivative_version==='v1' && meta.hidi_width===String(width) && meta.hidi_format==='webp' &&
        /^[a-f0-9]{64}$/.test(meta.hidi_source_sha256||'') &&
        /^[a-f0-9]{64}$/.test(meta.hidi_derivative_sha256||'');
      if(!valid)throw new Error('Existing immutable derivative metadata is invalid for '+key);
      existingSourceHashes.add(meta.hidi_source_sha256);
    }catch(error){
      if(error?.statusCode===404)missing++;
      else throw error;
    }
  }
  if(existingSourceHashes.size>1)throw new Error('Existing derivative family has mixed source hashes for '+item.originalKey);
  const originalSourceHash=properties.metadata?.hidi_source_sha256;
  if(originalSourceHash&&existingSourceHashes.size===1&&!existingSourceHashes.has(originalSourceHash)){
    throw new Error('Existing derivative family does not match original source metadata for '+item.originalKey);
  }
  if(!missing){
    results.push({source:item.source,status:'already-ready',verifiedMetadata:true});
    continue;
  }
  const response=await original.download();
  if(!response.readableStreamBody)throw new Error('Original download stream unavailable for '+item.originalKey);
  const disk=await photoToDisk(response.readableStreamBody,{expectedBytes:properties.contentLength});
  try{
    await persistProductDerivatives(container,item.originalKey,disk);
    results.push({source:item.source,status:'generated',missingBefore:missing});
  }finally{await disk.cleanup();}
}
console.log(JSON.stringify({mode:'apply',processed:results.length,results},null,2));
