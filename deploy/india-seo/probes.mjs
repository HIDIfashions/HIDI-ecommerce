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
  const results=[],writes=[],errors=[];let blockedSessionRefreshes=0,blockedTelemetryRequests=0,isolatedTrackingScripts=0,hydrationRetries=0;
  landing ||= await (await fetch('https://hidiindia.com/api/hidi/landing-media-config')).json();
  let offers;
  if(baseline){const response=await fetch('https://hidiindia.com/api/hidi/offers',{signal:AbortSignal.timeout(30000)});assert(response.ok);offers=await response.json();}
  for(const engine of engines){
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try{for(const [width,height] of [[320,740],[390,844],[1440,900]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<700,reducedMotion:'reduce',extraHTTPHeaders:{'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(!['GET','HEAD'].includes(request.method())){
          // Admin bootstraps a session refresh without a body. It stays blocked
          // like every write; record it separately from commerce mutations.
          if(request.method()==='PUT'&&url.pathname==='/api/admin/session'&&[base,baseline].includes(url.origin)&&!request.postData()){
            blockedSessionRefreshes++;return route.abort();
          }
          const googleBeacon=request.method()==='POST'&&/(^|\.)(?:google-analytics\.com|analytics\.google\.com)$/.test(url.hostname)&&['/g/collect','/collect'].includes(url.pathname);
          const cloudflareBeacon=request.method()==='POST'&&/(^|\.)cloudflareinsights\.com$/.test(url.hostname)&&url.pathname==='/cdn-cgi/rum';
          if(isBlockedTelemetry(request.method(),request.url(),base)||googleBeacon||cloudflareBeacon){
            blockedTelemetryRequests++;
            return route.fulfill({status:204,headers:{'access-control-allow-origin':request.headers().origin||new URL(base).origin,'access-control-allow-credentials':'true'}});
          }
          writes.push({method:request.method(),origin:url.origin,path:url.pathname});
          return route.abort();
        }
        if(request.resourceType()==='script'&&/(^|\.)(?:googletagmanager\.com|google-analytics\.com|analytics\.google\.com|cloudflareinsights\.com)$/.test(url.hostname)){
          isolatedTrackingScripts++;return route.fulfill({status:200,contentType:'application/javascript',body:'/* External tracking isolated during read-only SEO verification. */'});
        }
        if(url.pathname==='/api/hidi/landing-media-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(landing)});
        if(baseline&&url.pathname==='/api/hidi/offers')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(offers)});
        if(request.resourceType()==='media'||/razorpay\.com$/.test(url.hostname))return route.abort();
        return route.continue();
      });
      let page;
      const reads=new Map(),handlers=new Map();
      const fresh=async(stage,observe=true)=>{
        const p=await context.newPage();p.setDefaultTimeout(30000);
        if(observe){const handler=error=>errors.push({engine,width,stage,message:error.message});handlers.set(p,handler);p.on('pageerror',handler);}
        const pending=new Set();reads.set(p,pending);
        p.on('request',request=>{const url=new URL(request.url());if(request.method()==='GET'&&(url.pathname.startsWith('/api/store/')||url.pathname==='/api/admin/session'||url.pathname==='/api/hidi/offers'))pending.add(request);});
        for(const event of ['requestfinished','requestfailed'])p.on(event,request=>pending.delete(request));
        return p;
      };
      const settleReads=async p=>{
        const pending=reads.get(p);let quiet=0;
        for(let elapsed=0;elapsed<15000;elapsed+=50){
          await new Promise(done=>setTimeout(done,50));quiet=pending.size?0:quiet+50;if(quiet>=500)return;
        }
        assert.fail('Background reads did not settle: '+[...pending].map(request=>request.url()).join(', '));
      };
      const finish=async p=>{
        await settleReads(p);
        // Teardown is outside the completed scenario. Destroy its page rather
        // than hard-navigating a Next page with open speculative RSC streams.
        if(handlers.has(p))p.off('pageerror',handlers.get(p));
        await p.close();
      };
      const products=async p=>(await p.locator('main article h3 a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname))).sort();
      try{
        for(const slug of routes){
          const path='/collections/'+slug;
          page=await fresh(path);
          assert((await page.goto(base+path,{waitUntil:'domcontentloaded'})).ok());
          await page.getByRole('heading',{level:1,name:copy[slug].title,exact:true}).waitFor();
          await page.locator('main article').first().waitFor();
          await page.waitForLoadState('load',{timeout:60000});
          assert.equal(await page.locator('h1').count(),1);
          assert.equal(await page.locator('.hidi-collection-intro').innerText(),copy[slug].copy);
          const canonicals=await page.locator('link[rel="canonical"]').evaluateAll(nodes=>nodes.map(n=>n.href));
          assert(canonicals.length>0,'Canonical missing');
          assert(canonicals.every(href=>href==='https://hidiindia.com'+path),'Conflicting canonical: '+canonicals.join(', '));
          for(const content of await page.locator('meta[name="robots"],meta[name="googlebot"]').evaluateAll(nodes=>nodes.map(n=>n.content)))assert(!/noindex/.test(content));
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow: '+path);
          const expected=await products(page);assert(expected.length>0);
          if(inventory)assert.deepEqual(expected,inventory[slug].map(p=>'/products/'+p.slug).sort(),'Collection differs from frozen active inventory: '+slug);
          if(baseline){const prior=await fresh('baseline '+path,false);await prior.goto(baseline+path,{waitUntil:'domcontentloaded'});await prior.locator('main article').first().waitFor();assert.deepEqual(expected,await products(prior),'Product selection changed');await finish(prior);}
          if(width<700){
            const trigger=page.getByRole('button',{name:/Filter.*Sort/i});
            const filters=page.getByRole('dialog',{name:'Product filters'});
            for(let attempt=0;attempt<5&&!await filters.isVisible();attempt++){
              if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
              try{await filters.waitFor({state:'visible',timeout:3000});}catch(error){if(attempt===4)throw error;hydrationRetries++;}
            }
            await filters.getByRole('radio',{name:'Price: Low to high',exact:true}).check();
            await filters.getByRole('button',{name:'Close filters'}).click();
          }else await page.getByLabel('Sort products').selectOption({label:'Price: Low to high'});
          assert.deepEqual(await products(page),expected);
          await page.screenshot({path:`${output}/${engine}-${width}-${slug}.png`,fullPage:false});
          if(slug!==routes.at(-1))await finish(page);
        }
        const product=page.locator('main article h3 a').first(),name=await product.innerText();
        await settleReads(page);
        await product.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
        // The name is intentionally clipped with ellipsis; target visible text,
        // rather than WebKit's centre of the full untruncated inline anchor.
        await product.click({position:{x:8,y:8}});await page.waitForURL('**/products/**');
        await page.getByRole('heading',{level:1,name,exact:true}).waitFor();
        assert(await page.locator('script[type="application/ld+json"]').count()>0,'Product schema missing');
        await finish(page);
        for(const path of ['/cart','/checkout','/account','/admin']){
          page=await fresh(path);await page.goto(base+path,{waitUntil:'domcontentloaded'});
          await settleReads(page);
          assert.match(await page.locator('meta[name="robots"]').first().getAttribute('content'),/noindex/,'Private indexing changed: '+path);
          await finish(page);
        }
        page=await fresh('homepage links');await page.goto(base+'/',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelector('#our-range')?.dataset.landingConfigStatus==='ready');
        const links=page.locator('.hidi-collection-link');assert.equal(await links.count(),5);
        for(let i=0;i<5;i++){
          const link=links.nth(i),label=await link.getAttribute('aria-label');
          const title=label.replace(/^Explore /,'').replace(/ - Photo [12]$/,'');
          assert(destinations[title],'Unrecognized caption: '+title);
          assert.equal(new URL(await link.getAttribute('href'),base).pathname,'/collections/'+destinations[title]);
        }
        await finish(page);
        // Activate each card through its real keyboard/click handler, not just its href.
        for(let i=0;i<5;i++){
          page=await fresh('carousel card '+i);await page.goto(base+'/',{waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>document.querySelector('#our-range')?.dataset.landingConfigStatus==='ready');
          const carousel=page.locator('#range-carousel');await carousel.press('Home');
          await page.waitForFunction(()=>{const c=document.querySelector('#range-carousel');return c?.dataset.activeIndex==='0'&&c.dataset.transitioning==='false';});
          for(let n=0;n<i;n++){
            await carousel.press('ArrowRight');
            await page.waitForFunction(index=>{const c=document.querySelector('#range-carousel');return c?.dataset.activeIndex===String(index)&&c.dataset.transitioning==='false';},n+1);
          }
          const link=page.locator('.hidi-collection-link').nth(i),href=await link.getAttribute('href');
          await settleReads(page);
          await link.press('Enter');await page.waitForURL('**'+new URL(href,base).pathname);
          await page.locator('main article').first().waitFor();
          await finish(page);
        }
        page=await fresh('homepage screenshot');await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('.hidi-collection-link').first().waitFor();
        await page.screenshot({path:`${output}/${engine}-${width}-homepage.png`});
        await finish(page);
        results.push({engine,width,height,collections:4,carouselLinks:5,carouselActivations:5,productDetails:true,privateNoindex:true,sortPreserved:true,status:'PASS'});
        await writeFile(output+'/progress.json',JSON.stringify({results,errors,writes},null,2));
        console.log(`PASS: India SEO ${engine} ${width}x${height}: collections, inventory, sorting, product details, private indexing and five carousel activations`);
      }catch(error){if(page&&!page.isClosed()){await page.screenshot({path:`${output}/${engine}-${width}-failure.png`}).catch(()=>{});await writeFile(`${output}/${engine}-${width}-failure.html`,await page.content()).catch(()=>{});}await writeFile(`${output}/${engine}-${width}-failure.json`,JSON.stringify({message:String(error),url:page?.url(),errors,writes},null,2));throw error;}
      finally{await context.close();}
    }}finally{await browser.close();}
  }
  await writeFile(output+'/runtime-errors.json',JSON.stringify({errors,writes},null,2));
  assert.deepEqual(writes,[],'Unexpected commerce writes');assert.deepEqual(errors,[],'Browser runtime errors');
  const report={passed:true,engines,results,liveWrites:0,blockedSessionRefreshes,blockedTelemetryRequests,isolatedTrackingScripts,hydrationRetries,offersFixtureUsed:Boolean(baseline),independentPages:true,baselineCompared:Boolean(baseline)};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await probe(process.argv[2],process.argv[3]);
