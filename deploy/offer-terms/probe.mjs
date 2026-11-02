import assert from 'node:assert/strict';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
export async function probe(fixture){
 const approved=JSON.parse(await readFile(new URL('./approved.json',import.meta.url),'utf8'));
 const base=fixture.base,headers={Cookie:'hidi_admin_access=owner',Origin:base,'Content-Type':'application/json'};
 const action=async body=>{const s=await(await fetch(base+'/api/hidi/offers/admin',{headers})).json();const r=await fetch(base+'/api/hidi/offers/admin',{method:'POST',headers,body:JSON.stringify({...body,etag:s.etag})});assert(r.ok,await r.clone().text());return r.json();};
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),results=[];await mkdir('evidence/offer-terms',{recursive:true});
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){const browser=await pw[engine].launch({headless:true});try{for(const width of [390,1440]){
  await fixture.reset();fixture.setSubtotal(399900);
  for(const code of ['WELCOME250','GET1']){const state=await(await fetch(base+'/api/hidi/offers/admin',{headers})).json();await action({action:'save',offerCode:code,draft:{...state.offers[code].draft,...approved[code],checkoutEnabled:true,landingEnabled:true}});await action({action:'publish',offerCode:code,confirm:true});}
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];let quoteRequests=0,payments=0;
  page.on('pageerror',e=>errors.push({message:e.message,path:new URL(page.url()).pathname}));await context.addInitScript(()=>{localStorage.setItem('hidi_cart_session','promo-fixture-session');localStorage.setItem('hidi_supabase_session',JSON.stringify({access_token:'selected',expires_at:Date.now()/1000+3600,user:{id:'fixture-user',phone:'+919000000001'}}));});
  await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==base||req.resourceType()==='media')return route.abort();if(u.pathname.endsWith('/offers/quote'))quoteRequests++;if(u.pathname.endsWith('/checkout/prepare')){payments++;return route.abort();}return route.continue();});
  try{for(const path of ['/','/checkout']){
   await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.locator('[data-offer-terms="GET1"]').waitFor();assert.equal(await page.locator('[data-offer-terms]').count(),2);
   if(path==='/')assert.equal(await page.locator('.hidi-promotion-card').count(),2);else assert.equal(await page.locator('#hidi-coupon-code').inputValue(),'');
   const priceText=()=>page.locator('main').innerText().then(t=>t.match(/₹[\d,]+(?:\.\d+)?/g));const before=await priceText();
   for(const code of ['WELCOME250','GET1']){const button=page.getByRole('button',{name:code+' terms and conditions',exact:true});await button.focus();await page.keyboard.press('Enter');const dialog=page.locator('.hidi-promotion-dialog[open]');await dialog.waitFor();const text=await dialog.innerText();assert(text.includes('Returns & exchanges'));assert(text.includes('7 days'));assert(!text.includes('first 25'));assert.equal(text.includes('you must pay the remaining balance'),code==='GET1');assert.equal(text.includes('cannot be returned for a change of mind'),code==='GET1');await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await button.evaluate(e=>e===document.activeElement),true);}
   assert.deepEqual(await priceText(),before);assert.equal(quoteRequests,0);assert.equal(payments,0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`evidence/offer-terms/${engine}-${width}-${path==='/'?'landing':'checkout'}.png`});
  }
  // Preserve coupon assistance: reading terms never selects or applies a code.
  await page.getByRole('button',{name:'GET1',exact:true}).click();assert.equal(await page.locator('#hidi-coupon-code').inputValue(),'GET1');assert.equal(quoteRequests,0);
  await page.getByRole('button',{name:'Apply',exact:true}).click();const picker=page.getByRole('dialog',{name:'Choose your extra dress for ₹1',exact:true});await picker.waitFor();await picker.getByRole('button',{name:'Close picker',exact:true}).click();
  assert.equal(await page.locator('[data-offer-terms="WELCOME250"]').count(),0);await page.getByRole('button',{name:'GET1 terms and conditions',exact:true}).click();await page.getByRole('button',{name:'Got it',exact:true}).click();assert.equal(await page.locator('#hidi-coupon-code').inputValue(),'GET1');
  // Independent visibility and publication remain authoritative.
  const s=await(await fetch(base+'/api/hidi/offers/admin',{headers})).json();await action({action:'save',offerCode:'GET1',draft:{...s.offers.GET1.draft,landingEnabled:false}});assert.equal((await(await fetch(base+'/api/hidi/offers/details?placement=landing')).json()).entries.length,2);await action({action:'publish',offerCode:'GET1',confirm:true});await page.goto(base+'/');await page.locator('[data-offer-terms="WELCOME250"]').waitFor();assert.equal(await page.locator('[data-offer-terms="GET1"]').count(),0);assert.equal((await(await fetch(base+'/api/hidi/offers/checkout-policy')).json()).dressEnabled,true);
  // The retained homepage already reports this transient WebKit layout notice
  // (header-theme/probe.mjs, portrait-order/regression.mjs). Record it separately,
  // permit it only on the homepage, and require stable visible offer geometry.
  const layoutNotices=errors.filter(e=>engine==='webkit'&&e.path==='/'&&e.message==='ResizeObserver loop completed with undelivered notifications.');
  assert(layoutNotices.length<=2,'Repeated layout notifications');assert.deepEqual(errors.filter(e=>!layoutNotices.includes(e)),[]);
  const boxes=await page.locator('[data-hidi-offer-strip]').evaluate(async e=>{const samples=[];for(let i=0;i<3;i++){await new Promise(r=>requestAnimationFrame(r));const b=e.getBoundingClientRect();samples.push([b.x,b.y,b.width,b.height]);}return samples;});assert.deepEqual(boxes[1],boxes[2]);assert(boxes[2][2]>0&&boxes[2][3]>0);
  results.push({engine,width,independentTerms:true,returnRules:true,keyboardFocus:true,noAutomaticApplication:true,unchangedTotals:true,visibilityRespected:true,layoutStable:true,layoutNotices});console.log('PASS offer terms '+engine+' '+width);
  }catch(e){await page.screenshot({path:`evidence/offer-terms/${engine}-${width}-failure.png`}).catch(()=>{});throw e;}finally{await context.close();}
 }}finally{await browser.close();}}
 await writeFile('evidence/offer-terms/regression.json',JSON.stringify({passed:true,actualRuntime:true,productionWrites:0,results},null,2));
}
