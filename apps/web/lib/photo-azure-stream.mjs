import {stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
/** Uses the SDK's staged block upload; the complete original is never buffered. */
export async function uploadDiskPhotoToBlob(blob,photo,contentType,{signal=AbortSignal.timeout(600000)}={}){
  const source=await stat(photo.path);
  if(!source.isFile()||source.size!==photo.size||!Number.isSafeInteger(photo.size)||photo.size<1||!/^[a-f0-9]{64}$/.test(photo.sha256))throw new Error('Invalid saved photo');
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(contentType))throw new Error('Unsupported photo type');
  try{
    await blob.uploadFile(photo.path,{
      blockSize:4*1024*1024,concurrency:2,maxSingleShotSize:8*1024*1024,
      conditions:{ifNoneMatch:'*'},abortSignal:signal,
      metadata:{hidi_source_sha256:photo.sha256},
      blobHTTPHeaders:{blobContentType:contentType,blobCacheControl:'public, max-age=31536000, immutable'},
    });
  }catch(error){
    if(!/^products\/variants\/[a-z0-9_-]+\/batch-[a-f0-9]{64}\.(?:jpg|png|webp|avif)$/.test(blob.name)||![409,412].includes(error?.statusCode))throw error;
    const saved=await blob.getProperties({abortSignal:signal});
    if(saved.contentLength!==photo.size||saved.contentType!==contentType)throw new Error('Saved batch image differs from this upload');
    const response=await blob.download(0,undefined,{abortSignal:signal});
    const stream=response.readableStreamBody;if(!stream)throw new Error('Saved image verification unavailable');
    let bytes=0;const hash=createHash('sha256');
    try{
      for await(const chunk of stream){bytes+=chunk.length;if(bytes>photo.size)throw new Error('Saved batch image differs from this upload');hash.update(chunk);}
    }finally{stream.destroy?.();}
    if(bytes!==photo.size||hash.digest('hex')!==photo.sha256)throw new Error('Saved batch image differs from this upload');
  }
}
