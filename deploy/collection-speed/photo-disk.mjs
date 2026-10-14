/** No business byte cap. Local free space and request cancellation remain enforced. */
import {mkdtemp,open,rm,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable,addAbortSignal} from 'node:stream';
export const PHOTO_DISK_RESERVE = 256 * 1024 * 1024;
export class PhotoDiskError extends Error {
  constructor(message,status=400){super(message);this.name='PhotoDiskError';this.status=status;}
}
export async function photoFreeBytes(directory){const s=await statfs(directory);return s.bavail*s.bsize;}
export async function photoToDisk(input,{directory=tmpdir(),signal,expectedBytes,freeBytes=photoFreeBytes,reserve=PHOTO_DISK_RESERVE}={}){
  if(expectedBytes!==undefined&&(!Number.isSafeInteger(expectedBytes)||expectedBytes<1))throw new PhotoDiskError('Invalid declared photo length.');
  if(signal?.aborted)throw new PhotoDiskError('Photo upload cancelled.',408);
  const dir=await mkdtemp(join(directory,'hidi-photo-'));let file;
  const cleanup=()=>rm(dir,{recursive:true,force:true});
  const readable=input instanceof Readable?input:Readable.from(input);
  if(signal)addAbortSignal(signal,readable);
  let count=0;const hash=createHash('sha256');
  try{
    if(await freeBytes(dir)<=reserve)throw new PhotoDiskError('Photo storage is temporarily full. Try again after space is available.',507);
    const path=join(dir,'original');file=await open(path,'wx',0o600);
    for await(const value of readable){
      const chunk=Buffer.isBuffer(value)?value:Buffer.from(value);
      if(!Number.isSafeInteger(count+chunk.length))throw new PhotoDiskError('Photo length is not representable.');
      if(await freeBytes(dir)<reserve+chunk.length)throw new PhotoDiskError('Photo storage is temporarily full. Try again after space is available.',507);
      let offset=0;while(offset<chunk.length){const w=await file.write(chunk,offset,chunk.length-offset);if(!w.bytesWritten)throw new Error('Unable to write photo');offset+=w.bytesWritten;}
      count+=chunk.length;hash.update(chunk);
    }
    if(!count)throw new PhotoDiskError('Photo is empty.');
    if(expectedBytes!==undefined&&count!==expectedBytes)throw new PhotoDiskError('Photo transfer is incomplete.');
    await file.close();file=undefined;
    return {path,size:count,sha256:hash.digest('hex'),cleanup};
  }catch(error){
    readable.destroy();await file?.close().catch(()=>{});await cleanup();
    if(error.code==='ENOSPC')throw new PhotoDiskError('Photo storage is temporarily full.',507);
    if(error.name==='AbortError'||signal?.aborted)throw new PhotoDiskError('Photo upload cancelled or timed out.',408);
    throw error;
  }
}
export async function downloadPhotoToDisk(response,{signal,...options}={}){
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const length=response.headers.get('content-length');
  if(!response.ok||!response.body||(type&&!['image/jpeg','image/png','image/webp','image/avif'].includes(type))){await response.body?.cancel().catch(()=>{});throw new PhotoDiskError('Product photo is unavailable.');}
  if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)<1)){await response.body.cancel().catch(()=>{});throw new PhotoDiskError('Invalid declared photo length.');}
  return photoToDisk(Readable.fromWeb(response.body),{...options,signal,expectedBytes:length===null?undefined:Number(length)});
}
