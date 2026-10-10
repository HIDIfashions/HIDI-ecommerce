import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base=process.env.HIDI_PERF_BASE || 'http://127.0.0.1:3192';
const live=process.env.HIDI_PERF_LIVE==='1';
const report=[];await mkdir('evidence',{recursive:true});
for(const engine of (process.env.HIDI_PERF_ENGINES||'chromium,firefox,webkit').split(',')) {
  const browser=await pw[engine].launch({headless:true});
  try {for(const width of [390,1440]) {
    const context=await browser.newContext({viewport:{width,height:844},hasTouch:width===390,reducedMotion:'reduce'});
    const page=await context.newPage();const errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>requests.push({path:new URL(r.url()).pathname,prefetch:r.headers()['next-router-prefetch']==='1',rsc:r.headers().rsc,type:r.resourceType()}));
    await page.addInitScript(()=>{
      window.__hidiLongTasks=[];
      try {new PerformanceObserver(list=>list.getEntries().forEach(entry=>window.__hidiLongTasks.push(entry.duration))).observe({type:'longtask',buffered:true});}catch{}
    });
    if(!live) await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==base)return route.abort();
      if(url.pathname==='/api/hidi/landing-media-config')return route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,slots:{},ananya:null})});
      if(url.pathname==='/api/hidi/hero-config')return route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,active:false,source:'bundled'})});
      return route.continue();
    });
    else await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
    try {
      for(let visit=0;visit<2;visit++) {
        if(visit)await page.reload({waitUntil:'networkidle'});else await page.goto(base+'/',{waitUntil:'networkidle'});
        await page.waitForFunction(()=>document.querySelector('#hidi-edit')?.dataset.landingConfigStatus==='ready');
        await page.locator('#hidi-edit').scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>{const img=document.querySelector('#hidi-edit img');return img?.complete && img.naturalWidth>0;});
        const state=await page.evaluate(()=>{
          const img=document.querySelector('#hidi-edit img'),nav=performance.getEntriesByType('navigation')[0];
          return {src:img.currentSrc,srcSet:img.srcset,naturalWidth:img.naturalWidth,ratio:img.naturalWidth/img.naturalHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,domMs:nav.domContentLoadedEventEnd,longTasks:window.__hidiLongTasks.length,longTaskMs:window.__hidiLongTasks.reduce((a,b)=>a+b,0)};
        });
        assert(!state.overflow,'Horizontal layout regressed');
        if(!live) {
          assert.match(state.src,/\/performance\/banner-[a-f0-9]{12}-\d+\.webp$/);assert(state.srcSet.includes('640w')&&state.srcSet.includes('1920w'));assert(Math.abs(state.ratio-5460/2048)<.01);
          assert(!requests.some(r=>r.path.endsWith('hidi-premium-ai-full-banner-lossless.png')),'Full master downloaded');
        }
        assert.equal(await page.locator('footer.site-footer a[href="/privacy"]').count(),1);
        report.push({engine,width,visit,page:'home',...state});
      }
      await page.screenshot({path:`evidence/performance-${engine}-${width}.png`});
      requests.length=0;
      await page.goto(base+'/collections/all',{waitUntil:'networkidle'});
      await page.locator('footer.footer').scrollIntoViewIfNeeded();await page.waitForTimeout(1200);
      assert(!requests.some(r=>r.prefetch&&['/','/account','/wishlist','/cart','/shipping','/returns','/contact','/lookbook','/collections/all'].includes(r.path)),'Unnecessary private/footer/current-route prefetch remains');
      await page.locator('.site-header .wordmark').scrollIntoViewIfNeeded();
      requests.length=0;const start=Date.now();await page.locator('.site-header .wordmark').click();await page.waitForURL(base+'/');await page.locator('#hidi-edit').waitFor();
      assert(requests.some(r=>r.path==='/'&&r.type==='document'&&!r.rsc),'Home must be a real document navigation');
      assert(!requests.some(r=>r.path==='/'&&r.rsc),'Landing must not receive an RSC client transition');
      report.push({engine,width,page:'collection-to-home',clickMs:Date.now()-start,documentNavigation:true,unnecessaryPrefetches:0});
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }} finally {await browser.close();}
}
await writeFile('evidence/performance-browser.json',JSON.stringify(report,null,2));console.log('PASS: responsive banner/reload/privacy, private prefetch exclusions and landing document navigation');
