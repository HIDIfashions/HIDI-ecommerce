/** Real Azure end-to-end derivative validation. Runs only in a temporary Container Apps Job. */
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {uploadDiskPhotoToBlob} from '../../apps/web/lib/photo-azure-stream.mjs';
import {persistProductDerivatives} from '../../apps/web/lib/product-image-derivative-store.mjs';
import {PERSISTENT_DERIVATIVE_WIDTHS,persistentDerivativeBlobKey} from '../collection-speed/images.mjs';

const require=createRequire(import.meta.url);
const sharp=require('sharp');
const {BlobServiceClient}=require('@azure/storage-blob');
const {DefaultAzureCredential}=require('@azure/identity');

const run=process.env.HIDI_PHOTO_VALIDATION_RUN;
const account=process.env.AZURE_STORAGE_ACCOUNT;
if(!/^\d+-\d+$/.test(run||'')||!/^[a-z0-9]{3,24}$/.test(account||''))throw Error('Explicit isolated validation identity required');

const dir=join(tmpdir(),'hidi-derivative-check-'+randomUUID());
await mkdir(dir,{mode:0o700});
const suffix=randomUUID();
const originalKey='products/validation/photo-stream-'+run+'-'+suffix+'.png';
const derivativeKeys=PERSISTENT_DERIVATIVE_WIDTHS.map(width=>{
  const key=persistentDerivativeBlobKey(originalKey,width,'webp');
  if(!key)throw Error('Derivative validation key could not be created');
  return {width,key};
});
const container=new BlobServiceClient('https://'+account+'.blob.core.windows.net',new DefaultAzureCredential()).getContainerClient('product-media');
const original=container.getBlockBlobClient(originalKey);
const report={
  run,passed:false,kind:'real Azure original + persisted derivative upload/download/delete; no catalogue metadata',
  databaseWrites:0,sourceBytes:0,derivativeCount:0,derivativeBytes:0,deleted:false,originalUnchanged:false,
};
let sourceSha='',sourceEtag='',originalWritten=false;
try{
  let seed=190715;
  const pixels=Buffer.alloc(3000*5000*3);
  for(let i=0;i<pixels.length;i++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;pixels[i]=seed>>>24;}
  const input=await sharp(pixels,{raw:{width:3000,height:5000,channels:3}}).png({compressionLevel:0}).toBuffer();
  if(input.length<40*1024*1024)throw Error('Validation original must exceed 40 MiB');
  const file=join(dir,'original.png');
  await writeFile(file,input);
  sourceSha=createHash('sha256').update(input).digest('hex');
  const photo={path:file,size:input.length,sha256:sourceSha};
  report.sourceBytes=photo.size;

  await uploadDiskPhotoToBlob(original,photo,'image/png');
  originalWritten=true;
  const originalProperties=await original.getProperties();
  sourceEtag=originalProperties.etag||'';
  if(originalProperties.contentLength!==photo.size||originalProperties.contentType!=='image/png')throw Error('Stored original properties differ');

  const sourceDownload=await original.download();
  const sourceHash=createHash('sha256');let sourceBytes=0;
  for await(const chunk of sourceDownload.readableStreamBody){sourceBytes+=chunk.length;sourceHash.update(chunk);}
  if(sourceBytes!==photo.size||sourceHash.digest('hex')!==sourceSha)throw Error('Stored original hash differs');
  report.originalUnchanged=true;

  const persisted=await persistProductDerivatives(container,originalKey,photo);
  if(persisted.length!==PERSISTENT_DERIVATIVE_WIDTHS.length)throw Error('Unexpected derivative count');
  let derivativeBytes=0;
  for(const {width,key} of derivativeKeys){
    const blob=container.getBlockBlobClient(key);
    const properties=await blob.getProperties();
    const metadata=properties.metadata||{};
    if(properties.contentType!=='image/webp'||metadata.hidi_source_sha256!==sourceSha||
       metadata.hidi_derivative_version!=='v1'||metadata.hidi_width!==String(width)||
       metadata.hidi_format!=='webp'||!/^[a-f0-9]{64}$/.test(metadata.hidi_derivative_sha256||'')){
      throw Error('Persisted derivative metadata differs for '+width);
    }
    const response=await blob.download();
    const chunks=[];let bytes=0;const digest=createHash('sha256');
    for await(const chunk of response.readableStreamBody){chunks.push(chunk);bytes+=chunk.length;digest.update(chunk);}
    if(!bytes||digest.digest('hex')!==metadata.hidi_derivative_sha256)throw Error('Persisted derivative bytes differ for '+width);
    const image=await sharp(Buffer.concat(chunks,bytes)).metadata();
    if(image.format!=='webp'||image.width!==width||!image.height)throw Error('Persisted derivative dimensions differ for '+width);
    derivativeBytes+=bytes;
  }
  report.derivativeCount=derivativeKeys.length;
  report.derivativeBytes=derivativeBytes;
  report.passed=true;
}catch(error){
  report.error=String(error?.message||error);
  process.exitCode=1;
}finally{
  let cleanupOk=true;
  for(const {key} of derivativeKeys){
    try{await container.getBlockBlobClient(key).deleteIfExists({deleteSnapshots:'include'});}catch{cleanupOk=false;}
  }
  if(originalWritten){
    try{await original.deleteIfExists({deleteSnapshots:'include',conditions:sourceEtag?{ifMatch:sourceEtag}:undefined});}catch{cleanupOk=false;}
  }
  for(const {key} of derivativeKeys){
    try{await container.getBlockBlobClient(key).getProperties();cleanupOk=false;}catch(error){if(error?.statusCode!==404)cleanupOk=false;}
  }
  if(originalWritten){
    try{await original.getProperties();cleanupOk=false;}catch(error){if(error?.statusCode!==404)cleanupOk=false;}
  }
  report.deleted=cleanupOk;
  if(!cleanupOk){report.passed=false;report.error='Validation photo family cleanup could not be verified';process.exitCode=1;}
  await rm(dir,{recursive:true,force:true});
  console.log('HIDI_PHOTO_STORAGE_RESULT '+JSON.stringify(report));
}
