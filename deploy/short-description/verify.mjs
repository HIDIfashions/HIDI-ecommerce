import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderProductCopy} from '../../apps/web/lib/product-copy.mjs';
const engines=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const live=process.argv.includes('--live'),origin='https://hidiindia.com',slug='hidi-043-dusty-pink-embroidered-kurta-set-with-dupatta';
const real=await fetch(origin+'/api/store/products/'+slug).then(r=>{assert(r.ok);return r.json();});
assert(real.shortDescription?.trim(),'HIDI-043 must have the saved description');
const product=structuredClone(real);product.images=[];for(const v of product.variants)v.images=[];
const base=live?origin:'http://127.0.0.1:3199',out='evidence/short-description';await mkdir(out,{recursive:true});
let upstream,child,diagnostics='';const cases=[];let blockedWrites=0;
try{
 if(!live){
  upstream=createServer((req,res)=>{
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   const path=new URL(req.url,base).pathname;
   const data=path===`/v1/products/${slug}`?product:path.includes('/reviews/products/')?{averageRating:0,reviewCount:0,verifiedReviewCount:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0},reviews:[]}:path==='/v1/products'?[product]:path==='/v1/categories'?[product.category]:path==='/v1/collections'?product.collections:[];
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));
  });await new Promise(done=>upstream.listen(4199,'127.0.0.1',done));
  const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME);
  child=spawn(process.execPath,[root+'/server.mjs'],{cwd:root,env:{...process.env,PORT:'3199',HOSTNAME:'127.0.0.1',API_URL:'http://127.0.0.1:4199/v1',INTERNAL_API_URL:'http://127.0.0.1:4199/v1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',()=>{});child.stderr.on('data',d=>diagnostics=(diagnostics+d).slice(-1500));
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,500));}assert(ready,diagnostics);
 }
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
  const browser=await engines[engine].launch();
  try{for(const width of [390,768,1440]){
   product.shortDescription=real.shortDescription;
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const request=route.request();if(!['GET','HEAD','OPTIONS'].includes(request.method())){blockedWrites++;return route.fulfill({status:204,body:''});}
    if(!live&&!['127.0.0.1','localhost'].includes(new URL(request.url()).hostname))return route.abort();return route.continue();
   });
   await page.goto(base+'/products/'+slug,{waitUntil:'domcontentloaded'});
   await page.locator('[data-hidi-hydrated=true]').waitFor();
   const block=page.locator('.hidi-pdp-short-description');await block.waitFor();
   assert.equal(await block.count(),1);assert.equal(await block.innerHTML(),renderProductCopy(real.shortDescription));
   const geometry=await page.evaluate(()=>{const block=document.querySelector('.hidi-pdp-short-description').getBoundingClientRect(),title=document.querySelector('.pdp-title-row').getBoundingClientRect(),price=document.querySelector('.pdp-price').getBoundingClientRect();return {afterTitle:block.top>=title.bottom,beforePrice:block.bottom<=price.top,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert(geometry.afterTitle&&geometry.beforePrice&&!geometry.overflow,JSON.stringify(geometry));
   const size=page.locator('.sizes button:not(:disabled)').first();await size.click();await page.waitForFunction(()=>document.querySelector('.sizes button.selected'));assert.equal(await block.innerHTML(),renderProductCopy(real.shortDescription));
   if(live&&engine==='chromium'){await page.locator('.pdp-gallery img:visible').first().evaluate(image=>image.decode());if(width===390)await block.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/live-'+width+'.png',fullPage:false});}
   if(!live&&width===390){
    for(const value of [null,'','  \n ','Updated admin short description','**Cotton**\n- Soft fabric\n- Easy care','<img src=x onerror=alert(1)>']){
     product.shortDescription=value;await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-hidi-hydrated=true]').waitFor();
     if(!value?.trim())assert.equal(await block.count(),0,'Blank admin value must create no block');
     else{assert.equal(await block.innerHTML(),renderProductCopy(value));assert.equal(await block.locator('img,script').count(),0);}
    }
    product.shortDescription=real.shortDescription;await page.reload();await block.waitFor();assert.equal(await block.innerHTML(),renderProductCopy(real.shortDescription));
   }
   assert.deepEqual(errors,[],'No hydration/runtime errors');cases.push({engine,width,...geometry,savedAdminTextMatches:true,sizeSelectionPassed:true,emptyAndFormattedTextPassed:!live&&width===390});await page.close();
  }
  // The short description is present before JavaScript runs, not added by a delayed fetch.
  const page=await browser.newPage({javaScriptEnabled:false});await page.goto(base+'/products/'+slug);assert.equal(await page.locator('.hidi-pdp-short-description').innerHTML(),renderProductCopy(real.shortDescription));await page.close();
  }finally{await browser.close();}
 }
 await writeFile(out+'/'+(live?'live':'candidate')+'.json',JSON.stringify({passed:true,cases,productionWrites:0,blockedWrites,actualRuntime:!live,serverRendered:true},null,2));console.log(JSON.stringify({passed:true,mode:live?'live':'candidate',cases:cases.length}));
}finally{if(child&&child.exitCode===null)child.kill('SIGTERM');if(upstream)await new Promise(done=>upstream.close(done));}
