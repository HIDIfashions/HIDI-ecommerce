import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function probe(base,{output='evidence/home-first-render/candidate',live=false}={}){
 // Capture the actual early frame while module execution is held back.
 // document.fonts.ready can wait for DOMContentLoaded (and the held module).
 // This changes screenshot waiting only; fonts still load and render normally.
 process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
 const engines=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),results=[];
 await mkdir(output,{recursive:true});
 const raw=await (await fetch(base+'/',{headers:{'X-Forwarded-Host':'hidiindia.com','X-Forwarded-Proto':'https'}})).text();
 assert(raw.includes('data-hidi-first-image="true"'),'Initial response must contain the published image');
 assert(raw.indexOf('data-hidi-first-image="true"')<raw.indexOf('data-hidi-home-discovery'));
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
  const browser=await engines[engine].launch();
  try{for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:900}});context.setDefaultTimeout(30000);
   let release;const appGate=new Promise(resolve=>release=resolve);
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(!['GET','HEAD'].includes(request.method()))return route.abort();
    if(/\/assets\/index-[\w-]+\.js$/.test(url.pathname))await appGate;
    // Force the settings refresh to finish after the cached first image loads.
    // This reproduces the old unconditional readiness reset deterministically.
    if(url.pathname==='/api/hidi/hero-config'){await appGate;await new Promise(resolve=>setTimeout(resolve,800));}
    if(!live&&['hidiindia.com','www.hidiindia.com'].includes(url.hostname)&&url.pathname.startsWith('/api/hidi/hero-asset/'))return route.fulfill({response:await context.request.get(base+url.pathname)});
    return route.continue();
   });
   const page=await context.newPage(),errors=[];
   const configResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/hidi/hero-config');
   page.on('pageerror',error=>errors.push(String(error)));
   page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
   // Observe the first interactive image even if the three-second carousel
   // advances while another browser assertion is waiting.
   await page.addInitScript(()=>{
    function sample(){
     const img=document.querySelector('.hidi-page .hero img.hero-live-media');
     if(img?.complete&&img.naturalWidth>0&&getComputedStyle(img).visibility==='visible'){
      window.__HidiImageHandoff={src:new URL(img.currentSrc).pathname,fit:getComputedStyle(img).objectFit};return;
     }
     requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
   });
   try{
    await page.goto(base+'/',{waitUntil:'commit'});
    await page.waitForFunction(()=>{const img=document.querySelector('img[data-hidi-first-image]');return img?.complete&&img.naturalWidth>0;});
    const initial=await page.evaluate(()=>{
     const img=document.querySelector('img[data-hidi-first-image]'),hero=img.closest('.hero'),discovery=document.querySelector('[data-hidi-home-discovery]');
     const rect=hero.getBoundingClientRect(),text=discovery?.getBoundingClientRect();
     return {src:new URL(img.currentSrc).pathname,fit:getComputedStyle(img).objectFit,heroTop:rect.top,heroBottom:rect.bottom,heroHeight:rect.height,discoveryTop:text?.top,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,visible:getComputedStyle(img).visibility};
    });
    assert(initial.heroTop<initial.viewport&&initial.heroHeight>400);assert(initial.discoveryTop>=initial.heroBottom-1);assert(initial.discoveryTop>=initial.viewport-1,'Text fallback must not occupy the initial viewport');assert(!initial.overflow);assert.equal(initial.visible,'visible');
    await page.screenshot({path:output+'/'+engine+'-'+width+'-before-js.png'});
    release();
    await page.locator('.hidi-page .site-header').waitFor();
    await page.waitForFunction(()=>window.__HidiImageHandoff);
    const pause=page.getByRole('button',{name:'Pause hero media rotation',exact:true});
    if(await pause.count())await pause.click();
    await configResponse;
    await page.waitForTimeout(1000);
    assert(await page.locator('.hero img.hero-live-media').evaluate(img=>img.complete&&img.naturalWidth>0&&getComputedStyle(img).visibility==='visible'),'Same-image settings refresh must preserve visibility');
    assert.equal(await page.locator('[data-hidi-home-discovery]').count(),0);
    const final=await page.evaluate(()=>window.__HidiImageHandoff);
    assert.equal(final.src,initial.src,'Hydration must use the same device artwork');assert.equal(final.fit,initial.fit,'Hydration must keep image fit');
    await page.getByRole('button',{name:'Show hero media 1',exact:true}).click();
    await page.waitForFunction(()=>{const img=document.querySelector('.hero img.hero-live-media');return img?.complete&&img.naturalWidth>0&&getComputedStyle(img).visibility==='visible';});
    await page.screenshot({path:output+'/'+engine+'-'+width+'-loaded.png'});
    await page.getByRole('link',{name:/^shop now$/i}).click();
    await page.waitForURL(url=>url.pathname.replace(/\/$/,'')==='/collections/all',{waitUntil:'domcontentloaded'});
    await page.locator('main').first().waitFor();
    await page.locator('a[href*="/products/"]').first().waitFor();
    results.push({engine,width,initial,final,initialImageBeforeJavaScript:true,discoveryBelowFold:true,shopLinkWorks:true});
    console.log('PASS first image before JavaScript',engine,width);
   }catch(error){
    release();
    const diagnostic=await page.evaluate(()=>({media:document.querySelector('.hero-media')?.outerHTML,bodyClass:document.body.className,initial:window.__HidiHeroInitial,handoff:window.__HidiImageHandoff,text:document.body.innerText.slice(0,1000)})).catch(()=>null);
    console.error('HERO DIAGNOSTIC',JSON.stringify({engine,width,errors,diagnostic}));
    await writeFile(output+'/'+engine+'-'+width+'-failure.json',JSON.stringify({errors,diagnostic},null,2));
    await page.screenshot({path:output+'/'+engine+'-'+width+'-failure.png'}).catch(()=>{});
    throw error;
   }finally{release();await context.close();}
  }}finally{await browser.close();}
 }
 const report={passed:true,actualRuntime:!live,productionWrites:0,results};await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv.includes('--live'))await probe('https://hidiindia.com',{output:'evidence/home-first-render/live',live:true});
