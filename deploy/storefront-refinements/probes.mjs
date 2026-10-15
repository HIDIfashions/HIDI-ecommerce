/** Read-only candidate/live UI checks. All commerce and carrier examples are intercepted fixtures. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
export async function probe(base,output,engines=['chromium','firefox','webkit']) {
 await mkdir(output,{recursive:true});const reports=[];
 const catalogue=await fetch(base+'/api/store/products').then(async r=>{assert(r.ok,'Catalogue must load');return r.json();});
 const product=catalogue.find(p=>p.inStock&&p.variants?.some(v=>v.available>0));assert(product,'An available product is needed');
 for(const engine of engines){const browser=await pw[engine].launch({headless:true});try{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:1000}]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce',hasTouch:viewport.width<1100});const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const pending=new Set();let activity=0;const rsc=request=>new URL(request.url()).searchParams.has('_rsc');
   page.on('request',request=>{if(rsc(request)){pending.add(request);activity=Date.now();}});const finished=request=>{if(rsc(request)){pending.delete(request);activity=Date.now();}};page.on('requestfinished',finished);page.on('requestfailed',finished);
   const settle=async()=>{const start=Date.now();while(pending.size||Date.now()-Math.max(start,activity)<500){assert(Date.now()-start<20000,'Route prefetch did not settle');await new Promise(r=>setTimeout(r,50));}};
   const go=async path=>{await settle();const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:45000});assert(response?.ok(),'Route failed '+path);await page.locator('#main-content, main').first().waitFor();};
   await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin&&['GET','HEAD'].includes(route.request().method())&&route.request().resourceType()!=='media'?route.continue():route.abort());
   const fixtureCart={id:'read-only-fixture',currency:'INR',items:[{id:'fixture-line',quantity:1,lineTotalPaise:100000,product:{id:product.id,slug:product.slug,name:product.name,image:product.images?.[0]?.url||null},variant:{id:product.variants[0].id,size:product.variants[0].size,color:product.variants[0].color,available:1}}],itemCount:1,subtotalPaise:100000,shippingPaise:0,totalPaise:100000};
   await context.route('**/api/store/carts/**',route=>route.fulfill({status:200,json:fixtureCart}));
   let delivery={serviceable:true,cod:true,city:'Read-only fixture',estimatedDeliveryDate:'2099-10-21'};
   await context.route('**/api/store/checkout/delivery-serviceability?**',route=>route.fulfill({status:200,json:delivery}));
   const newsletter=async()=>{
    const form=page.locator('footer form.newsletter');await form.waitFor();await form.scrollIntoViewIfNeeded();const field=form.locator('input[type="email"]'),button=form.getByRole('button',{name:/Subscribe/i});
    const [i,b]=await Promise.all([field.boundingBox(),button.boundingBox()]);assert(i&&b&&Math.abs(i.y-b.y)<2,'Newsletter input and gold button must share one row');
    assert.equal(await button.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(229, 194, 121)');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');await settle();
   };
   try{
    await go('/');await page.locator('footer').waitFor();await newsletter();
    const configuration=await page.evaluate(()=>window.HIDI_CONFIG?.announcement?.messages);if(configuration)assert(configuration.includes('Shipping is ₹0.00 on every order')&&!configuration.some(s=>s.includes('1,499')),'Retained homepage announcement must match zero shipping');
    if(viewport.width===390||viewport.width===1440)await page.screenshot({path:resolve(output,engine+'-'+viewport.width+'-home.png')});
    await go('/products/'+product.slug);await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor();
    const size=page.locator('.pdp-purchase .sizes button:not(:disabled)').first();await size.click();assert.equal(await size.getAttribute('aria-pressed'),'true');assert.equal(await size.evaluate(e=>getComputedStyle(e).borderRadius),'999px');
    const purchase=viewport.width<=620?page.locator('[aria-label="Mobile purchase actions"]'):page.locator('[aria-label="Purchase actions"]');
    const add=purchase.getByRole('button',{name:'Add to Cart',exact:true}),buy=purchase.getByRole('button',{name:'Buy Now',exact:true});assert(await add.isEnabled()&&await buy.isEnabled());assert.equal(await add.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(232, 216, 196)');
    if(viewport.width>620){await add.hover();assert.equal(await add.evaluate(e=>getComputedStyle(e).color),'rgb(89, 29, 32)');}
    await size.click();assert(await add.isDisabled()&&await buy.isDisabled());
    const box=page.locator('.delivery-box'),pin=box.getByLabel('Delivery PIN code',{exact:true}),check=box.getByRole('button',{name:'Check delivery PIN code',exact:true});await pin.fill('000000');await check.click();await box.getByText('Enter a valid six-digit Indian PIN code.').waitFor();
    await pin.fill('500089');await check.click();await box.getByText(/Estimated delivery by/).waitFor();await box.getByText('Pay on delivery available',{exact:true}).waitFor();
    await box.getByRole('button',{name:'Change',exact:true}).click();delivery={serviceable:true,cod:false,estimatedDeliveryDate:null};await check.click();await box.getByText('The courier has not supplied an arrival date yet.').waitFor();await box.getByText('Pay on delivery is unavailable for this PIN.').waitFor();
    await newsletter();
    await go('/cart');await page.locator('.order-summary').waitFor();assert.match(await page.locator('.order-summary').innerText(),/Shipping\s*₹0\.00/);assert.doesNotMatch(await page.locator('.order-summary').innerText(),/Complimentary|₹99 shipping|1,499/);
    await go('/checkout');await page.locator('.checkout-form').waitFor();
    const summary=viewport.width<=720?page.locator('.checkout-mobile-summary'):page.locator('.checkout-summary');if(viewport.width<=720)await summary.evaluate(e=>e.open=true);assert.match(await summary.innerText(),/Shipping\s*₹0\.00/);assert.match(await summary.innerText(),/1,000/);assert.doesNotMatch(await summary.innerText(),/Complimentary|₹99 shipping/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(viewport.width===390||viewport.width===1440)await page.screenshot({path:resolve(output,engine+'-'+viewport.width+'-checkout.png')});
    await go('/about');await page.getByRole('heading',{name:'Considered clothing. A clear point of view.',exact:true}).waitFor();assert.equal(await page.locator('main img[src*="hidi-manifesto"]').count(),0);await newsletter();
    if(viewport.width===390||viewport.width===1440)await page.screenshot({path:resolve(output,engine+'-'+viewport.width+'-about.png')});
    await settle();assert.deepEqual(errors,[],'Candidate/live browser errors');reports.push({engine,...viewport,status:'PASS'});console.log('PASS '+engine+' '+viewport.width+'x'+viewport.height+' approved changes and read-only checkout');
   } finally {await context.close();}
  }
 }finally{await browser.close();}}
 const emptyResponse=await fetch(base+'/api/store/carts/'+randomUUID());assert(emptyResponse.ok,'Read-only empty bag quote must load');const empty=await emptyResponse.json();assert.equal(empty.shippingPaise,0);assert.equal(empty.totalPaise,0);
 await writeFile(resolve(output,'report.json'),JSON.stringify({base,scope:'Read-only actual runtime; carrier/checkout UI use intercepted fixtures; no order/payment/auth/subscription writes',reports},null,2));return reports;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 await probe(process.argv[2],process.argv[3]);
 if(process.argv[2]==='https://hidiindia.com')await probe('https://www.hidiindia.com',process.argv[3]+'-www',['chromium']);
}
