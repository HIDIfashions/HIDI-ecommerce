import {createBrotliCompress,createGzip,constants} from 'node:zlib';
import {prepareHeaders} from '../performance/delivery.mjs';
import {renderInitialHome} from './announcement.mjs';
import {sendCachedHome} from './delivery.mjs';

// Coalesce a small, promptly rendered document into one encoded response. Slow
// public reads retain an early head and complete fresh body without placeholders.
export async function streamInitialHome(request,response,headers,html,render=renderInitialHome){
 const match=/<\/head\s*>/i.exec(html);
 if(!match)throw Error('Homepage head missing');
 const cut=match.index+match[0].length,head=html.slice(0,cut),tail=html.slice(cut);
 const rendered=Promise.resolve().then(()=>render(tail,request)).catch(()=>tail);
 const clean={...headers,vary:[headers.vary,'Accept','User-Agent','Sec-CH-UA-Mobile','Cookie','Save-Data'].filter(Boolean).join(', ')};delete clean['content-length'];delete clean.etag;
 const started=performance.now();let deadline;
 const early=await Promise.race([rendered.then(body=>({body})),new Promise(resolve=>{deadline=setTimeout(()=>resolve(null),80);})]);clearTimeout(deadline);
 response.removeHeader('Content-Length');response.removeHeader('ETag');
 if(early&&Buffer.byteLength(head+early.body)<=131072){
  clean['server-timing']=[clean['server-timing'],'home-render;dur='+(performance.now()-started).toFixed(1)+';desc="coalesced"'].filter(Boolean).join(', ');
  return sendCachedHome(request,response,200,clean,Buffer.from(head+early.body));
 }
 clean['server-timing']=[clean['server-timing'],'home-head;dur='+(performance.now()-started).toFixed(1)+';desc="streamed"'].filter(Boolean).join(', ');
 const prepared=prepareHeaders(request,clean,200);
 response.writeHead(200,prepared.headers);response.flushHeaders?.();
 const output=prepared.encoding==='br'?createBrotliCompress({params:{[constants.BROTLI_PARAM_QUALITY]:7}}):prepared.encoding==='gzip'?createGzip({level:9}):response;
 if(output!==response){output.on('error',()=>response.destroy());response.on('close',()=>output.destroy());output.pipe(response);}
 output.write(head);
 if(output!==response)output.flush(prepared.encoding==='br'?constants.BROTLI_OPERATION_FLUSH:constants.Z_SYNC_FLUSH);
 else response.flushHeaders?.();
 const body=await rendered;
 if(response.destroyed)return;
 output.end(body);
}
