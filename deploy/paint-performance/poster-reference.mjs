import {createHash} from 'node:crypto';
// Inline delivery must use the same verified immutable bytes as external delivery.
export function inlinePosterPath(value,mirror){
 if(typeof value!=='string'||value.length>262144||!/^data:image\/avif;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return null;
 const encoded=value.split(',')[1],bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)return null;
 const sha=createHash('sha256').update(bytes).digest('hex'),path='/media-performance/assets/poster-'+sha.slice(0,16)+'.avif';
 return mirror?.files?.[path]===sha?path:null;
}
