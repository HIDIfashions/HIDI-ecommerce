import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
import {navigate} from '../collection-cleanup/navigation.mjs';
const pw=await import(process.env.HIDI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href:'playwright');
export async function probe(base,output,{overlay=false,publicConfig,engines=process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit'}={}){
 await mkdir(output,{recursive:true});const cases=[],writes=[],gatewayRetries=[],errors=[];
 for(const engine of engines.split(',')){const browser=await pw[engine].launch({headless:true});try{for(const width of [375,1440])for(const delayed of [false,true])for(const entry of ['/cart','/checkout']){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage();let release;const gate=new Promise(done=>release=done);let released=!delayed;
  const pending=new Set();let activity=Date.now();
  page.on('request',r=>{if(['fetch','xhr'].includes(r.resourceType())&&new URL(r.url()).origin===base){pending.add(r);activity=Date.now();}});
  for(const event of ['requestfinished','requestfailed'])page.on(event,r=>{if(pending.delete(r))activity=Date.now();});
  const settle=async()=>{const start=Date.now();while(Date.now()-start<30000){if(!pending.size&&Date.now()-Math.max(start,activity)>=600)return;await new Promise(done=>setTimeout(done,50));}throw Error('Application requests did not settle: '+[...pending].map(r=>r.url()).join(', '));};
  const localErrors=[];page.on('pageerror',e=>localErrors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|Minified React error/i.test(m.text()))localErrors.push(m.text());});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;
   if(url.origin===base&&publicConfig&&Object.hasOwn(publicConfig,path))return route.fulfill({contentType:'application/json',body:JSON.stringify(publicConfig[path])});
   if(overlay&&url.origin===base&&path==='/pricing-assets/storefront.mjs')return route.fulfill({contentType:'application/javascript',body:await readFile(new URL('../pricing/storefront.mjs',import.meta.url),'utf8')});
   if(!['GET','HEAD','OPTIONS'].includes(req.method())){if(isBlockedTelemetry(req.method(),req.url(),base))return route.fulfill({status:204,body:''});writes.push({method:req.method(),path});return route.fulfill({status:403,contentType:'application/json',body:'{}'});}
   if(url.origin===base&&/^\/api\/store\/carts\//.test(path))return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[],itemCount:0,subtotalPaise:0,totalPaise:0})});
   if(req.resourceType()==='script'&&url.origin!==base)return route.fulfill({contentType:'application/javascript',body:''});
   if(['image','media'].includes(req.resourceType()))return route.abort();
   if(!released&&req.resourceType()==='script'&&url.origin===base&&path.startsWith('/_next/static/chunks/'))await gate;
   return route.continue();
  });
  try{const paths=entry==='/cart'?['/cart','/checkout']:['/checkout','/cart'];for(const path of paths){
   if(released)await settle();
   // Only the first document is gated; subsequent paths test normal full navigation.
   if(delayed&&!released){const response=await page.goto(base+path,{waitUntil:'commit'});assert(response.ok());await page.locator('[data-hidi-price-note]').waitFor();assert.equal(await page.locator('main [data-hidi-price-note]').count(),0);await page.waitForTimeout(300);released=true;release();await page.waitForLoadState('domcontentloaded');}
   else await navigate(page,base+path,gatewayRetries);
   await page.locator('h1').waitFor();await page.locator('[data-hidi-price-note]').waitFor();await page.waitForFunction(()=>Boolean(localStorage.getItem('hidi_cart_session')));await settle();
   assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('[data-hidi-price-note]').count(),1);assert.equal(await page.locator('main [data-hidi-price-note]').count(),0);assert.match(await page.locator('[data-hidi-price-note]').innerText(),/prices already include 15% off/);
   await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);
   if(path==='/checkout'){const geometry=await page.evaluate(()=>({note:document.querySelector('[data-hidi-price-note]').getBoundingClientRect().toJSON(),header:document.querySelector('header').getBoundingClientRect().toJSON(),heading:document.querySelector('h1').getBoundingClientRect().toJSON()}));assert(geometry.note.top>=geometry.header.bottom-1,'Discount note clears fixed checkout header');assert(geometry.note.bottom<=geometry.heading.top,'Discount note does not cover heading');}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/${engine}-${width}-${delayed?'delayed':'normal'}-entry-${entry.slice(1)}-${path.slice(1)}.png`});
  }
  // Exercise React client navigation away and Back; campaign copy must follow route.
  const home=page.locator('header .wordmark');await home.focus();await page.keyboard.press('Enter');await page.waitForURL(base+'/');await page.waitForFunction(()=>!document.querySelector('[data-hidi-price-note]'));await settle();await page.goBack();await page.waitForURL(base+paths.at(-1));await page.locator('[data-hidi-price-note]').waitFor();await settle();
  assert.deepEqual(localErrors,[]);cases.push({engine,width,delayed,entry,passed:true,cartAndCheckout:true,noteOutsideReact:true,clientNavigation:true});console.log('HYDRATION_CASE',JSON.stringify(cases.at(-1)));
  }catch(error){await writeFile(`${output}/${engine}-${width}-${delayed}-failure.html`,await page.content());throw error;}finally{release();errors.push(...localErrors);await context.close();}
 }}finally{await browser.close();}}
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);const result={passed:true,cases,runtimeErrors:errors,productionWrites:0,gatewayRetries};await writeFile(output+'/report.json',JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await probe(process.argv[2]||'https://hidiindia.com',process.argv[3]||'evidence/checkout-hydration/local',{overlay:process.env.HIDI_LOCAL_OVERLAY==='1'});
