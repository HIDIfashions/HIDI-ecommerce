import {inlinePosterPath} from './poster-reference.mjs';
import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {readMirrorProof,isMirrorAsset} from './asset-mirror.mjs';
export async function verifyInitialCss(pw,base,out,mode){
 const rows=[],mirror=await readMirrorProof(out);
 for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{for(const width of [320,390,768,1001,1440]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',...(engine==='chromium'&&width<=700?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'}:{})}),page=await context.newPage();
   let release;const gate=new Promise(resolve=>release=resolve);
   try{
    await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
     if(url.origin!==new URL(base).origin&&!isMirrorAsset(url.href,mirror)||!['GET','HEAD'].includes(req.method()))return route.abort();
     if(url.pathname==='/'){
      const response=await route.fetch();let html=await response.text();
      html=html.replace(/<script data-hidi-full-css-activate="true">[\s\S]*?<\/script>/,'');
      return route.fulfill({response,body:html});
     }
     if(/\/assets\/index-[^/]+\.js$/.test(url.pathname))return route.abort();
     if(/\.css$/.test(url.pathname))await gate;
     return route.continue();
    });
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.addStyleTag({content:'*{animation-play-state:paused!important;transition:none!important}'});
    await page.waitForFunction(()=>document.querySelector('video[data-hidi-first-hero]')&&(Boolean(window.__HidiFullCssReady)||document.querySelector('style[data-hidi-inline-css*="index-"]')));
    await page.evaluate(()=>window.__HidiAvifSupport);
    await page.waitForFunction(()=>Boolean(document.querySelector('video[data-hidi-first-hero]')?.poster));
    if(engine==='chromium'){const poster=await page.locator('video[data-hidi-first-hero]').getAttribute('poster');if(poster.startsWith('data:'))assert(inlinePosterPath(poster,mirror),'Inline poster must match a verified immutable AVIF hash');else assert.match(new URL(poster,base).pathname,/^\/media-performance\/assets\/poster-[a-f0-9]{16}\.avif$/,'Supported browsers must use the verified AVIF');}
    await page.evaluate(async()=>{const image=new Image();image.src=document.querySelector('video[data-hidi-first-hero]').poster;await image.decode();if(image.naturalWidth===512){const video=document.querySelector('video[data-hidi-first-hero]'),rect=video.getBoundingClientRect();if(image.naturalHeight!==720||rect.width/rect.height>512/720||getComputedStyle(video).objectPosition!=='50% 50%')throw Error('Portrait poster must retain the original centred visible field');}else if(image.naturalWidth<1000)throw Error('Wide poster must retain its original resolution');});
    await page.waitForTimeout(1000);
    await page.evaluate(()=>document.querySelector('#main').focus({preventScroll:true}));
     const readLayout=()=>page.evaluate(()=>{const bar=document.querySelector('body>.hidi-price-announcement'),header=document.querySelector('#site-header.campaign-header'),marker=document.querySelectorAll('style[data-hidi-price-header-offset]');if(!bar||!header)return{passed:false,reason:'missing announcement or campaign header',markerCount:marker.length,appStarted:Boolean(window.__HidiAppStarted)};const b=bar.getBoundingClientRect(),h=header.getBoundingClientRect(),style=getComputedStyle(header),vertical=Math.min(b.bottom,h.bottom)-Math.max(b.top,h.top),horizontal=Math.min(b.right,h.right)-Math.max(b.left,h.left);return{passed:marker.length===1&&!window.__HidiAppStarted&&b.width>0&&b.height>0&&h.width>0&&h.height>0&&Math.abs(b.top)<=1&&Math.abs(h.top-b.bottom)<=1.5&&(vertical<=1||horizontal<=1)&&document.documentElement.scrollWidth<=innerWidth+1&&style.position==='sticky'&&style.marginBottom===(innerWidth<=700?'-58px':'-72px'),markerCount:marker.length,appStarted:Boolean(window.__HidiAppStarted),bar:{x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom},header:{x:h.x,y:h.y,width:h.width,height:h.height,bottom:h.bottom,position:style.position,marginBottom:style.marginBottom},intersection:{vertical,horizontal},overflow:document.documentElement.scrollWidth>innerWidth+1};});
     const ssrLayout=await readLayout();assert(ssrLayout.passed,'Server-rendered announcement/header layout failed at '+engine+'/'+width+': '+JSON.stringify(ssrLayout));
    const snapshot=()=>page.evaluate(()=>[document.body,...document.querySelectorAll('#root,#root *,body>.hidi-price-announcement')].filter(el=>!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>{
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);
     return {tag:el.tagName,cls:el.className,rect:[r.x,r.y,r.width,r.height],style:Object.fromEntries(['display','position','font','color','backgroundColor','padding','margin','border','outline','opacity','objectFit','objectPosition','zIndex','transform'].map(key=>[key,s[key]]))};
    }));
    const initial=await snapshot();
    release();await page.evaluate(async()=>{
     if(window.__HidiFullCssReady){window.__HidiActivateFullCss?.();return window.__HidiFullCssReady;}
     const inline=document.querySelector('style[data-hidi-inline-css*="index-"]');
     const link=document.createElement('link');link.rel='stylesheet';link.href=inline.dataset.hidiInlineCss;
     await new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error('Original CSS unavailable'));inline.before(link);});
     inline.remove();
    });await page.waitForTimeout(100);
    assert(await page.evaluate(()=>[...document.querySelectorAll('link[data-hidi-deferred-style]')].every(link=>Boolean(link.sheet)&&link.media==='all')),'Every original deferred stylesheet must actually load');
    assert.deepEqual(await snapshot(),initial,'Initial header/hero CSS must match the complete stylesheet at '+engine+'/'+width);
     const completeLayout=await readLayout();assert(completeLayout.passed,'Complete-CSS announcement/header layout failed at '+engine+'/'+width+': '+JSON.stringify(completeLayout));
    await page.screenshot({path:out+'/'+mode+'/initial-css-'+engine+'-'+width+'.png'});
     rows.push({engine,width,passed:true,ssrLayout,completeLayout});console.log('PASS initial CSS '+mode+' '+engine+' '+width);
   }finally{release();await context.close();}
  }}finally{await browser.close();}
 }
 await writeFile(out+'/initial-css-'+mode+'.json',JSON.stringify({passed:true,results:rows},null,2));
}
