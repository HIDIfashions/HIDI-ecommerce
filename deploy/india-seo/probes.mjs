import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';

const copy=JSON.parse(await readFile(new URL('./collections.json',import.meta.url),'utf8'));
const routes=Object.keys(copy);
const destinations={'Casual Wear':'casual-wear','Work Wear':'work-wear','Occasional Wear':'occasional-wear','Ananya’s Pick':'ananyas-pick'};
const engines=['chromium','firefox','webkit'];
export async function probe(base,output,{baseline,landing,inventory}={}){
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output,{recursive:true});
  const results=[],writes=[],errors=[];
  landing ||= await (await fetch('https://hidiindia.com/api/hidi/landing-media-config')).json();
  for(const engine of engines){
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try{for(const [width,height] of [[320,740],[390,844],[1440,900]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<700,reducedMotion:'reduce',extraHTTPHeaders:{'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(!['GET','HEAD'].includes(request.method())){
          if(!isBlockedTelemetry(request.method(),request.url(),url.origin)&&!(/(^|\.)cloudflareinsights\.com$/.test(url.hostname)&&url.pathname==='/cdn-cgi/rum'))writes.push({method:request.method(),path:url.pathname});
          return route.abort();
        }
        if(url.pathname==='/api/hidi/landing-media-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(landing)});
        if(request.resourceType()==='media'||/razorpay\.com$/.test(url.hostname))return route.abort();
        return route.continue();
      });
      const page=await context.newPage(),prior=baseline?await context.newPage():null;
      page.setDefaultTimeout(30000);prior?.setDefaultTimeout(30000);
      page.on('pageerror',error=>errors.push({engine,width,message:error.message}));
      const products=async p=>(await p.locator('main article h3 a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname))).sort();
      try{
        for(const slug of routes){
          const path='/collections/'+slug;
          assert((await page.goto(base+path,{waitUntil:'domcontentloaded'})).ok());
          await page.getByRole('heading',{level:1,name:copy[slug].title,exact:true}).waitFor();
          await page.locator('main article').first().waitFor();
          assert.equal(await page.locator('h1').count(),1);
          assert.equal(await page.locator('.hidi-collection-intro').innerText(),copy[slug].copy);
          assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://hidiindia.com'+path);
          for(const content of await page.locator('meta[name="robots"],meta[name="googlebot"]').evaluateAll(nodes=>nodes.map(n=>n.content)))assert(!/noindex/.test(content));
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow: '+path);
          const expected=await products(page);assert(expected.length>0);
          if(inventory)assert.deepEqual(expected,inventory[slug].map(p=>'/products/'+p.slug).sort(),'Collection differs from frozen active inventory: '+slug);
          if(prior){await prior.goto(baseline+path,{waitUntil:'domcontentloaded'});await prior.locator('main article').first().waitFor();assert.deepEqual(expected,await products(prior),'Product selection changed');}
          const sort=page.getByLabel('Sort products');
          if(await sort.count()){await sort.selectOption({label:'Price: Low to high'});assert.deepEqual(await products(page),expected);}
          await page.screenshot({path:`${output}/${engine}-${width}-${slug}.png`,fullPage:false});
        }
        const product=page.locator('main article h3 a').first(),name=await product.innerText();
        await product.click();await page.waitForURL('**/products/**');
        await page.getByRole('heading',{level:1,name,exact:true}).waitFor();
        assert(await page.locator('script[type="application/ld+json"]').count()>0,'Product schema missing');
        for(const path of ['/cart','/checkout','/account','/admin']){
          await page.goto(base+path,{waitUntil:'domcontentloaded'});
          assert.match(await page.locator('meta[name="robots"]').first().getAttribute('content'),/noindex/,'Private indexing changed: '+path);
        }
        await page.goto(base+'/',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelector('#our-range')?.dataset.landingConfigStatus==='ready');
        const links=page.locator('.hidi-collection-link');assert.equal(await links.count(),5);
        for(let i=0;i<5;i++){
          const link=links.nth(i),label=await link.getAttribute('aria-label');
          const title=label.replace(/^Explore /,'').replace(/ - Photo [12]$/,'');
          assert(destinations[title],'Unrecognized caption: '+title);
          assert.equal(new URL(await link.getAttribute('href'),base).pathname,'/collections/'+destinations[title]);
        }
        // Activate each card through its real keyboard/click handler, not just its href.
        for(let i=0;i<5;i++){
          if(i){await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#our-range')?.dataset.landingConfigStatus==='ready');}
          const carousel=page.locator('#range-carousel');await carousel.press('Home');
          await page.waitForFunction(()=>document.querySelector('#range-carousel')?.dataset.activeIndex==='0');
          for(let n=0;n<i;n++)await carousel.press('ArrowRight');
          await page.waitForFunction(index=>document.querySelector('#range-carousel')?.dataset.activeIndex===String(index),i);
          const link=page.locator('.hidi-collection-link').nth(i),href=await link.getAttribute('href');
          await link.press('Enter');await page.waitForURL('**'+new URL(href,base).pathname);
          await page.locator('main article').first().waitFor();
        }
        await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('.hidi-collection-link').first().waitFor();
        await page.screenshot({path:`${output}/${engine}-${width}-homepage.png`});
        results.push({engine,width,height,collections:4,carouselLinks:5,carouselActivations:5,productDetails:true,privateNoindex:true,sortPreserved:true,status:'PASS'});
      }catch(error){await page.screenshot({path:`${output}/${engine}-${width}-failure.png`}).catch(()=>{});await writeFile(`${output}/${engine}-${width}-failure.html`,await page.content()).catch(()=>{});throw error;}
      finally{await context.close();}
    }}finally{await browser.close();}
  }
  assert.deepEqual(writes,[],'Unexpected commerce writes');assert.deepEqual(errors,[],'Browser runtime errors');
  const report={passed:true,engines,results,liveWrites:0,baselineCompared:Boolean(baseline)};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await probe(process.argv[2],process.argv[3]);
