import {readFileSync} from 'node:fs';
const attribute=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
export function renderHero(html,selection,options){
 try{
  if(selection?.active!==true)return html;
  const data=options?.videos||JSON.parse(readFileSync(new URL('./initial-hero.json',import.meta.url),'utf8'));
  const template=options?.template||readFileSync(new URL('./hero-template.html',import.meta.url),'utf8');
  const first=selection.items?.length?selection.items[0]:selection;
  if(first.type!=='video')return html;
  const url=new URL(first.url,'https://hidiindia.com');
  if(!['http:','https:'].includes(url.protocol)||!['hidiindia.com','www.hidiindia.com'].includes(url.hostname))return html;
  const variant=data[url.pathname];if(!variant)return html;
  const position=value=>typeof value==='string'&&/^[\w%.+ -]{1,80}$/.test(value)?attribute(value):'50% 50%';
  const hero=template.replace('__DESKTOP__',position(first.desktopPosition)).replace('__MOBILE__',position(first.mobilePosition));
  const choose=JSON.stringify(variant).replaceAll('<','\\u003c');
  const publicItem=item=>({type:item.type,url:item.url,assetId:item.assetId,desktopPosition:position(item.desktopPosition),mobilePosition:position(item.mobilePosition)});
  const initial=JSON.stringify({...publicItem(selection),active:selection.active,autoPlay:selection.autoPlay,intervalSeconds:selection.intervalSeconds,items:selection.items?.map(publicItem)}).replaceAll('<','\\u003c');
  const script='<script data-hidi-first-hero-setup="true">window.__HidiHeroInitial='+initial+';(()=>{const video=document.querySelector("video[data-hidi-first-hero]");const variants='+choose+';const selected=matchMedia("(max-width: 700px)").matches?variants.mobile:variants.desktop;const fittedPoster=window.__HidiAvifPoster?.(selected,(window.__HidiHeroInitial?.items?.[0]||window.__HidiHeroInitial)?.mobilePosition)||selected.avifPoster;if(video?.isConnected&&fittedPoster)video.poster=window.__HidiMirrorPoster?.(fittedPoster)||fittedPoster;Promise.resolve(window.__HidiAvifSupport).then(supported=>{window.__HidiAvifEnabled=Boolean(supported);if(video?.isConnected){const poster=supported&&selected.avifPoster?(window.__HidiAvifPoster?.(selected,(window.__HidiHeroInitial?.items?.[0]||window.__HidiHeroInitial)?.mobilePosition)||selected.avifPoster):selected.poster;video.poster=window.__HidiMirrorPoster?.(poster)||poster;window.__HidiNativePosterReady=window.__HidiWaitForPosterPaint?.(video);}});})();</script>';
  return html.replace(/(<header\b[^>]*data-hidi-first-header[^>]*>[\s\S]*?<\/header>)/i,tag=>tag+'<main id="main" tabindex="-1">'+hero+script+'</main>');
 }catch{return html;}
}
