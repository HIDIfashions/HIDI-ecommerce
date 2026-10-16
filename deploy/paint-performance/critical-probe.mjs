import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
export async function verifyInitialCss(pw,base,out,mode){
 const rows=[];
 for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
   let release;const gate=new Promise(resolve=>release=resolve);
   try{
    await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
     if(url.origin!==new URL(base).origin||!['GET','HEAD'].includes(req.method()))return route.abort();
     if(/\/assets\/index-[^/]+\.js$/.test(url.pathname))return route.abort();
     if(/\/assets\/index-[^/]+\.css$/.test(url.pathname))await gate;
     return route.continue();
    });
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.addStyleTag({content:'*{animation-play-state:paused!important;transition:none!important}'});
    await page.waitForFunction(()=>document.querySelector('video[data-hidi-first-hero]')&&Boolean(window.__HidiFullCssReady));
    await page.evaluate(()=>window.__HidiAvifSupport);await page.waitForTimeout(1000);
    const snapshot=()=>page.evaluate(()=>[document.body,...document.querySelectorAll('#root,#root *,body>.hidi-price-announcement')].filter(el=>!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>{
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);
     return {tag:el.tagName,cls:el.className,rect:[r.x,r.y,r.width,r.height],style:Object.fromEntries(['display','position','font','color','backgroundColor','padding','margin','border','opacity','objectFit','objectPosition','zIndex','transform'].map(key=>[key,s[key]]))};
    }));
    const initial=await snapshot();
    release();await page.evaluate(()=>window.__HidiFullCssReady);await page.waitForTimeout(100);
    assert.deepEqual(await snapshot(),initial,'Initial header/hero CSS must match the complete stylesheet at '+engine+'/'+width);
    await page.screenshot({path:out+'/'+mode+'/initial-css-'+engine+'-'+width+'.png'});
    rows.push({engine,width,passed:true});console.log('PASS initial CSS '+mode+' '+engine+' '+width);
   }finally{release();await context.close();}
  }}finally{await browser.close();}
 }
 await writeFile(out+'/initial-css-'+mode+'.json',JSON.stringify({passed:true,results:rows},null,2));
}
