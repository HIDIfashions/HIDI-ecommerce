import {readFileSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeMirror,mirrorAssetUrl} from '../paint-performance/asset-mirror.mjs';
import {normalizeStyleUrls} from '../paint-performance/style-urls.mjs';
const mirrorClient=readFileSync(new URL('../paint-performance/asset-mirror-client.js',import.meta.url),'utf8');
const appStart=readFileSync(new URL('../paint-performance/app-start.js',import.meta.url),'utf8');
const fullCssClient=readFileSync(new URL('../paint-performance/full-css-client.js',import.meta.url),'utf8');

// Inline the existing public CSS in the same cascade position. Resolve from the
// current image, so later image overlays cannot leave stale style contents.
export function createHomeHead(root,appRoot=resolve(root,'..')) {
 const cache=new Map();
 const assets=(()=>{try{return JSON.parse(readFileSync(resolve(appRoot,'paint-performance/head-assets.json'),'utf8'));}catch{return {};}})();
 const desktopPreview=(()=>{try{const value=assets.desktopPreview;return typeof value==='string'&&/^data:image\/avif;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)&&value.length<=2048?value:null;}catch{return null;}})();
 function verifiedAsset(row,pattern){try{if(!row||!pattern.test(row.url)||!row.url.includes(row.sha256.slice(0,16)))return null;const file=realpathSync(resolve(root,'.'+row.url));if(!file.startsWith(realpathSync(root)+sep))return null;const bytes=readFileSync(file);return createHash('sha256').update(bytes).digest('hex')===row.sha256?bytes:null;}catch{return null;}}
 const mirror=(()=>{try{const value=normalizeMirror(JSON.parse(readFileSync(resolve(appRoot,'paint-performance/asset-mirror.json'),'utf8')));if(!value)return null;for(const [url,sha256] of Object.entries(value.files)){const bytes=verifiedAsset({url,sha256},/^\//);if(!bytes||url.endsWith('.js')&&!bytes.toString().startsWith('if (!window.__HidiAppStarted) {'))return null;}return value;}catch{return null;}})();
 const originPosters=(()=>{try{const data=JSON.parse(readFileSync(resolve(appRoot,'paint-performance/initial-hero.json'),'utf8'));return [...new Set(Object.values(data).flatMap(item=>[item.mobile?.avifPoster,item.mobile?.avifPosterSmall]).filter(path=>path?.endsWith('.avif')&&mirror&&Object.hasOwn(mirror.files,path)))];}catch{return [];}})();
 const inlinePoster=(()=>{try{const data=JSON.parse(readFileSync(resolve(appRoot,'paint-performance/initial-hero.json'),'utf8')),variant=Object.values(data)[0]?.mobile,path=variant?.avifPosterSmall,crop=variant?.posterCrop;if(!mirror||!path||crop?.width!==512||crop?.height!==720||crop?.sourceWidth!==1280||crop?.sourceHeight!==720||!Object.hasOwn(mirror.files,path))return null;const bytes=verifiedAsset({url:path,sha256:mirror.files[path]},/^\/media-performance\/assets\/poster-[a-f0-9]{16}\.avif$/);return bytes&&bytes.length<=49152?{path,url:'data:image/avif;base64,'+bytes.toString('base64')}:null;}catch{return null;}})();
 const seoBytes=verifiedAsset(assets.seo,/^\/assets\/home-seo-[a-f0-9]{16}\.js$/);
 const countdownUrl=(()=>{try{
  const row=assets.countdown;if(!row||row.sourceFile!=='dist/hidi-launch-countdown-20261011.js'||!/^\/assets\/home-countdown-[a-f0-9]{16}\.js$/.test(row.url)||row.sourceSha256!=='9f32ea5cc3f76cff81a7b5a6537d5437b161a73dd9b6df9328e285e578ac4195')return null;
  const source=readFileSync(resolve(root,'hidi-launch-countdown-20261011.js')).toString().replace(/\r\n/g,'\n');
  if(createHash('sha256').update(source).digest('hex')!==row.sourceSha256)return null;
  return verifiedAsset(row,/^\/assets\/home-countdown-[a-f0-9]{16}\.js$/)?row.url:null;
 }catch{return null;}})();
 const criticalStyles=(()=>{try{return JSON.parse(readFileSync(resolve(appRoot,'paint-performance/critical-css.json'),'utf8')).styles||{};}catch{return {};}})();
 const styleAssets=(()=>{try{return JSON.parse(readFileSync(resolve(appRoot,'paint-performance/style-assets.json'),'utf8')).styles||{};}catch{return {};}})();
 const iconMarkup=(()=>{try{const data=JSON.parse(readFileSync(resolve(appRoot,'paint-performance/icons.json'),'utf8'));const source=realpathSync(resolve(appRoot,data.sourceFile));if(!source.startsWith(realpathSync(appRoot)+sep))return null;const hash=createHash('sha256').update(readFileSync(source)).digest('hex');return hash===data.originalSha256&&typeof data.markup==='string'?data.markup:null;}catch{return null;}})();
 const homePricing=(()=>{try{
  const data=JSON.parse(readFileSync(resolve(appRoot,'paint-performance/home-pricing.json'),'utf8'));
  if(!/^\/assets\/home-pricing-[a-f0-9]{16}\.js$/.test(data.url))return null;
  const digest=file=>createHash('sha256').update(readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex');
  const file=realpathSync(resolve(root,'.'+data.url));if(!file.startsWith(realpathSync(root)+sep))return null;
  return digest(resolve(appRoot,'pricing/storefront.mjs'))===data.sourceSha256&&digest(file)===data.homeSha256?data.url:null;
 }catch{return null;}})();
 let logoUrl=null;
 const logoData=(()=>{try{let file=readFileSync(resolve(root,'assets/images/hidi-logo.png'));if(assets.logo?.sourceSha256===createHash('sha256').update(file).digest('hex')){const optimized=verifiedAsset(assets.logo,/^\/media-performance\/assets\/logo-[a-f0-9]{16}\.png$/);if(optimized){file=optimized;logoUrl=assets.logo.url;}}return file.length<=32768?'data:image/png;base64,'+file.toString('base64'):null;}catch{return null;}})();
 function cssFor(href){
  if(cache.has(href))return cache.get(href);
  let result=null;
  try{
   if(!/^(?:\.?\/)?[^:?#]+\.css(?:\?[^#]*)?$/.test(href))return null;
   const url=new URL(href,'https://hidiindia.com/');
   const special={'/pricing-assets/styles.css':'pricing/styles.css','/offers-assets/offers.css':'offers/offers.css'};
   const folder=special[url.pathname]?appRoot:root;
   const file=realpathSync(resolve(folder,special[url.pathname]||'.'+url.pathname));
   if(!file.startsWith(realpathSync(folder)+sep))return null;
   const original=readFileSync(file,'utf8');
   if(original.length>160000||/@import\b/i.test(original)||/<\/style/i.test(original))return null;
   result=normalizeStyleUrls(original,href);
  }catch{}
  cache.set(href,result);return result;
 }
 return (html,request={headers:{}})=>{
  const desktopStyle=Boolean(request.headers?.['user-agent'])&&!/Mobile|Android/i.test(request.headers['user-agent'])&&request.headers?.['sec-ch-ua-mobile']!=='?1';
  const inline=inlinePoster&&(/Mobile|Android/i.test(request.headers?.['user-agent']||'')||request.headers?.['sec-ch-ua-mobile']==='?1')?inlinePoster:null;
  const posterHints=[...html.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*type=["']image\/avif["'][^>]*>/gi)];
  if(posterHints.length&&/<\/head>/i.test(html)){
   const modules=[];html=html.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*fetchpriority=["']low["'][^>]*>/gi,tag=>{modules.push(tag);return '';});
   if(modules.length){const last=posterHints.at(-1)[0];html=html.replace(last,last+modules.join(''));}
  }
  if(iconMarkup){let inserted=false;html=html.replace(/<link\b[^>]*rel=["'](?:shortcut icon|icon)["'][^>]*>/gi,()=>{if(inserted)return '';inserted=true;return iconMarkup;});}
  const inlineBundles=new Set();
  html=html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,(tag,before,src,after)=>{
   const url=new URL(src,'https://hidiindia.com/');
   if(homePricing&&url.origin==='https://hidiindia.com'&&url.pathname==='/pricing-assets/storefront.mjs'&&/\btype=["']module["']/.test(before+after)&&!/\b(?:async|integrity)\b/.test(before+after))return '<script'+before+'src="'+homePricing+'"'+after+' fetchpriority="low"></script>';
   if(url.origin!=='https://hidiindia.com'||url.pathname!=='/config.js')return tag;
   if(/\b(?:async|integrity)\b/.test(before+after))return tag;
   try{
    const file=realpathSync(resolve(root,'.'+url.pathname));if(!file.startsWith(realpathSync(root)+sep))return tag;
    let code=cache.get(src);if(code===undefined){code=readFileSync(file,'utf8');cache.set(src,code);}
    if(code.length>512000||/import\s*\(|import\.meta|^\s*import[\s{*]/m.test(code))return tag;
    code=code.replace(/<\/script/gi,'<\\/script');
    if(url.pathname!=='/config.js')inlineBundles.add(url.pathname);
    return '<script '+before+after+' data-hidi-inline-script="'+url.pathname+'">'+code+'</script>';
   }catch{return tag;}
  });
  if(countdownUrl)html=html.replace(/<script\b([^>]*)\bsrc=["'](?:\.?\/)?hidi-launch-countdown-20261011\.js["']([^>]*)><\/script>/i,(tag,before,after)=>'<script'+before+'src="'+countdownUrl+'"'+after+'></script>');
  html=html.replace(/<link\b[^>]*>/gi,tag=>{
   if(/\brel=["']modulepreload["']/.test(tag)&&[...inlineBundles].some(path=>tag.includes('href="'+path+'"')))return '';
   return tag;
  });
  if(logoData)html=html.replace(/(<img\b[^>]*\bsrc=["'])(?:\.\/|\/)assets\/images\/hidi-logo\.png(["'])/gi,(_,start,end)=>start+(logoUrl||logoData)+end);
  html=html.replace(/<script\b([^>]*data-hidi-seo-identity=["']1["'][^>]*)>([\s\S]*?)<\/script>/i,(tag,attrs,code)=>seoBytes&&assets.seo.sha256===createHash('sha256').update(code).digest('hex')&&!/(?:^|\s)(?:src|async|integrity)\b/i.test(attrs)?'<script'+attrs+' defer src="'+assets.seo.url+'"></script>':tag);
  let deferred=0;const completeHead=/<\/head>/i.test(html);
  html=html.replace(/<link\b[^>]*>/gi,tag=>{
  if(!/\brel=["']stylesheet["']/i.test(tag)||/\b(?:media|disabled|integrity)\s*=/i.test(tag))return tag;
  const href=/\bhref=["']([^"']+)["']/i.exec(tag)?.[1];if(!href)return tag;
  const css=cssFor(href);if(css===null)return tag;
  const data=[...tag.matchAll(/\s(data-[\w-]+)(?:=["']([^"']*)["'])?/g)].map(m=>' '+m[1]+'="'+(m[2]||'')+'"').join('');
  const row=criticalStyles[new URL(href,'https://hidiindia.com/').pathname];
  if(completeHead&&row&&typeof row.critical==='string'&&!/<\/style/i.test(row.critical)&&row.sha256===createHash('sha256').update(css).digest('hex')){
   deferred++;
   const original=href+(href.includes('?')?'&':'?')+'hidi_full='+row.sha256.slice(0,16),asset=styleAssets[new URL(href,'https://hidiindia.com/').pathname];
   const mirrored=desktopStyle&&mirror&&asset?.sourceSha256===row.sha256&&mirror.files[asset.url]===asset.sha256&&verifiedAsset(asset,/^\/assets\/style-[a-f0-9]{16}\.css$/);
   const full=mirrored?mirrorAssetUrl(asset.url,mirror):original;
   const recovery=mirrored?' data-hidi-origin-href="'+original.replaceAll('&','&amp;')+'" integrity="sha256-'+Buffer.from(asset.sha256,'hex').toString('base64')+'" crossorigin="anonymous"':'';
   const link=tag.replace(/\bhref=["'][^"']+["']/i,'data-hidi-full-href="'+full.replaceAll('&','&amp;')+'"').replace(/\/?>$/,' media="print" fetchpriority="low" data-hidi-deferred-style="true"'+recovery+'>');
   return '<style data-hidi-inline-css="'+href.replaceAll('"','&quot;')+'"'+data+'>'+row.critical+'</style>'+link;
  }
  return '<style data-hidi-inline-css="'+href.replaceAll('"','&quot;')+'"'+data+'>'+css+'</style>';
  });
  if(deferred)html=html.replace(/<\/head>/i,'<script data-hidi-full-css="true">'+fullCssClient+'</script></head>');
  if(desktopStyle&&/image\/avif/i.test(request.headers?.accept||'')&&desktopPreview&&completeHead)html=html.replace(/<video\b([^>]*data-hidi-first-hero=["'][^"']+["'][^>]*)>/i,(tag,attrs)=>/\bposter=/.test(attrs)?tag:'<video'+attrs+' poster="'+desktopPreview+'">');
  if(logoData)html=html.replace(/<link\b[^>]*rel=["']preload["'][^>]*href=["'](?:\.\/|\/)assets\/images\/hidi-logo\.png["'][^>]*>/gi,tag=>logoUrl?tag.replace(/\bhref=["'][^"']+["']/i,'href="'+logoUrl+'"').replace(/\bfetchpriority=["'][^"']+["']/i,'fetchpriority="low"'):'');
  if(mirror&&completeHead){
   const integrity=url=>'sha256-'+Buffer.from(mirror.files[url],'hex').toString('base64');
   html=html.replace(/<link\b[^>]*>/gi,tag=>tag.replace(/\bhref=["']([^"']+)["']/i,(whole,url)=>inline?.path===url?'href="'+inline.url+'"':Object.hasOwn(mirror.files,url)&&!(originPosters.includes(url)&&!tag.includes('media="(min-width: 701px)"'))?'href="'+mirrorAssetUrl(url,mirror)+'"'+(url.endsWith('.js')?' integrity="'+integrity(url)+'"'+(/\bcrossorigin\b/i.test(tag)?'':' crossorigin="anonymous"'):''):whole));
   html=html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi,(tag,url)=>Object.hasOwn(mirror.files,url)&&url.endsWith('.js')?tag.replace('src="'+url+'"','src="'+mirrorAssetUrl(url,mirror)+'" integrity="'+integrity(url)+'" data-hidi-mirror-app="'+url+'" onerror="window.__HidiAppFallback()"'):tag);
   // Keep the verified module preload for the desktop app; the queued module
   // start path preserves request de-duplication and the desktop Low-priority hint.
   html=html.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi,tag=>{
    const href=tag.match(/\bhref=["']([^"']+)["']/i)?.[1];if(!href||!Object.keys(mirror.files).some(path=>path.endsWith('.js')&&mirrorAssetUrl(path,mirror)===href))return tag;
    const path=new URL(href).pathname;if(!Object.hasOwn(mirror.files,path))return tag;
    return '<link rel="modulepreload" media="(min-width: 701px)" fetchpriority="low" data-hidi-desktop-preload="true" href="'+href+'" integrity="'+integrity(path)+'" crossorigin="anonymous">';
   });
   html=html.replace(/<script\b[^>]*data-hidi-mirror-app=["'][^"']+["'][^>]*><\/script>/gi,tag=>tag.replace(/type=["']module["']/,'type="application/x-hidi-queued-module"').replace(/\bsrc=/,'data-hidi-queued-src='));
   html=html.replace(/<\/body>/i,'<script data-hidi-app-start="true">'+appStart+'</script></body>');
   const client=mirrorClient.replace('__HIDI_ASSET_MIRROR__',JSON.stringify({origin:mirror.origin,edgeOrigin:mirror.edgeOrigin,edgeFiles:mirror.edgeFiles?Object.fromEntries(Object.keys(mirror.edgeFiles).map(path=>[path,true])):undefined,originPosters,inlinePosters:inline?{[inline.path]:inline.url}:{},files:Object.fromEntries(Object.keys(mirror.files).map(path=>[path,true]))}));
   const marker=/<meta\b[^>]*charset\s*=/i.test(html)?/<meta\b[^>]*charset\s*=[^>]*>/i:/<head\b[^>]*>/i;
   const activeOrigin=mirrorAssetUrl(Object.keys(mirror.files).find(path=>path.endsWith('.js'))||'',mirror);const connectionOrigin=activeOrigin.startsWith('https://')?new URL(activeOrigin).origin:mirror.origin;
   html=html.replace(marker,tag=>tag+'<link rel="preconnect" href="'+connectionOrigin+'" crossorigin>'+(desktopStyle?'<link rel="preconnect" href="'+connectionOrigin+'">':'')+'<script data-hidi-asset-mirror="true">'+client+'</script>');
   // Fresh supported desktop loads the complete sheets after the native poster
   // paints. Hash/back/scroll/hidden states keep the eager safety path.
   if(deferred)html=html.replace(/<\/head>/i,'<script data-hidi-mirror-css="true">(()=>{const desktop=!matchMedia("(max-width: 700px)").matches,navigation=typeof performance!=="undefined"&&performance.getEntriesByType?.("navigation")?.[0]?.type,eligible=desktop&&typeof Element!=="undefined"&&typeof Element.prototype.moveBefore==="function"&&typeof PerformanceObserver!=="undefined"&&PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")&&!location.hash&&scrollY<=0&&document.visibilityState!=="hidden"&&navigation!=="back_forward";const load=()=>window.__HidiLoadFullCss?.();if(!eligible){load();return;}addEventListener("pageshow",event=>{if(event.persisted||scrollY>0)load();},{once:true});addEventListener("scroll",()=>{if(scrollY>0)load();},{once:true,passive:true});addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")load();},{once:true});})();</script></head>');
  }
  return html;
 };
}
