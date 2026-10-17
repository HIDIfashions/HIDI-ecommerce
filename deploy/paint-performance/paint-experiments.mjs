import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
// Read-only fixture transformations. These are never copied into the web image.
export function encodeExperimentResponse(original,html,acceptEncoding=''){
 const headers={...original};
 for(const key of ['content-length','transfer-encoding','content-encoding','etag','content-md5'])delete headers[key];
 let body=Buffer.from(html);
 if(acceptEncoding.includes('br')){body=brotliCompressSync(body,{params:{[constants.BROTLI_PARAM_QUALITY]:7}});headers['content-encoding']='br';}
 else if(acceptEncoding.includes('gzip')){body=gzipSync(body,{level:9});headers['content-encoding']='gzip';}
 headers['content-length']=body.length;return {headers,body};
}
export function transformPaintExperiment(html,variant,mirror){
 if(!['control','poster-origin','poster-first','poster-origin-first','external-logo','external-logo+poster-first','external-logo+poster-origin-first'].includes(variant))throw Error('Unknown diagnostic variant');
 if(variant==='control')return html;
 if(variant.includes('external-logo')){
  const logo=html.match(/<link\b[^>]*href=["'](\/media-performance\/assets\/logo-[a-f0-9]{16}\.png)["']/i)?.[1];
  if(!logo)throw Error('Exact optimized logo preload missing');
  let found=0;html=html.replace(/(<img\b[^>]*\bsrc=["'])data:image\/png;base64,[A-Za-z0-9+/=]+(["'][^>]*\balt=["']HIDI[^>]*>)/gi,(_,start,end)=>{found++;return start+logo+end;});
  if(found!==1)throw Error('Expected one embedded native logo');
 }
 if(variant.includes('poster-origin')){
  html=html.replaceAll(mirror.origin+'/media-performance/assets/poster-','/media-performance/assets/poster-');
  const anchor='const url=window.__HidiAssetUrl(path);';
  if(!html.includes(anchor))throw Error('Poster loader anchor changed');
  html=html.replace(anchor,'const url=path.endsWith(".avif")?path:window.__HidiAssetUrl(path);');
 }
 if(variant.endsWith('first')){
  html=html.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi,'');
  let found=0;
  html=html.replace(/<script\b[^>]*data-hidi-mirror-app=["'][^"']+["'][^>]*><\/script>/gi,tag=>{found++;return tag.replace(/type=["']module["']/,'type="application/x-hidi-deferred-module"').replace(/\bsrc=/,'data-hidi-queued-src=');});
  if(found!==1)throw Error('Expected exactly one mirrored application');
  const boot='<script data-hidi-diagnostic-boot="true">(()=>{const original=document.querySelector("script[data-hidi-queued-src]");let started=false;const start=()=>{if(started)return;started=true;const script=document.createElement("script");for(const attribute of original.attributes)if(!["type","data-hidi-queued-src"].includes(attribute.name))script.setAttribute(attribute.name,attribute.value);script.type="module";script.src=original.dataset.hidiQueuedSrc;document.head.append(script);};Promise.resolve(window.__HidiAvifSupport).then(()=>window.__HidiNativePosterReady).then(start,start);setTimeout(start,1200);})();</script>';
  html=html.replace('</body>',boot+'</body>');
 }
 return html;
}
