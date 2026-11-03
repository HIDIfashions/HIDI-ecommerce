// Render the published image before the application bundle, using the same
// classes, breakpoint, fit and focal points as the interactive hero.
const attr=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const position=value=>typeof value==='string'&&/^[\w%.+ -]{1,80}$/.test(value)?value:'50% 50%';
function mediaUrl(value){
 try{
  if(typeof value!=='string'||!value)return null;
  const url=new URL(value,'https://hidiindia.com');
  if(url.protocol!=='https:'||!['hidiindia.com','www.hidiindia.com'].includes(url.hostname)||url.username||url.password)return null;
  return url.pathname+url.search;
 }catch{return null;}
}
export function renderImageHero(html,selection){
 if(selection?.active!==true||html.includes('data-hidi-first-image'))return html;
 const first=selection.items?.length?selection.items[0]:selection;
 const src=mediaUrl(first?.url);
 if(first?.type!=='image'||!src)return html;
 const header=/(<header\b[^>]*data-hidi-first-header[^>]*>[\s\S]*?<\/header>)/i;
 if(!header.test(html)||/<main\b[^>]*id="main"/.test(html))return html;
 const mobile=mediaUrl(first.mobileUrl),fit=first.fitMode==='contain'?'contain':'cover';
 const publicItem=item=>({type:item.type,url:mediaUrl(item.url),assetId:item.assetId,desktopPosition:position(item.desktopPosition),mobilePosition:position(item.mobilePosition),fitMode:item.fitMode==='contain'?'contain':'cover',...(item.type==='image'&&mediaUrl(item.mobileUrl)?{mobileUrl:mediaUrl(item.mobileUrl),mobileAssetId:item.mobileAssetId}:{})});
 const initial=JSON.stringify({...publicItem(first),active:true,autoPlay:selection.autoPlay,intervalSeconds:selection.intervalSeconds,items:(selection.items?.length?selection.items:[first]).map(publicItem)}).replaceAll('<','\\u003c');
 const media='<picture style="display:contents">'+(mobile?'<source media="(max-width: 700px)" srcset="'+attr(mobile)+'">':'')+'<img data-hidi-first-image="true" class="hero-live-media" src="'+attr(src)+'" alt="" loading="eager" fetchpriority="high" decoding="sync" data-hero-image-fit="'+fit+'" style="visibility:visible;object-fit:'+fit+';--hero-position-desktop:'+attr(position(first.desktopPosition))+';--hero-position-mobile:'+attr(position(first.mobilePosition))+'"></picture>';
 const hero='<main id="main" tabindex="-1"><section class="hero hero--campaign" aria-labelledby="hero-title" aria-busy="false"><div class="hero-media" aria-hidden="true" data-hero-config-status="uploaded" data-media-index="0">'+media+'</div><div class="hero-shade"></div><h1 id="hero-title" class="sr-only">HIDI — Wear the feeling. Indian wear for work, everyday and occasions.</h1><div class="campaign-hero-action"><a href="/collections/all" class="campaign-shop-button" style="text-align:center">Shop Now</a></div></section><script data-hidi-first-image-setup>window.__HidiHeroInitial='+initial+';</script></main>';
 return html.replace(header,tag=>tag+hero);
}
