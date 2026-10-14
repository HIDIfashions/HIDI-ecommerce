/** Run only as a one-off validation job. Never changes catalogue or order data. */
import {createRequire} from 'node:module';
import {createReadStream} from 'node:fs';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {uploadDiskPhotoToBlob} from './storage.mjs';
import {resizedImage} from '../product-images/images.mjs';
const require=createRequire(import.meta.url);
const sharp=require('sharp');
const {BlobServiceClient}=require('@azure/storage-blob');
const {DefaultAzureCredential}=require('@azure/identity');
const run=process.env.HIDI_PHOTO_VALIDATION_RUN;
if(!/^\d+-\d+$/.test(run||'')||!process.env.AZURE_STORAGE_ACCOUNT)throw Error('Explicit isolated validation identity required');
const dir=join(tmpdir(),'hidi-storage-check-'+randomUUID());await mkdir(dir,{mode:0o700});
const key='products/validation/photo-stream-'+run+'-'+randomUUID()+'.png';
const client=new BlobServiceClient('https://'+process.env.AZURE_STORAGE_ACCOUNT+'.blob.core.windows.net',new DefaultAzureCredential());
const blob=client.getContainerClient('product-media').getBlockBlobClient(key);
const report={run,passed:false,kind:'real Azure SDK upload/download/delete; no catalogue metadata',databaseWrites:0,sourceBytes:0,outputBytes:0,deleted:false};let written=false,etag;
try{
 let seed=190715;const pixels=Buffer.alloc(3000*5000*3);for(let i=0;i<pixels.length;i++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;pixels[i]=seed>>>24;}
 const input=await sharp(pixels,{raw:{width:3000,height:5000,channels:3}}).png({compressionLevel:0}).toBuffer();
 if(input.length<40*1024*1024)throw Error('Validation original must exceed 40 MiB');
 const file=join(dir,'original.png');await writeFile(file,input);
 const sha256=createHash('sha256').update(input).digest('hex');
 const photo={path:file,size:input.length,sha256};report.sourceBytes=photo.size;
 await uploadDiskPhotoToBlob(blob,photo,'image/png');written=true;
 const properties=await blob.getProperties();etag=properties.etag;
 if(properties.contentLength!==photo.size)throw Error('Stored original length differs');
 const download=await blob.download(),sum=createHash('sha256');let total=0;
 for await(const chunk of download.readableStreamBody){total+=chunk.length;sum.update(chunk);}
 if(total!==photo.size||sum.digest('hex')!==sha256)throw Error('Stored original hash differs');
 const display=await resizedImage(sharp,file,1200,'webp',75);report.outputBytes=display.length;
 const metadata=await sharp(display).metadata();if(metadata.width!==1200||metadata.format!=='webp')throw Error('Display derivative invalid');
 report.originalUnchanged=true;report.passed=true;
}catch(error){report.error=String(error.message);process.exitCode=1;}
finally{
 if(written){try{await blob.delete({conditions:etag?{ifMatch:etag}:undefined});report.deleted=true;}catch{report.passed=false;report.error='Validation photo cleanup could not be verified';report.temporaryBlobKey=key;process.exitCode=1;}}
 await rm(dir,{recursive:true,force:true});
 console.log('HIDI_PHOTO_STORAGE_RESULT '+JSON.stringify(report));
}
