import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const engines=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const baseline=process.argv.includes('--baseline'),live=baseline||process.argv.includes('--live'),candidate=Boolean(process.env.HIDI_CANDIDATE_RUNTIME)&&!live;
const base=live?'https://hidiindia.com':candidate?'http://127.0.0.1:3199':'http://127.0.0.1:3198';
const out=resolve('evidence/typography');await mkdir(out,{recursive:true});
const cases=[], routes=[];
const progress=message=>console.log(new Date().toISOString()+' '+message);
// Terminate disposable browser processes after assertions; graceful shutdown can hang on live media.
let child,upstream,diagnostics='',blockedWrites=0;
const slug='hidi-043-dusty-pink-embroidered-kurta-set-with-dupatta';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<80;i++){if(await fn())return;await sleep(100);}throw Error('Timed out: '+label);}
try{
 if(!live){
  if(candidate){
   const real=await fetch('https://hidiindia.com/api/store/products/'+slug).then(r=>{assert(r.ok);return r.json();});
   const product=structuredClone(real);product.images=[];for(const v of product.variants)v.images=[];
   upstream=createServer((req,res)=>{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const p=new URL(req.url,base).pathname;
    const data=p===`/v1/products/${slug}`?product:p.includes('/reviews/products/')?{averageRating:0,reviewCount:0,verifiedReviewCount:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0},reviews:[]}:p==='/v1/products'?[product]:p==='/v1/categories'?[product.category]:p==='/v1/collections'?product.collections:p.includes('/carts/')?{items:[],itemCount:0,totalPaise:0}:p.includes('/health')?{status:'ok'}:[];
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));});await new Promise(done=>upstream.listen(4199,'127.0.0.1',done));
   const runtime=resolve(process.env.HIDI_CANDIDATE_RUNTIME);
   const env={...process.env,PORT:'3199',HOSTNAME:'127.0.0.1',API_URL:'http://127.0.0.1:4199/v1',INTERNAL_API_URL:'http://127.0.0.1:4199/v1',AZURE_STORAGE_ACCOUNT:'typographyfixture',PUBLIC_HTML_CACHE_TTL_MS:'0'};
   delete env.IDENTITY_ENDPOINT;delete env.IDENTITY_HEADER;delete env.AZURE_STORAGE_BLOB_ENDPOINT;
   child=spawn(process.execPath,['--import',resolve('tests/typography-runtime-fixture.mjs'),runtime+'/server.mjs'],{cwd:runtime,env,stdio:['ignore','pipe','pipe']});
  }else child=spawn(process.execPath,['tests/typography-fixture.mjs','--serve'],{stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>diagnostics=(diagnostics+b).slice(-3000));child.stderr.on('data',b=>diagnostics=(diagnostics+b).slice(-3000));
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/admin/typography')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)break;await sleep(500);}assert(ready,diagnostics);
 }
 if(!baseline){const response=await fetch(base+'/api/hidi/typography/admin');assert.equal(response.status,401,'Private settings reject anonymous reads');}
 const publicBefore=baseline?null:await fetch(base+'/api/hidi/typography').then(r=>{assert(r.ok,'Public typography backend must be available');return r.json();});
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
  progress(engine+' launch');const server=await engines[engine].launchServer({timeout:30000});const browser=await engines[engine].connect(server.wsEndpoint());
  try{
   if(!baseline){progress(engine+' anonymous editor');const anonymous=await browser.newPage();anonymous.setDefaultTimeout(15000);await anonymous.goto(base+'/admin/typography',{waitUntil:'domcontentloaded'});await anonymous.getByText(/Sign in as the owner/).waitFor();assert(await anonymous.locator('#ht-heading').isDisabled(),'Anonymous font selector is disabled');assert(await anonymous.locator('#ht-publish').isDisabled(),'Anonymous publication is disabled');await anonymous.close();}
   const context=await browser.newContext();context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(20000);
   await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(!live&&!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();if(!['GET','HEAD','OPTIONS'].includes(req.method())&&(live||url.pathname!=='/api/hidi/typography/admin')){blockedWrites++;return route.fulfill({status:204,body:''});}return route.continue();});
   if(!live)await context.addCookies([{name:'typography-owner',value:'1',url:base}]);
   for(const width of baseline?[]:[390,768,1440]){
    progress(engine+' editor '+width);const editor=await context.newPage();await editor.setViewportSize({width,height:1000});const errors=[];editor.on('pageerror',e=>errors.push(e.message));
    await editor.goto(base+'/admin/typography',{waitUntil:'domcontentloaded'});await editor.locator('#ht-heading').waitFor();
    if(live){await editor.getByText(/Sign in as the owner/).waitFor();assert(await editor.locator('#ht-heading').isDisabled());}
    else{
     await until(()=>editor.locator('#ht-heading').isEnabled(),'owner settings loaded');
     // Start each case from a known published System profile.
     await editor.locator('#ht-preset').selectOption('classic');await editor.locator('#ht-save').click();await until(()=>editor.locator('#ht-publish').isEnabled(),'saved classic draft');await editor.locator('#ht-publish').click();await until(()=>editor.locator('#ht-publish').isEnabled(),'classic publish complete');
     const visitor=await context.newPage();await visitor.setViewportSize({width,height:1000});
     const path=candidate?'/products/'+slug:'/product';await visitor.goto(base+path,{waitUntil:'domcontentloaded'});
     const title=visitor.locator('.pdp-title-row h1');await title.waitFor();
     if(candidate)await visitor.locator('[data-hidi-hydrated=true]').waitFor();
     const original=await title.evaluate(e=>getComputedStyle(e).fontFamily);
     const input=visitor.locator('input').first();const inputBefore=await input.count()?await input.inputValue():null;
     await editor.locator('#ht-preset').selectOption('editorial');await editor.locator('#ht-product').selectOption('manrope');await editor.locator('#ht-ui').selectOption('lora');await editor.locator('#ht-save').click();await until(()=>editor.locator('#ht-publish').isEnabled(),'editorial saved');
     await visitor.evaluate(()=>window.dispatchEvent(new Event('focus')));await sleep(150);assert.equal(await title.evaluate(e=>getComputedStyle(e).fontFamily),original,'Save draft must not alter visitor fonts');
     await editor.locator('#ht-publish').click();await until(()=>editor.locator('#ht-publish').isEnabled(),'editorial published');
     await visitor.evaluate(()=>window.dispatchEvent(new Event('focus')));await until(async()=>/HIDI Manrope/.test(await title.evaluate(e=>getComputedStyle(e).fontFamily)),'published product font propagates without reload');
     assert.match(await visitor.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/HIDI Inter/);
     assert(await visitor.evaluate(async()=>{await document.fonts.ready;return document.fonts.check('16px "HIDI Manrope"');}));
     assert.equal(await visitor.locator('#hidi-published-typography').count(),1,'Exactly one applied stylesheet');if(inputBefore!==null)assert.equal(await input.inputValue(),inputBefore,'Font refresh preserves form input');assert.match(await visitor.locator('button').first().evaluate(e=>getComputedStyle(e).fontFamily),/HIDI Lora/,'Button font is independent of body and product roles');
     if(candidate){const size=visitor.locator('.sizes button:not(:disabled)').first();await size.click();await visitor.locator('.sizes button.selected').waitFor();}
     await visitor.reload();await until(async()=>/HIDI Manrope/.test(await title.evaluate(e=>getComputedStyle(e).fontFamily)),'published font survives reload');
     await editor.locator('[data-profile=admin]').click();await editor.locator('#ht-preset').selectOption('modern');await editor.locator('#ht-save').click();await until(()=>editor.locator('#ht-publish').isEnabled(),'admin draft saved');await editor.locator('#ht-publish').click();await until(()=>editor.locator('#ht-publish').isEnabled(),'admin published');
     await editor.evaluate(()=>window.dispatchEvent(new Event('focus')));await until(async()=>/HIDI Manrope/.test(await editor.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily)),'admin font applied');
     await visitor.evaluate(()=>window.dispatchEvent(new Event('focus')));await sleep(150);assert.match(await title.evaluate(e=>getComputedStyle(e).fontFamily),/HIDI Manrope/,'Admin publication leaves storefront profile unchanged');
     await editor.locator('[data-profile=storefront]').click();editor.once('dialog',d=>d.accept());await editor.locator('#ht-rollback').click();await until(()=>editor.locator('#ht-publish').isEnabled(),'rollback complete');
     await visitor.evaluate(()=>window.dispatchEvent(new Event('focus')));await until(async()=>!/HIDI Manrope/.test(await title.evaluate(e=>getComputedStyle(e).fontFamily)),'rollback propagates');
     // Re-publish and simulate stylesheet download failure; the visitor keeps its old fonts.
     await visitor.route('**/typography/published.css?*',route=>route.abort());await editor.locator('#ht-publish').click();await until(()=>editor.locator('#ht-publish').isEnabled(),'republish');await visitor.evaluate(()=>window.dispatchEvent(new Event('focus')));await sleep(300);assert.doesNotMatch(await title.evaluate(e=>getComputedStyle(e).fontFamily),/HIDI Manrope/);await visitor.unroute('**/typography/published.css?*');await visitor.evaluate(()=>window.dispatchEvent(new Event('focus')));await until(async()=>/HIDI Manrope/.test(await title.evaluate(e=>getComputedStyle(e).fontFamily)),'retry after stylesheet failure');
     assert.equal(await visitor.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No product page overflow');
     await visitor.close();
    }
    assert.equal(await editor.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No editor overflow');
    assert.deepEqual(errors,[],'No editor JavaScript errors');
    await editor.screenshot({path:out+'/'+(live?'live':'candidate')+'-'+engine+'-'+width+'.png',fullPage:true,timeout:15000,animations:'disabled'});
    cases.push({engine,width,editor:true,publishedPropagation:!live,rollback:!live,failedStylesheetRetention:!live,profileIsolation:!live});await editor.close();
   }
   if(candidate||live){for(const path of ['/','/collections/all','/cart','/checkout','/account','/admin/sign-in','/admin','/admin/products']){progress(engine+' route '+path);const page=await context.newPage();await page.goto(base+path,{waitUntil:'domcontentloaded'});progress(engine+' loaded '+page.url());if(!baseline){await page.locator('#hidi-published-typography').waitFor({state:'attached'}).catch(async error=>{await writeFile(out+'/missing-style-'+engine+'.json',JSON.stringify({requested:path,url:page.url(),html:await page.content()},null,2));throw error;});progress(engine+' stylesheet attached '+page.url());assert.equal(await page.locator('html').getAttribute('data-hidi-type-scope'),path.startsWith('/admin')?'admin':'storefront');}if(candidate)await until(async()=>/HIDI Inter/.test(await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily)),'published body font on '+path);for(const width of [390,768,1440]){progress(engine+' viewport '+path+' '+width);await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Overflow '+path+' at '+width);routes.push({engine,path,width,fonts:!live});}progress(engine+' close page '+path);await page.close();}}
   progress(engine+' no-JavaScript product');const nojs=await browser.newPage({javaScriptEnabled:false});nojs.setDefaultTimeout(15000);await nojs.goto(base+(candidate||live?'/products/'+slug:'/product'),{waitUntil:'domcontentloaded'});if(!baseline)assert.equal(await nojs.locator('#hidi-published-typography').count(),1,'CSS is present before JavaScript');await nojs.close();
   progress(engine+' close context');await context.close();
  }catch(error){progress(engine+' failure: '+error.stack);throw error;}finally{progress(engine+' close browser');await server.kill();progress(engine+' done');}
 }
 if(live&&!baseline){const after=await fetch(base+'/api/hidi/typography').then(r=>r.json());assert.deepEqual(after,publicBefore,'Live checks must not modify typography');}
 const result={passed:true,cases,routes,actualRuntime:candidate,serverRendered:true,productionWrites:0,blockedWrites,mode:baseline?'baseline':live?'live':candidate?'candidate':'fixture'};
 await writeFile(out+'/'+(baseline?'baseline':live?'live':candidate?'candidate':'fixture')+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{if(child&&child.exitCode===null)child.kill('SIGTERM');if(upstream){upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}}
