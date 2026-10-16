import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mediaPath} from './images.mjs';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);

export async function probe(base) {
  const results=[];
  for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')) {
    const browser=await pw[engine].launch({headless:true});
    try {
      for(const [device,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:1000}]]) {
        const context=await browser.newContext({viewport,deviceScaleFactor:2});
        const page=await context.newPage();
        await page.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
        await page.addInitScript(()=>{
          window.__hidiLcp=0;
          if(PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint'))new PerformanceObserver(list=>window.__hidiLcp=list.getEntries().at(-1).startTime).observe({type:'largest-contentful-paint',buffered:true});
        });
        const response=await page.goto(base+'/collections/casual-wear',{waitUntil:'load',timeout:60000});
        assert.equal(response.status(),200);
        await page.locator('.collection-page h1').waitFor({state:'attached'});
        await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.collection-page img')].filter(image=>image.getBoundingClientRect().width>0);return images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0);});
        const timing=await page.evaluate(()=>({lcp:window.__hidiLcp,navigation:performance.getEntriesByType('navigation')[0].toJSON(),images:[...document.querySelectorAll('.collection-page img')].map(i=>i.currentSrc),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.encodedBodySize,duration:r.duration}))}));
        const sources=[...new Set(timing.images.filter(source=>new URL(source).pathname==='/_next/image'))];
        assert(sources.length>=2,'Actual collection thumbnails required');
        const photos=[];
        for(const source of sources) {
          const url=new URL(source),media=new URL(url.searchParams.get('url'),'https://hidiindia.com');
          assert(media.pathname.startsWith('/media/products/_display_v2/'),'New display URL bypasses oversized cached thumbnails');
          assert(mediaPath(media.href));
          const result=await fetch(source,{headers:{Accept:'image/webp'},signal:AbortSignal.timeout(30000)});
          assert.equal(result.status,200);assert.equal(result.headers.get('x-hidi-image-cache'),'HIT');
          const bytes=(await result.arrayBuffer()).byteLength;assert(bytes>1000&&bytes<600000,'Display image must not return a multi-megabyte original');
          photos.push({width:Number(url.searchParams.get('w')),bytes,cache:'HIT'});
        }
        if(device==='mobile') {
          await page.getByRole('button',{name:/^Filter & Sort/}).click();
          const filters=page.getByRole('dialog',{name:'Product filters'});await filters.waitFor();
          await filters.getByRole('radio',{name:'Price: Low to high',exact:true}).check();
          await filters.getByRole('button',{name:/^Show \d+ styles$/}).click();
          await filters.waitFor({state:'hidden'});
          await page.getByRole('button',{name:'Show one product per row'}).click();
          assert.equal(await page.getByRole('button',{name:'Show one product per row'}).getAttribute('aria-pressed'),'true');
          await page.getByRole('button',{name:'Show two products per row'}).click();
        } else {
          await page.getByRole('combobox',{name:'Sort products'}).selectOption('price-low');
          assert.equal(await page.getByRole('combobox',{name:'Sort products'}).inputValue(),'price-low');
        }
        results.push({engine,device,passed:true,lcp:timing.lcp,ttfb:timing.navigation.responseStart,load:timing.navigation.loadEventEnd,photos,resourceBytes:timing.resources.reduce((n,r)=>n+r.bytes,0)});
        await context.close();
      }
    } finally {await browser.close();}
  }
  return {passed:true,results,productionWrites:false};
}
