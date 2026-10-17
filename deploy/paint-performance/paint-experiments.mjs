// Read-only fixture transformations. These are never copied into the web image.
export function transformPaintExperiment(html,variant,mirror){
 if(!['control','poster-origin','poster-first','poster-origin-first'].includes(variant))throw Error('Unknown diagnostic variant');
 if(variant==='control')return html;
 if(variant.startsWith('poster-origin')){
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
  const boot='<script data-hidi-diagnostic-boot="true">(()=>{const original=document.querySelector("script[data-hidi-queued-src]");let started=false;const start=()=>{if(started)return;started=true;const script=document.createElement("script");for(const attribute of original.attributes)if(!["type","data-hidi-queued-src"].includes(attribute.name))script.setAttribute(attribute.name,attribute.value);script.type="module";script.src=original.dataset.hidiQueuedSrc;document.head.append(script);};Promise.resolve(window.__HidiNativePosterReady).then(start,start);setTimeout(start,1200);})();</script>';
  html=html.replace('</body>',boot+'</body>');
 }
 return html;
}
