import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
export async function probe(fixture,{output,actualRuntime=false}={}){
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),out=resolve(output);await mkdir(out,{recursive:true});
const base=fixture.base,results=[];let productionWrites=0;
const headers={Cookie:'hidi_admin_access=owner',Origin:base,'Content-Type':'application/json'};
const action=async body=>{const state=await(await fetch(base+'/api/hidi/offers/admin',{headers})).json();const r=await fetch(base+'/api/hidi/offers/admin',{method:'POST',headers,body:JSON.stringify({...body,etag:state.etag})});assert(r.ok,await r.clone().text());return r.json();};
for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await pw[engine].launch({headless:true});
 try{for(const width of [390,1440]){
  await fixture.reset();fixture.setSubtotal(399900);const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[];let prepares=[];
  await context.addCookies([{name:'hidi_admin_access',value:'owner',url:base,httpOnly:true}]);
  await context.addInitScript(()=>{localStorage.setItem('hidi_cart_session','promo-fixture-session');localStorage.setItem('hidi_supabase_session',JSON.stringify({access_token:'selected',expires_at:Date.now()/1000+3600,user:{id:'fixture-user',phone:'+919000000001'}}));});
  await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base){if(!['GET','HEAD'].includes(r.method()))productionWrites++;return r.resourceType()==='image'&&r.method()==='GET'?route.continue():route.abort();}if(u.pathname==='/api/store/checkout/prepare'){prepares.push(r.postDataJSON());return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Preview payment blocked'})});}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(25000);const requestFailures=[];
  page.on('pageerror',e=>errors.push({message:e.message,url:page.url(),stack:e.stack}));page.on('dialog',d=>d.accept());
  page.on('requestfailed',r=>requestFailures.push({url:r.url(),method:r.method(),failure:r.failure()}));
  // Let outstanding cart/wallet reads finish before intentionally replacing the
  // document. WebKit reports a cancelled in-flight fetch as an access-control
  // error; do not mask real page errors with a broad message filter.
  const reload=async()=>{await page.waitForLoadState('networkidle');await page.reload();};
  try{
   await page.goto(base+'/admin/offers');await page.getByText('Owner verified.',{exact:false}).waitFor();
   const before=structuredClone(fixture.state().offers.WELCOME250);await page.locator('[data-offer="GET1"]').click();assert.equal(await page.locator('#offer-heading').textContent(),'GET1');
   assert.equal(await page.locator('[data-offer-product]:checked').count(),11);assert.equal(await page.getByLabel('Show this offer on the landing page').isChecked(),false);
   assert.equal(await page.locator('#publish').isDisabled(),true);await page.getByLabel('Offer description',{exact:true}).fill('GET1: Shop ₹3,999. Pick another dress for ₹1.');await page.locator('#save').click();await page.getByText('GET1 draft saved. Live offers are unchanged.',{exact:true}).waitFor();
   assert.deepEqual(fixture.state().offers.WELCOME250,before);assert.equal((await(await fetch(base+'/api/hidi/offers/checkout-policy')).json()).dressEnabled,false);
   await page.locator('#confirmed').check();await page.locator('#publish').click();await page.getByText('GET1 published with its saved visibility settings.',{exact:true}).waitFor();assert.deepEqual(fixture.state().offers.WELCOME250,before);
   let policy=await(await fetch(base+'/api/hidi/offers/checkout-policy')).json();assert(policy.welcomeEnabled&&policy.dressEnabled);assert.equal(policy.eligibleProductIds.length,11);assert(!JSON.stringify(await(await fetch(base+'/api/hidi/offers')).json()).includes('GET1'));
   await page.screenshot({path:out+'/'+engine+'-'+width+'-admin.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('[data-offer="WELCOME250"]').click();await page.locator('[data-offer="GET1"]').click();assert.equal(await page.locator('[data-offer-product]:checked').count(),11);
   // A stale tab cannot overwrite another saved draft or publish uncertain text.
   await page.getByLabel('Offer description',{exact:true}).fill('Unsaved test');await action({action:'save',offerCode:'GET1',draft:fixture.state().offers.GET1.draft});await page.locator('#save').click();await page.getByText('Reload saved settings before another write.',{exact:false}).waitFor();assert.equal(await page.getByLabel('Offer description',{exact:true}).inputValue(),'Unsaved test');assert(await page.locator('#publish').isDisabled());
   await page.goto(base+'/checkout');const input=page.getByLabel('Have a coupon?',{exact:true}),status=page.locator('#hidi-coupon-status'),panel=page.locator('[data-hidi-checkout-coupons]');await input.waitFor();assert.equal(await input.inputValue(),'');await panel.getByRole('button',{name:'GET1',exact:true}).waitFor();await panel.getByRole('button',{name:'WELCOME250',exact:true}).waitFor();
   assert.equal(await page.locator('.hidi-offer-dialog').count(),0);await page.screenshot({path:out+'/'+engine+'-'+width+'-checkout.png',fullPage:false});
   const apply=async code=>{await input.fill(code);await panel.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#hidi-coupon-code')?.disabled);};
   await apply('GET1');const picker=page.getByRole('dialog',{name:'Choose your extra dress for ₹1',exact:true});await picker.waitFor();assert.equal(await picker.locator('[data-offer-style]').count(),11);if(!actualRuntime)await page.waitForFunction(()=>{const imgs=[...document.querySelectorAll('.hidi-offer-dialog img')].slice(0,2);return imgs.length===2&&imgs.every(i=>i.complete&&i.naturalWidth>0);},{},{timeout:60000});await page.screenshot({path:out+'/'+engine+'-'+width+'-picker.png'});
   await picker.getByRole('button',{name:'Close picker',exact:true}).click();const blocked=await page.evaluate(async()=>{try{await fetch('/api/store/checkout/prepare',{method:'POST',body:JSON.stringify({walletPaise:0})});}catch(e){return e.message;}});assert.match(blocked,/Choose your GET1/);assert.equal(prepares.length,0);
   await panel.getByRole('button',{name:'Choose your ₹1 dress',exact:true}).click();await picker.locator('.hidi-offer-sizes button:enabled').first().click();await status.filter({hasText:'added for ₹1'}).waitFor();assert.equal(await panel.getByRole('button',{name:'WELCOME250',exact:true}).count(),0);await page.waitForFunction(()=>document.querySelector('main')?.innerText.includes('₹4,000'));await page.screenshot({path:out+'/'+engine+'-'+width+'-applied.png'});
   // Switching coupons replaces the gift and discount; never adds both.
   await apply('WELCOME250');await status.filter({hasText:'You saved ₹250'}).waitFor();assert.equal(await panel.getByRole('button',{name:'Change ₹1 dress',exact:true}).count(),0);await page.waitForFunction(()=>[...document.querySelectorAll('.checkout-summary-item b,.checkout-mobile-summary-item b')].every(e=>!e.textContent.includes('GET1 · ₹1')));await page.waitForFunction(()=>document.querySelector('main')?.innerText.includes('₹3,749'));
   await apply('GET1');await picker.waitFor();await picker.locator('.hidi-offer-sizes button:enabled').first().click();await status.filter({hasText:'added for ₹1'}).waitFor();
   const rewards=await page.evaluate(async()=>{try{await fetch('/api/store/checkout/prepare',{method:'POST',body:JSON.stringify({walletPaise:100})});}catch(e){return e.message;}});assert.match(rewards,/cannot be combined/);assert.equal(prepares.length,0);
   await page.evaluate(async()=>{await fetch('/api/store/checkout/prepare',{method:'POST',body:JSON.stringify({sessionId:'promo-fixture-session',walletPaise:0,expectedTotalPaise:400000,expectedPayableTotalPaise:400000})});});assert.equal(prepares.length,1);assert.equal(prepares[0].offer.code,'GET1');assert.equal(prepares[0].offer.kind,'DRESS1');assert.equal(prepares[0].expectedTotalPaise,399900);assert.equal(prepares[0].expectedPayableTotalPaise,400000);
   fixture.setSubtotal(399899);await reload();await input.waitFor();await apply('GET1');await status.filter({hasText:'3,999'}).waitFor();assert.equal(await page.locator('.hidi-offer-dialog').count(),0);
   fixture.setSubtotal(399900);await reload();await input.waitFor();await apply('GET1');await picker.waitFor();await picker.locator('.hidi-offer-sizes button:enabled').first().click();await status.filter({hasText:'added for ₹1'}).waitFor();
   await action({action:'pause',offerCode:'GET1'});await page.evaluate(()=>dispatchEvent(new Event('hidi-cart-updated')));await status.filter({hasText:'Coupon removed'}).waitFor();policy=await(await fetch(base+'/api/hidi/offers/checkout-policy')).json();assert(policy.welcomeEnabled&&!policy.dressEnabled);await apply('WELCOME250');await status.filter({hasText:'You saved ₹250'}).waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);results.push({engine,width,adminIndependent:true,draftIsolation:true,conflictSafe:true,checkoutOnly:true,emptyField:true,selectedStyles:11,get1PaymentPaise:400000,noStacking:true,threshold:true,pauseIndependent:true});console.log('PASS independent GET1 '+engine+' '+width);
  }catch(e){await page.screenshot({path:out+'/'+engine+'-'+width+'-failure.png'}).catch(()=>{});await writeFile(out+'/'+engine+'-'+width+'-diagnostics.json',JSON.stringify({engine,width,errors,requestFailures},null,2));console.error((await page.locator('body').innerText()).slice(-3000));throw e;}finally{await context.close();}
 }}finally{await browser.close();}
}assert.equal(productionWrites,0);await writeFile(out+'/regression.json',JSON.stringify({passed:true,actualRuntime,productionWrites,liveDeployed:false,results},null,2));}

