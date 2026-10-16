import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
import {createHash} from 'node:crypto';
import {prepareHeaders,sendBuffer} from '../performance/delivery.mjs';
const encoded=new Map();
export function sendCachedHome(request,response,status,headers,body){
 const prepared=prepareHeaders(request,headers,status);
 if(!prepared.encoding||headers['set-cookie']||/\b(?:private|no-store)\b/i.test(headers['cache-control']||''))return sendBuffer(request,response,status,headers,body);
 const key=createHash('sha256').update(body).digest('hex')+':'+prepared.encoding;
 let bytes=encoded.get(key);
 if(!bytes){
  bytes=prepared.encoding==='br'?brotliCompressSync(body,{params:{[constants.BROTLI_PARAM_QUALITY]:7}}):gzipSync(body,{level:9});
  if(encoded.size>=8)encoded.delete(encoded.keys().next().value);
  encoded.set(key,bytes);
 }
 response.removeHeader('Content-Length');
 response.writeHead(status,{...prepared.headers,'content-length':bytes.length});
 response.end(bytes);
}
