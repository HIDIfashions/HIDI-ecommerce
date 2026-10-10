import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({headless:true});
const results=[];
try {
  for (const [device,viewport,deviceScaleFactor] of [['mobile',{width:390,height:844},2],['desktop',{width:1440,height:1000},1]]) {
    const context=await browser.newContext({viewport,deviceScaleFactor});
    const page=await context.newPage();
    await page.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
    await page.addInitScript(()=>{
      window.__hidiTiming={lcp:0};
      new PerformanceObserver(list=>{window.__hidiTiming.lcp=list.getEntries().at(-1).startTime;}).observe({type:'largest-contentful-paint',buffered:true});
    });
    await page.goto('https://hidiindia.com/collections/casual-wear',{waitUntil:'load',timeout:60000});
    await page.locator('.collection-page h1').waitFor({state:'attached'});
    await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.collection-page img')].filter(i=>i.getBoundingClientRect().width>0);return images.length>0&&images.every(i=>i.complete&&i.naturalWidth>0);},null,{timeout:30000});
    const result=await page.evaluate(()=>({
      title:document.querySelector('h1').textContent,
      navigation:performance.getEntriesByType('navigation')[0].toJSON(),
      lcp:window.__hidiTiming.lcp,
      paints:performance.getEntriesByType('paint').map(e=>({name:e.name,time:e.startTime})),
      resources:performance.getEntriesByType('resource').map(e=>({name:e.name,type:e.initiatorType,start:e.startTime,duration:e.duration,bytes:e.encodedBodySize,transfer:e.transferSize})),
      images:[...document.querySelectorAll('.collection-page img')].map(i=>({source:i.currentSrc,naturalWidth:i.naturalWidth,loading:i.loading})),
    }));
    assert.equal(result.title,'Casual Wear');
    result.device=device;results.push(result);
    await context.close();
  }
}finally{await browser.close();}
await mkdir('evidence/collection-speed',{recursive:true});
await writeFile('evidence/collection-speed/baseline.json',JSON.stringify({passed:true,results},null,2));
console.log(JSON.stringify(results.map(r=>({device:r.device,ttfb:r.navigation.responseStart,load:r.navigation.loadEventEnd,lcp:r.lcp,bytes:r.resources.reduce((n,x)=>n+x.bytes,0),largest:r.resources.sort((a,b)=>b.bytes-a.bytes).slice(0,5)})),null,2));
