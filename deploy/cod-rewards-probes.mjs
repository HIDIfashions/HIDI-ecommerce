import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),base=process.argv[2],phase=process.argv[3];
const output='evidence/cod-rewards/'+phase;await mkdir(output,{recursive:true});const report=[];
for(const engine of ['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const pendingNavigation=new Set();let lastNavigation=Date.now();
  const navigationRequest=request=>new URL(request.url()).searchParams.has('_rsc');
  page.on('request',request=>{if(navigationRequest(request)){pendingNavigation.add(request);lastNavigation=Date.now();}});
  const navigationFinished=request=>{if(navigationRequest(request)){pendingNavigation.delete(request);lastNavigation=Date.now();}};
  page.on('requestfinished',navigationFinished);page.on('requestfailed',navigationFinished);
  const settleNavigation=async()=>{
   const started=Date.now();
   while(pendingNavigation.size||Date.now()-Math.max(started,lastNavigation)<500){assert(Date.now()-started<20000,'Navigation requests did not finish');await new Promise(resolve=>setTimeout(resolve,50));}
  };
  const navigate=async path=>{await settleNavigation();assert.deepEqual(errors,[]);await page.goto(base+path,{waitUntil:'domcontentloaded'});};
  const screenshot=async name=>{
   await page.waitForFunction(()=>document.fonts.status==='loaded');
   const previous=process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
   if(engine==='webkit')process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
   try{await page.screenshot({path:output+'/'+engine+'-'+width+'-'+name+'.png'});}finally{if(previous===undefined)delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY=previous;}
  };
  let prepareCalls=0;const cart={items:[{id:'fixture-line',quantity:1,lineTotalPaise:100000,product:{slug:'fixture',name:'Fixture style'},variant:{id:'fixture-variant',size:'M',color:'Ivory'}}],itemCount:1,subtotalPaise:100000,shippingPaise:9900,totalPaise:109900};
  await context.route('**/*',r=>['GET','HEAD'].includes(r.request().method())&&r.request().resourceType()!=='media'?r.continue():r.abort());
  const fulfill=(r,data)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  await context.route('**/api/store/carts/**',r=>fulfill(r,cart));
  await context.route('**/api/store/checkout/payment-options',r=>fulfill(r,{cod:true,online:true}));
  await context.route('**/api/store/checkout/delivery-serviceability?*',r=>fulfill(r,{cod:r.request().url().includes('500001'),serviceable:true,city:'Hyderabad',stateCode:'Telangana'}));
  await context.route('**/api/store/checkout/prepare',r=>{
   const body=r.request().postDataJSON();assert.equal(body.paymentMethod,'COD');assert.equal(body.walletPaise,0);assert.equal(body.expectedPayableTotalPaise,109900);prepareCalls++;
   return fulfill(r,{provider:'COD',confirmed:true,captured:false,orderNumber:'HIDI-CI-COD',status:'CONFIRMED',currency:'INR',subtotalPaise:100000,shippingPaise:9900,totalPaise:109900,walletAppliedPaise:0,amountPaise:109900});
  });
  await context.route('**/api/store/checkout/confirmation/**',r=>fulfill(r,{orderNumber:'HIDI-CI-COD',status:'CONFIRMED',createdAt:new Date().toISOString(),currency:'INR',subtotalPaise:100000,shippingPaise:9900,discountPaise:0,taxPaise:0,totalPaise:109900,walletAppliedPaise:0,customerPhone:'9000000000',shippingAddress:{firstName:'Fixture',line1:'Fixture address',city:'Hyderabad',state:'Telangana',postalCode:'500001'},payment:{provider:'COD',method:'cod',status:'CREATED',amountPaise:109900},items:[]}));
  try{
   await navigate('/');await page.getByRole('button',{name:'Get the HIDI app for Android or iPhone',exact:true}).click();
   await page.getByRole('heading',{name:'HIDI app launching soon',exact:true}).waitFor();assert.equal(await page.getByText('Store link not supplied',{exact:true}).first().isVisible(),false);await screenshot('app');await page.getByRole('button',{name:'Close dialog',exact:true}).click();
   await page.getByRole('button',{name:'Get the HIDI app for Android or iPhone',exact:true}).click();await page.getByRole('heading',{name:'HIDI app launching soon',exact:true}).waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
   await navigate('/account/rewards');await page.getByRole('link',{name:'Sign in to view rewards',exact:true}).waitFor();assert.match(await page.locator('#main-content').innerText(),/7 days after delivery/);await screenshot('rewards');
   await navigate('/checkout');const form=page.locator('.checkout-form'),cod=form.getByRole('radio',{name:/Cash on delivery/});await cod.waitFor();assert(!(await cod.isEnabled()));
   await form.getByLabel('Email address',{exact:true}).fill('fixture@example.test');await form.getByLabel('Mobile number',{exact:true}).fill('9000000000');await form.getByLabel('First name',{exact:true}).fill('Fixture');await form.getByLabel('House, building and street address',{exact:true}).fill('Fixture address');
   const pin=form.getByLabel('PIN code',{exact:true});await pin.fill('500002');await pin.blur();await page.getByText('Unavailable for this PIN code',{exact:true}).waitFor();assert(!(await cod.isEnabled()));
   await pin.fill('500001');await pin.blur();await page.getByText('Pay the full amount when your order arrives',{exact:true}).waitFor();await cod.check();
   await form.getByLabel('City',{exact:true}).fill('Hyderabad');await form.getByLabel('State',{exact:true}).fill('Telangana');await screenshot('cod');
   assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
   await settleNavigation();await form.getByRole('button',{name:/Place cash on delivery order/}).click();await page.getByRole('heading',{name:'Due on delivery',exact:true}).waitFor();assert.equal(prepareCalls,1);assert.match(await page.locator('#main-content').innerText(),/Amount due on delivery/);await screenshot('receipt');await settleNavigation();assert.deepEqual(errors,[]);
   report.push({engine,width,passed:true,appSoon:true,rewardsSignIn:true,pinEligibility:true,codReceiptUnpaid:true,liveOrdersCreated:0});console.log('PASS '+engine+' '+width+': app notice, rewards, COD PIN checks and unpaid receipt; all writes isolated');
  }finally{await context.close();}
 }}finally{await browser.close();}
}
await writeFile(output+'/report.json',JSON.stringify(report,null,2));
