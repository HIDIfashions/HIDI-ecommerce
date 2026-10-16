import {readFileSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';

// Inline the existing public CSS in the same cascade position. Resolve from the
// current image, so later image overlays cannot leave stale style contents.
export function createHomeHead(root,appRoot=resolve(root,'..')) {
 const cache=new Map();
 const assets=(()=>{try{return JSON.parse(readFileSync(resolve(appRoot,'paint-performance/head-assets.json'),'utf8'));}catch{return {};}})();
 function verifiedAsset(row,pattern){try{if(!row||!pattern.test(row.url)||!row.url.includes(row.sha256.slice(0,16)))return null;const file=realpathSync(resolve(root,'.'+row.url));if(!file.startsWith(realpathSync(root)+sep))return null;const bytes=readFileSync(file);return createHash('sha256').update(bytes).digest('hex')===row.sha256?bytes:null;}catch{return null;}}
 const seoBytes=verifiedAsset(assets.seo,/^\/assets\/home-seo-[a-f0-9]{16}\.js$/);
 const criticalStyles=(()=>{try{return JSON.parse(readFileSync(resolve(appRoot,'paint-performance/critical-css.json'),'utf8')).styles||{};}catch{return {};}})();
 const iconMarkup=(()=>{try{const data=JSON.parse(readFileSync(resolve(appRoot,'paint-performance/icons.json'),'utf8'));const source=realpathSync(resolve(appRoot,data.sourceFile));if(!source.startsWith(realpathSync(appRoot)+sep))return null;const hash=createHash('sha256').update(readFileSync(source)).digest('hex');return hash===data.originalSha256&&typeof data.markup==='string'?data.markup:null;}catch{return null;}})();
 const homePricing=(()=>{try{
  const data=JSON.parse(readFileSync(resolve(appRoot,'paint-performance/home-pricing.json'),'utf8'));
  if(!/^\/assets\/home-pricing-[a-f0-9]{16}\.js$/.test(data.url))return null;
  const digest=file=>createHash('sha256').update(readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex');
  const file=realpathSync(resolve(root,'.'+data.url));if(!file.startsWith(realpathSync(root)+sep))return null;
  return digest(resolve(appRoot,'pricing/storefront.mjs'))===data.sourceSha256&&digest(file)===data.homeSha256?data.url:null;
 }catch{return null;}})();
 const logoData=(()=>{try{let file=readFileSync(resolve(root,'assets/images/hidi-logo.png'));if(assets.logo?.sourceSha256===createHash('sha256').update(file).digest('hex'))file=verifiedAsset(assets.logo,/^\/media-performance\/assets\/logo-[a-f0-9]{16}\.png$/)||file;return file.length<=32768?'data:image/png;base64,'+file.toString('base64'):null;}catch{return null;}})();
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
   result=original.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi,(whole,quote,value)=>/^(?:data:|https?:|\/|#)/i.test(value)?whole:'url('+JSON.stringify(new URL(value,url).pathname)+')');
  }catch{}
  cache.set(href,result);return result;
 }
 return html=>{
  const posterHints=[...html.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*type=["']image\/avif["'][^>]*>/gi)];
  if(posterHints.length&&/<\/head>/i.test(html)){
   const modules=[];html=html.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*fetchpriority=["']low["'][^>]*>/gi,tag=>{modules.push(tag);return '';});
   if(modules.length){const last=posterHints.at(-1)[0];html=html.replace(last,last+modules.join(''));}
  }
  if(iconMarkup){let inserted=false;html=html.replace(/<link\b[^>]*rel=["'](?:shortcut icon|icon)["'][^>]*>/gi,()=>{if(inserted)return '';inserted=true;return iconMarkup;});}
  const inlineBundles=new Set();
  html=html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,(tag,before,src,after)=>{
   const url=new URL(src,'https://hidiindia.com/');
   if(homePricing&&url.origin==='https://hidiindia.com'&&url.pathname==='/pricing-assets/storefront.mjs'&&/\btype=["']module["']/.test(before+after)&&!/\b(?:async|integrity)\b/.test(before+after))return '<script'+before+'src="'+homePricing+'"'+after+'></script>';
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
  html=html.replace(/<link\b[^>]*>/gi,tag=>{
   if(/\brel=["']modulepreload["']/.test(tag)&&[...inlineBundles].some(path=>tag.includes('href="'+path+'"')))return '';
   return tag;
  });
  if(logoData)html=html.replace(/(<img\b[^>]*\bsrc=["'])(?:\.\/|\/)assets\/images\/hidi-logo\.png(["'])/gi,(_,start,end)=>start+logoData+end);
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
   const full=href+(href.includes('?')?'&':'?')+'hidi_full='+row.sha256.slice(0,16);
   const link=tag.replace(/\bhref=["'][^"']+["']/i,'data-hidi-full-href="'+full.replaceAll('&','&amp;')+'"').replace(/\/?>$/,' media="print" fetchpriority="low" data-hidi-deferred-style="true">');
   return '<style data-hidi-inline-css="'+href.replaceAll('"','&quot;')+'"'+data+'>'+row.critical+'</style>'+link;
  }
  return '<style data-hidi-inline-css="'+href.replaceAll('"','&quot;')+'"'+data+'>'+css+'</style>';
  });
  if(deferred)html=html.replace(/<\/head>/i,'<script data-hidi-full-css="true">window.__HidiFullCssReady=new Promise(resolve=>{let started=false;window.__HidiLoadFullCss=()=>{if(started)return;started=true;Promise.all([...document.querySelectorAll("link[data-hidi-deferred-style]")].map(link=>new Promise(done=>{const ready=()=>{link.media="all";done();};link.addEventListener("load",ready,{once:true});link.addEventListener("error",ready,{once:true});link.href=link.dataset.hidiFullHref;if(link.sheet)ready();}))).then(resolve);};const fallback=()=>{if(document.readyState!=="loading"&&!document.querySelector("video[data-hidi-first-hero]"))window.__HidiLoadFullCss();};document.addEventListener("readystatechange",fallback);fallback();});</script></head>');
  if(logoData)html=html.replace(/<link\b[^>]*rel=["']preload["'][^>]*href=["'](?:\.\/|\/)assets\/images\/hidi-logo\.png["'][^>]*>/gi,'');
  return html;
 };
}
