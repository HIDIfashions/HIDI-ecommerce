import {readFileSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';

// Inline the existing public CSS in the same cascade position. Resolve from the
// current image, so later image overlays cannot leave stale style contents.
export function createHomeHead(root,appRoot=resolve(root,'..')) {
 const cache=new Map();
 const logoData=(()=>{try{const file=readFileSync(resolve(root,'assets/images/hidi-logo.png'));return file.length<=32768?'data:image/png;base64,'+file.toString('base64'):null;}catch{return null;}})();
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
  const inlineBundles=new Set();
  html=html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,(tag,before,src,after)=>{
   const url=new URL(src,'https://hidiindia.com/');
   if(url.origin!=='https://hidiindia.com'||url.pathname!=='/config.js')return tag;
   if(/\b(?:async|integrity)\b/.test(before+after))return tag;
   try{
    const file=realpathSync(resolve(root,'.'+url.pathname));if(!file.startsWith(realpathSync(root)+sep))return tag;
    let code=cache.get(src);if(code===undefined){code=readFileSync(file,'utf8');cache.set(src,code);}
    if(code.length>512000||/import\s*\(|import\.meta|^\s*import[\s{*]/m.test(code))return tag;
    if(logoData)code=code.replace('src:Tt("images/hidi-logo.png"),fetchPriority:"high"','src:'+JSON.stringify(logoData)+',fetchPriority:"high"');
    code=code.replace(/<\/script/gi,'<\\/script');
    if(url.pathname!=='/config.js')inlineBundles.add(url.pathname);
    return '<script '+before+after+' data-hidi-inline-script="'+url.pathname+'">'+code+'</script>';
   }catch{return tag;}
  });
  html=html.replace(/<link\b[^>]*>/gi,tag=>{
   if(logoData&&/\brel=["']preload["']/.test(tag)&&/href=["'](?:\.\/|\/)assets\/images\/hidi-logo\.png["']/.test(tag))return '';
   if(/\brel=["']modulepreload["']/.test(tag)&&[...inlineBundles].some(path=>tag.includes('href="'+path+'"')))return '';
   return tag;
  });
  if(logoData)html=html.replace(/(<img\b[^>]*\bsrc=["'])(?:\.\/|\/)assets\/images\/hidi-logo\.png(["'])/gi,(_,start,end)=>start+logoData+end);
  return html.replace(/<link\b[^>]*>/gi,tag=>{
  if(!/\brel=["']stylesheet["']/i.test(tag)||/\b(?:media|disabled|integrity)\s*=/i.test(tag))return tag;
  const href=/\bhref=["']([^"']+)["']/i.exec(tag)?.[1];if(!href)return tag;
  const css=cssFor(href);if(css===null)return tag;
  const data=[...tag.matchAll(/\s(data-[\w-]+)(?:=["']([^"']*)["'])?/g)].map(m=>' '+m[1]+'="'+(m[2]||'')+'"').join('');
  return '<style data-hidi-inline-css="'+href.replaceAll('"','&quot;')+'"'+data+'>'+css+'</style>';
  });
 };
}
