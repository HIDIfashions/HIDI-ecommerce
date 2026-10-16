import {readFileSync,realpathSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {prepareHeaders,sendBuffer} from '../performance/delivery.mjs';
const hash=body=>createHash('sha256').update(body).digest('hex');

export function createPreparedAssetSender(manifestUrl=new URL('./asset-encodings.json',import.meta.url)){
 const entries=new Map();
 try{
  const folder=realpathSync(dirname(fileURLToPath(manifestUrl))),manifest=JSON.parse(readFileSync(manifestUrl,'utf8'));
  if(!Array.isArray(manifest.entries)||manifest.entries.length>16)throw Error('Invalid prepared assets');
  for(const entry of manifest.entries){
   if(!/^\/assets\/index-[a-f0-9]{16}\.js$/.test(entry.url))throw Error('Unexpected asset');
   const data={sha256:entry.sha256};
   for(const encoding of ['br','gzip']){
    const item=entry.encodings[encoding],file=realpathSync(resolve(folder,item.file));
    if(!file.startsWith(folder+sep))throw Error('Asset outside prepared folder');
    const bytes=readFileSync(file);if(bytes.length>2*1024*1024||hash(bytes)!==item.sha256)throw Error('Invalid encoded asset');
    const original=(encoding==='br'?brotliDecompressSync:gunzipSync)(bytes,{maxOutputLength:2*1024*1024});
    if(hash(original)!==entry.sha256)throw Error('Decoded asset changed');
    data[encoding]=bytes;
   }
   entries.set(entry.url,data);
  }
 }catch{entries.clear();}
 return (request,response,status,headers,body)=>{
  const path=new URL(request.url,'http://localhost').pathname,item=entries.get(path);
  const prepared=prepareHeaders(request,headers,status);
  const eligible=request.method==='GET'&&status===200&&!request.headers.range&&prepared.encoding
   &&!headers['set-cookie']&&!/\b(?:private|no-store)\b/i.test(headers['cache-control']||'')&&/\bimmutable\b/i.test(headers['cache-control']||'');
  if(!eligible||!item||hash(body)!==item.sha256)return sendBuffer(request,response,status,headers,body);
  const bytes=item[prepared.encoding];response.removeHeader('Content-Length');
  response.writeHead(status,{...prepared.headers,'content-length':bytes.length});response.end(bytes);
 };
}
export const sendPreparedAsset=createPreparedAssetSender();
