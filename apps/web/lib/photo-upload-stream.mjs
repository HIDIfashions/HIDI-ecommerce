import busboy from 'busboy';
import sharp from 'sharp';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {photoToDisk,PhotoDiskError} from '../../../deploy/collection-speed/photo-disk.mjs';
import {resizedImage} from '../../../deploy/collection-speed/images.mjs';
import {PhotoUploadError} from './product-photo-upload.mjs';
export {PhotoUploadError,acquirePhotoUploadSlot} from './product-photo-upload.mjs';
const TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif']);
/** One photo/request; bulk uploads remain sequential. No fixed photo-byte limit. */
export async function readStreamedPhotoForm(request,options={}){
  const type=request.headers.get('content-type')||'';
  const length=request.headers.get('content-length');
  if(!/^multipart\/form-data\s*;/i.test(type)||!request.body)throw new PhotoUploadError('Choose an image file.');
  if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)<1)){await request.body.cancel().catch(()=>{});throw new PhotoUploadError('Invalid photo request length.');}
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(600000)]);
  let parser;
  try{parser=busboy({headers:{'content-type':type},limits:{files:1,fields:19,parts:20,fieldSize:8192,fieldNameSize:100,headerPairs:100},highWaterMark:65536,fileHwm:65536});}
  catch{throw new PhotoUploadError('The photo upload is incomplete or malformed.');}
  const values=new Map(),jobs=[],saved=[];let count=0;
  const cleanup=async()=>{await Promise.all(saved.map(file=>file.cleanup()));};
  const fail=error=>queueMicrotask(()=>{if(!parser.destroyed)parser.destroy(error);});
  for(const event of ['filesLimit','fieldsLimit','partsLimit'])parser.on(event,()=>fail(new PhotoUploadError('Upload one photo with at most 19 detail fields.')));
  parser.on('field',(name,value,info)=>{
    if(values.has(name)||name==='file'||info.valueTruncated||info.nameTruncated){fail(new PhotoUploadError('Duplicate or oversized photo details.'));return;}
    values.set(name,value);
  });
  parser.on('file',(name,stream,info)=>{
    count++;
    if(name!=='file'||count!==1||!TYPES.has(info.mimeType)){stream.resume();fail(new PhotoUploadError('Upload one JPEG, PNG, WebP or AVIF image.'));return;}
    const task=photoToDisk(stream,{...options,signal}).then(async disk=>{
      saved.push(disk);
      try{
        const meta=await sharp(disk.path,{limitInputPixels:100000000,failOn:'warning'}).metadata();
        const actual={jpeg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif',heif:'image/avif'}[meta.format];
        if(actual!==info.mimeType||(meta.format==='heif'&&meta.compression!=='av1')||(meta.pages||1)>1)throw new Error('format');
        await resizedImage(sharp,disk.path,16,'webp',75);
      }catch{throw new PhotoUploadError('Photo cannot be decoded safely. Use a still JPEG, PNG, WebP or AVIF within 100 megapixels.');}
      values.set('file',{...disk,type:info.mimeType,name:String(info.filename||'photo').replace(/\\/g,'/').split('/').pop()});
    });
    jobs.push(task);task.catch(fail);
  });
  try{
    await pipeline(Readable.fromWeb(request.body),parser,{signal});
    await Promise.all(jobs);
    if(count!==1||!values.get('file'))throw new PhotoUploadError('Choose one non-empty image file.');
    return {get:name=>values.get(name)??null,cleanup};
  }catch(error){
    parser.destroy();await Promise.allSettled(jobs);await cleanup();
    if(error instanceof PhotoUploadError)throw error;
    if(error instanceof PhotoDiskError)throw new PhotoUploadError(error.message,error.status);
    if(signal.aborted)throw new PhotoUploadError('Photo upload cancelled or timed out.',408);
    throw new PhotoUploadError('The photo upload is incomplete or malformed.');
  }
}
