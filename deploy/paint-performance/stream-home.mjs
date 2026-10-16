import {createBrotliCompress,createGzip,constants} from 'node:zlib';
import {prepareHeaders} from '../performance/delivery.mjs';
import {renderInitialHome} from './announcement.mjs';

// Flush only the unchanged head while fresh public data is read. The complete
// body arrives together, so neither a stale hero nor a provisional offer paints.
export async function streamInitialHome(request,response,headers,html,render=renderInitialHome){
 const match=/<\/head\s*>/i.exec(html);
 if(!match)throw Error('Homepage head missing');
 const cut=match.index+match[0].length,head=html.slice(0,cut),tail=html.slice(cut);
 const rendered=Promise.resolve().then(()=>render(tail,request)).catch(()=>tail);
 const clean={...headers,vary:[headers.vary,'Accept','User-Agent','Sec-CH-UA-Mobile','Cookie','Save-Data'].filter(Boolean).join(', ')};delete clean['content-length'];delete clean.etag;
 const prepared=prepareHeaders(request,clean,200);
 response.removeHeader('Content-Length');response.removeHeader('ETag');
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
