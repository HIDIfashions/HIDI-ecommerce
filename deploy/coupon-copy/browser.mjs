import assert from 'node:assert/strict';import {writeFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
export async function probe(base,{setSubtotal}){
 const headers={Cookie:'hidi_admin_access=owner',Origin:base,'Content-Type':'application/json'};
 async function action(body){const state=await(await fetch(base+'/api/hidi/offers/admin',{headers})).json();const r=await fetch(base+'/api/hidi/offers/admin',{method:'POST',headers,body:JSON.stringify({...body,etag:state.etag})});assert(r.ok,await r.clone().text());return r.json();}
 const state=await(await fetch(base+'/api/hidi/offers/admin',{headers})).json();await action({action:'save',draft:{...state.draft,welcomeEnabled:true,dressEnabled:false,checkoutEnabled:true,audience:'EVERYONE'}});await action({action:'publish',confirm:true});
 const policy=await(await fetch(base+'/api/hidi/offers/checkout-policy')).json();assert(policy.welcomeEnabled&&!policy.dressEnabled);
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),results=[];await mkdir('evidence/welcome250',{recursive:true});
 for(const engine of ['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{for(const width of [390,1440]){
   setSubtotal(149900);const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});let prepares=0;
   await context.addInitScript(()=>{localStorage.setItem('hidi_cart_session','promo-fixture-session');localStorage.setItem('hidi_supabase_session',JSON.stringify({access_token:'selected',expires_at:Date.now()/1000+3600,user:{id:'fixture-user',phone:'+919000000001'}}));window.Razorpay=class{constructor(options){window.reviewPayment=options;}on(){}open(){window.reviewOpened=true;}};});
   await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==base||req.resourceType()==='media')return route.abort();
    if(url.pathname==='/api/store/checkout/prepare'){
     const body=req.postDataJSON();assert.equal(body.offer.code,'WELCOME250');assert.equal(body.expectedTotalPaise,149900);assert.equal(body.expectedPayableTotalPaise,124900);prepares++;
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hidiOrderId:'welcome-fixture',orderNumber:'HIDI-WELCOME-TEST',amountPaise:124900,subtotalPaise:149900,discountPaise:25000,shippingPaise:0,totalPaise:124900,walletAppliedPaise:0,status:'PENDING_PAYMENT',captured:false,currency:'INR',provider:'RAZORPAY',providerOrderId:'isolated-provider',razorpayKeyId:'rzp_test_fixture'})});
    }
    if(!['GET','HEAD'].includes(req.method())&&url.pathname!=='/api/store/checkout/offers/quote')return route.abort();return route.continue();
   });
   try{const page=await context.newPage();page.setDefaultTimeout(30000);await page.goto(base+'/checkout');
    const panel=page.locator('[data-hidi-checkout-coupons]'),status=page.locator('#hidi-coupon-status');
    const apply=async code=>{await panel.getByLabel('Have a coupon?',{exact:true}).fill(code);await panel.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(()=>{const input=document.querySelector('#hidi-coupon-code');return input&&!input.disabled;});};
    const amount=text=>page.waitForFunction(value=>document.querySelector('main')?.innerText.includes(value),text);
    await panel.waitFor();assert.equal(await panel.getByLabel('Have a coupon?',{exact:true}).inputValue(),'');assert.equal(await panel.locator('.hidi-coupon-hint').getByText('GET1',{exact:true}).count(),0);
    await panel.getByRole('button',{name:'WELCOME250',exact:true}).click();assert.equal(await panel.getByLabel('Have a coupon?',{exact:true}).inputValue(),'WELCOME250');assert.equal(prepares,0);
    setSubtotal(149899);await page.reload();await panel.waitFor();await panel.getByRole('button',{name:'WELCOME250',exact:true}).click();await panel.getByRole('button',{name:'Apply',exact:true}).click();await status.filter({hasText:'Shop for 1499 to avail the discount'}).waitFor();assert.equal(prepares,0);
    setSubtotal(149900);await page.reload();await panel.waitFor();
    await apply('GET1');await status.filter({hasText:'not currently available'}).waitFor();assert.equal(await page.locator('.hidi-offer-dialog').count(),0);
    await apply('welcome 250');await amount('₹1,249');await panel.getByRole('button',{name:'Remove coupon'}).click();await status.filter({hasText:'Coupon removed'}).waitFor();await amount('₹1,499');
    await apply('WELCOME250');await amount('₹1,249');await page.screenshot({path:`evidence/welcome250/${engine}-${width}.png`});
    await page.locator('#hidi-checkout-form').getByLabel('Email address',{exact:true}).fill('fixture@example.invalid');await page.getByLabel('First name',{exact:true}).fill('Fixture');await page.getByLabel('House, building and street address').fill('Fixture street');const pin=page.getByLabel(/PIN code/i).first();await pin.fill('500001');await pin.press('Tab');await page.getByLabel('City',{exact:true}).fill('Hyderabad');await page.getByLabel('State',{exact:true}).fill('Telangana');
    await page.getByRole('button',{name:/Pay|Continue to|Secure payment/i}).filter({visible:true}).last().click();await page.waitForFunction(()=>window.reviewOpened===true);assert.equal(await page.evaluate(()=>window.reviewPayment.amount),124900);assert.equal(prepares,1);
    results.push({engine,width,welcomeOnly:true,get1Rejected:true,applyRemove:true,paymentPaise:124900});console.log('PASS welcome-only checkout '+engine+' '+width);
   }finally{await context.close();}
  }}finally{await browser.close();}
 }
 await writeFile('evidence/welcome250/browser.json',JSON.stringify({passed:true,productionWrites:0,results},null,2));
}
