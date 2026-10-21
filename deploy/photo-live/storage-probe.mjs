/** Run only as a one-off validation job. Never changes catalogue or order data. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {uploadDiskPhotoToBlob} from '../../apps/web/lib/photo-azure-stream.mjs';
import {createAndUploadProductDerivatives} from '../../apps/web/lib/photo-derivatives.mjs';
import {PRODUCT_DERIVATIVE_WIDTHS,productDerivativeKey} from '../../apps/web/lib/product-image-derivatives.mjs';

const require=createRequire(import.meta.url);
const sharp=require('sharp');
const {BlobServiceClient}=require('@azure/storage-blob');
const {DefaultAzureCredential}=require('@azure/identity');
const run=process.env.HIDI_PHOTO_VALIDATION_RUN;
if(!/^\d+-\d+$/.test(run||'')||!process.env.AZURE_STORAGE_ACCOUNT)throw Error('Explicit isolated validation identity required');

const dir=join(tmpdir(),'hidi-storage-check-'+randomUUID());
await mkdir(dir,{mode:0o700});
const client=new BlobServiceClient('https://'+process.env.AZURE_STORAGE_ACCOUNT+'.blob.core.windows.net',new DefaultAzureCredential());
const container=client.getContainerClient('product-media');
const report={
 run,passed:false,
 kind:'real Azure SDK original + persistent derivative upload/read/delete; no catalogue metadata',
 databaseWrites:0,sourceBytes:0,outputBytes:0,deleted:false,derivativesCreated:0,derivativesDeleted:false
};
let key='',blob,etag,written=false,derivativeKeys=[];

async function removeDerivative(key){
 const client=container.getBlockBlobClient(key);
 try{await client.delete();}catch(error){if(error?.statusCode!==404)throw error;}
 if(await client.exists())throw Error('Persistent derivative still exists after cleanup');
}

try{
 let seed=190715;
 const pixels=Buffer.alloc(3000*5000*3);
 for(let i=0;i<pixels.length;i++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;pixels[i]=seed>>>24;}
 const input=await sharp(pixels,{raw:{width:3000,height:5000,channels:3}}).png({compressionLevel:0}).toBuffer();
 if(input.length<40*1024*1024)throw Error('Validation original must exceed 40 MiB');
 const file=join(dir,'original.png');await writeFile(file,input);
 const sha256=createHash('sha256').update(input).digest('hex');
 const photo={path:file,size:input.length,sha256};report.sourceBytes=photo.size;
 const variant='validation-'+run+'-'+randomUUID().toLowerCase();
 key='products/variants/'+variant+'/batch-'+sha256+'.png';
 derivativeKeys=PRODUCT_DERIVATIVE_WIDTHS.map(width=>productDerivativeKey(key,width));
 if(derivativeKeys.some(value=>!value))throw Error('Validation derivative keys could not be derived');

 blob=container.getBlockBlobClient(key);
 await uploadDiskPhotoToBlob(blob,photo,'image/png');written=true;
 const properties=await blob.getProperties();etag=properties.etag;
 if(properties.contentLength!==photo.size||properties.contentType!=='image/png')throw Error('Stored original properties differ');
 const download=await blob.download(),sum=createHash('sha256');let total=0;
 for await(const chunk of download.readableStreamBody){total+=chunk.length;sum.update(chunk);}
 if(total!==photo.size||sum.digest('hex')!==sha256)throw Error('Stored original hash differs');

 const derivatives=await createAndUploadProductDerivatives(container,key,photo,{processor:sharp});
 if(derivatives.length!==PRODUCT_DERIVATIVE_WIDTHS.length)throw Error('All persistent derivative widths were not created');
 report.derivativesCreated=derivatives.length;
 for(const item of derivatives){
  const derivative=container.getBlockBlobClient(item.key);
  const props=await derivative.getProperties();
  if(props.contentType!=='image/webp'||!props.contentLength||props.contentLength>10*1024*1024)throw Error('Persistent derivative properties invalid');
  if(props.metadata?.hidi_source_sha256!==sha256||props.metadata?.hidi_derivative_width!==String(item.width)||props.metadata?.hidi_derivative_version!=='v1')throw Error('Persistent derivative metadata invalid');
  if(item.width===1200){
   const bytes=await derivative.downloadToBuffer();
   report.outputBytes=bytes.length;
   const metadata=await sharp(bytes).metadata();
   if(metadata.width!==1200||metadata.format!=='webp')throw Error('1200px persistent derivative invalid');
  }
 }
 report.originalUnchanged=true;report.passed=true;
}catch(error){
 report.error=String(error?.message||error);process.exitCode=1;
}finally{
 try{
  for(const derivativeKey of derivativeKeys.filter(Boolean))await removeDerivative(derivativeKey);
  report.derivativesDeleted=derivativeKeys.length===PRODUCT_DERIVATIVE_WIDTHS.length;
 }catch(error){
  report.passed=false;report.derivativeCleanupError=String(error?.message||error);process.exitCode=1;
 }
 if(written){
  try{
   await blob.delete({conditions:etag?{ifMatch:etag}:undefined});
   if(await blob.exists())throw Error('Original still exists after cleanup');
   report.deleted=true;
  }catch(error){
   report.passed=false;report.error='Validation photo cleanup could not be verified: '+String(error?.message||error);
   report.temporaryBlobKey=key;process.exitCode=1;
  }
 }
 await rm(dir,{recursive:true,force:true});
 console.log('HIDI_PHOTO_STORAGE_RESULT '+JSON.stringify(report));
}
