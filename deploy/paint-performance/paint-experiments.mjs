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
export function transformPaintExperiment(html,variant,mirror,options={}){
 if(variant==='native-image'){
  let count=0;html=html.replace(/<video\b([^>]*data-hidi-first-hero="true"[^>]*)><\/video>/g,(_,attrs)=>{count++;return '<img'+attrs.replace(/\s(?:loop|playsinline)\b/g,'').replace(/\spreload="[^"]*"/g,'')+' alt="" decoding="async">';});
  if(count!==1)throw Error('Expected one native hero element');
  html=html.replaceAll('video[data-hidi-first-hero]','[data-hidi-first-hero]').replaceAll("document.querySelector('video.hero-live-media')","document.querySelector('.hero-live-media')");
  const anchor='video.poster=window.__HidiMirrorPoster?.(poster)||poster;';if(!html.includes(anchor))throw Error('Native poster setup changed');
  return html.replace(anchor,anchor+'video.src=video.poster;');
 }
 if(variant==='desktop-preview'){
  if(options.isMobile)return html;
  const url=options.desktopPreview;if(typeof url!=='string'||!url.startsWith('data:image/avif;base64,')||url.length>2048)throw Error('Bounded verified desktop preview required');
  return html.replace('</head>','<style data-hidi-preview-experiment="true">@media(min-width:701px){video[data-hidi-first-hero]{background-image:url("'+url+'");background-size:cover;background-position:var(--hero-position-desktop,50% 50%);}}</style></head>');
 }
 if(['inline-mobile','inline-mobile-aux','inline-both'].includes(variant)){
  html=transformPaintExperiment(html,variant==='inline-mobile-aux'?'aux-after-poster':'mobile-poster-origin',mirror);
  if(!options.isMobile&&variant!=='inline-both')return html;
  const row=!options.isMobile&&variant==='inline-both'?options.desktopInlinePoster:options.inlinePoster;if(!row||!Object.hasOwn(mirror.files,row.path)||!row.url.startsWith('data:image/avif;base64,'))throw Error('Verified inline poster required');
  const anchor='const url=matchMedia("(max-width: 700px)").matches?path:window.__HidiAssetUrl(path);';
  if(!html.includes(anchor))throw Error('Origin poster anchor changed');
  html=html.replaceAll('href="'+row.path+'"','href="'+row.url+'"').replaceAll('href="'+mirror.origin+row.path+'"','href="'+row.url+'"');
  return html.replace(anchor,'const inline='+JSON.stringify(row)+';const url=path===inline.path?inline.url:matchMedia("(max-width: 700px)").matches?path:window.__HidiAssetUrl(path);');
 }
 if(['desktop-poster-first','aux-after-poster'].includes(variant)){
  html=transformPaintExperiment(html,'mobile-poster-origin',mirror);
  let count=0;html=html.replace(/<script data-hidi-desktop-preload="true">[\s\S]*?<\/script>/g,()=>{count++;return '';});
  const early="if(!matchMedia('(max-width: 700px)').matches||!document.querySelector('video[data-hidi-first-hero]'))";
  if(count!==1||!html.includes(early))throw Error('Desktop scheduling anchors changed');
  html=html.replace(early,"if(!document.querySelector('video[data-hidi-first-hero]'))");
  if(variant==='aux-after-poster'){
   const reviewed=new Set(['/app-coming-soon-c471a1b693c0383d.js','/hidi-launch-countdown-20261011.js','/hidi-analytics.js','/performance/rum.js','/offers-assets/admin-link.js','/offers-assets/storefront.js','/privacy-policy-assets/links.js']);
   let scripts=0;html=html.replace(/<script\b[^>]*\bdefer\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g,tag=>{const src=tag.match(/\bsrc="([^"]+)"/)[1];if(!reviewed.has(new URL(src,'https://hidiindia.com').pathname))return tag;scripts++;return tag.replace(' src=',' data-hidi-aux-src=').replace('<script ','<script type="application/x-hidi-queued-aux" ');});
   if(scripts!==7)throw Error('Expected exactly seven reviewed classic scripts, got '+scripts);
   const boot=`<script data-hidi-aux-start="true">(()=>{let started=false;const start=()=>{if(started)return;started=true;for(const original of document.querySelectorAll('script[data-hidi-aux-src]')){const script=document.createElement('script');for(const attribute of original.attributes)if(!['type','data-hidi-aux-src'].includes(attribute.name))script.setAttribute(attribute.name,attribute.value);script.async=false;script.src=original.dataset.hidiAuxSrc;document.head.append(script);}};Promise.resolve(window.__HidiAvifSupport).then(()=>window.__HidiNativePosterReady).then(start,start);setTimeout(start,1200);})();</script>`;
   html=html.replace('</body>',boot+'</body>');
  }
  return html;
 }
 if(!['control','warm-poster','mobile-poster-origin','poster-origin','poster-first','poster-origin-first','external-logo','external-logo+poster-first','external-logo+poster-origin-first'].includes(variant))throw Error('Unknown diagnostic variant');
 if(variant==='control')return html;
 if(variant==='warm-poster'){
  const hint='<link rel="preconnect" href="'+mirror.origin+'" crossorigin>';
  if(!html.includes(hint))throw Error('Expected anonymous module preconnect');
  return html.replace(hint,'<link rel="preconnect" href="'+mirror.origin+'">'+hint);
 }
 if(variant==='mobile-poster-origin'){
  html=html.replace(/<link\b[^>]*type="image\/avif"[^>]*>/gi,tag=>tag.includes('media="(min-width: 701px)"')?tag:tag.replace(mirror.origin+'/media-performance/assets/poster-','/media-performance/assets/poster-'));
  const anchor='const url=window.__HidiAssetUrl(path);';if(!html.includes(anchor))throw Error('Poster loader anchor changed');
  return html.replace(anchor,'const url=matchMedia("(max-width: 700px)").matches?path:window.__HidiAssetUrl(path);');
 }
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
