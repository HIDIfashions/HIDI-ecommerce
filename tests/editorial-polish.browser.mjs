/** Additional production-build checks; private localhost fixtures, no live transactions. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const output = resolve('test-results/editorial-storefront/polish'); await mkdir(output, {recursive:true});
const base='http://127.0.0.1:3117', api='http://127.0.0.1:4117/v1';
const products=['ira-beige-office-kurta-set','myra-peach-comfort-kurta-set'].map((slug,i)=>({id:`polish-${i}`,slug,name:`HIDI ${i ? 'Peach' : 'Ivory'} embroidered everyday kurta set`,fabric:'Fixture only',description:'Isolated test catalogue',collections:[],inStock:true,minPricePaise:149900,maxPricePaise:149900,images:['01-main.png','03-detail.png'].map((name,n)=>({id:`image-${i}-${n}`,url:`/products/${slug}/${name}`,position:n,alt:n?'Garment detail':'Front view'})),variants:[{id:`variant-${i}`,sku:`QA-${i}`,size:'M',color:i?'Peach':'Ivory',available:2,pricePaise:149900,mrpPaise:199900}]}));
const writes=[],results=[];let browser,log='';
const upstream=createServer((req,res)=>{if(req.method!=='GET')writes.push({method:req.method,url:req.url});const data=req.url.startsWith('/v1/products')?products:{items:[],itemCount:0,subtotalPaise:0};res.writeHead(req.method==='GET'?200:405,{'Content-Type':'application/json'});res.end(JSON.stringify(data));});
await new Promise(done=>upstream.listen(4117,'127.0.0.1',done));
const server=spawn(process.execPath,[resolve('apps/web/node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','3117'],{cwd:resolve('apps/web'),env:{...process.env,NODE_ENV:'production',API_URL:api,INTERNAL_API_URL:api,HIDI_HERO_VIDEO_URL:''},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',data=>log+=data);server.stderr.on('data',data=>log+=data);
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function until(check,label,timeout=10000){const start=Date.now();while(!(await check())){assert(Date.now()-start<timeout,`Timeout: ${label}`);await sleep(50);}}
try{
 await until(async()=>{try{return(await fetch(base+'/healthz',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},'Next readiness',60000);
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium').split(',')){
  browser=await pw[engine].launch({headless:true});
  for(const mode of ['phone','desktop','save-data']){
   const context=await browser.newContext({viewport:mode==='phone'?{width:390,height:844}:{width:1440,height:1000},hasTouch:mode==='phone',reducedMotion:'reduce'});
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   if(mode==='save-data')await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{configurable:true,value:Object.assign(new EventTarget(),{saveData:true,effectiveType:'4g'})}));
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(base,{waitUntil:'networkidle'});const first=page.locator('[data-editorial-product]').first();
    await until(()=>first.locator('button[aria-pressed]').isEnabled(),'hydration');
    assert.equal(await page.locator('[data-deferred-detail] img').count(),0,'Hidden detail images must not be mounted before intent');
    assert.equal(await page.locator('[data-editorial-product] dialog h2').count(),0,'Closed modal bodies must not be mounted');
    if(mode==='phone'){
     const hero=await page.locator('[data-section="hero"]').boundingBox();assert(hero.height>=560&&hero.height<=640,'Phone hero remains compact');
     await page.locator('[data-section="featured"]').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-deferred-detail] img').count(),0,'Touch scrolling must not request hidden detail media');
     await first.getByRole('button',{name:'Quick add',exact:true}).tap();const dialog=page.locator('dialog[open]');await dialog.getByRole('heading').waitFor();assert.equal(await dialog.getByRole('button',{name:'Add to bag',exact:true}).isDisabled(),true);
     await page.screenshot({path:resolve(output,`${engine}-phone-quick-add.png`)});await dialog.getByRole('button',{name:'Close quick add',exact:true}).tap();await until(()=>page.locator('[data-editorial-product] dialog h2').count().then(n=>n===0),'modal content cleanup');
     await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(output,`${engine}-phone-home.png`)});
    }else{
     const edit=page.locator('[data-section="edits"] a').first();await edit.hover();
     if(mode==='save-data'){await sleep(200);assert.equal(await page.locator('[data-deferred-detail] img').count(),0,'Save-Data must suppress decorative image loads');}
     else{
      await until(()=>edit.locator('[data-detail-ready="true"] img').count().then(n=>n===1),'hover detail decoded');assert.equal(await edit.locator('[data-deferred-detail]').evaluate(el=>getComputedStyle(el).opacity),'1');
      await page.mouse.move(0,0);assert.equal(await edit.locator('[data-deferred-detail]').evaluate(el=>getComputedStyle(el).opacity),'0');
      await page.getByRole('button',{name:'Search',exact:true}).click();const search=page.getByRole('dialog',{name:'Search HIDI',exact:true});const discovery=search.locator('[aria-label="Discover HIDI products"]');await discovery.waitFor();assert.equal(await discovery.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
      await page.screenshot({path:resolve(output,`${engine}-search.png`)});await search.getByRole('button',{name:'Close search'}).click();
     }
     await page.evaluate(()=>scrollTo(0,900));await page.locator('.site-header .wordmark').click();assert(await page.evaluate(()=>scrollY<2),'Reduced-motion logo scroll must be immediate');
    }
    assert.deepEqual(errors,[]);results.push({engine,mode,status:'PASS'});console.log(`PASS editorial polish ${engine} ${mode}`);
   }catch(error){results.push({engine,mode,status:'FAIL',error:String(error.stack||error)});await page.screenshot({path:resolve(output,`${engine}-${mode}-failure.png`)}).catch(()=>{});console.error(`FAIL editorial polish ${engine} ${mode}: ${error}`);}
   finally{await context.close();}
  }
  await browser.close();browser=null;
 }
 assert.deepEqual(writes,[],'This suite is read-only');
}finally{
 if(browser)await browser.close();server.kill('SIGTERM');upstream.closeAllConnections();await new Promise(done=>upstream.close(done));
 await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Production build with isolated read-only fixtures',results,writes},null,2));await writeFile(resolve(output,'server.log'),log);
}
assert.equal(results.filter(result=>result.status==='FAIL').length,0,JSON.stringify(results));
console.log(`${results.length}/${results.length} editorial-polish browser checks passed.`);
