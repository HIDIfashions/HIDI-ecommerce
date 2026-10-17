import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {readMirrorProof,isMirrorAsset} from './asset-mirror.mjs';
export async function verifyInitialCss(pw,base,out,mode){
 const rows=[],mirror=await readMirrorProof(out);
 for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{for(const width of [320,390,768,1440]){
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
    if(engine==='chromium')assert.match(new URL(await page.locator('video[data-hidi-first-hero]').getAttribute('poster'),base).pathname,/^\/media-performance\/assets\/poster-[a-f0-9]{16}\.avif$/,'Supported mobile and desktop must use the preloaded immutable AVIF');
    await page.evaluate(async()=>{const image=new Image();image.src=document.querySelector('video[data-hidi-first-hero]').poster;await image.decode();if(image.naturalWidth<1000)throw Error('Native poster must decode at its original resolution');});
    await page.waitForTimeout(1000);
    await page.evaluate(()=>document.querySelector('#main').focus({preventScroll:true}));
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
    await page.screenshot({path:out+'/'+mode+'/initial-css-'+engine+'-'+width+'.png'});
    rows.push({engine,width,passed:true});console.log('PASS initial CSS '+mode+' '+engine+' '+width);
   }finally{release();await context.close();}
  }}finally{await browser.close();}
 }
 await writeFile(out+'/initial-css-'+mode+'.json',JSON.stringify({passed:true,results:rows},null,2));
}
