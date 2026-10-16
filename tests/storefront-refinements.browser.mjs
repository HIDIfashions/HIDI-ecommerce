import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export async function runRefinementChecks({browser,engine,scenario,until,products,output,base,settleFixtureNetwork}) {
 const productPath='/products/'+products[0].slug;
 const phone={viewport:{width:390,height:844},hasTouch:true,startPath:productPath};
 await scenario(browser,engine,'REFINE-FIT','PDP size pills, deselection, unavailable sizes and purchase colours match quick shop',async page=>{
  const fit=page.locator('.pdp-purchase'),sizes=fit.locator('.sizes');await sizes.waitFor();
  assert(await sizes.getByRole('button',{name:'L — unavailable',exact:true}).isDisabled());
  const size=sizes.getByRole('button',{name:'M',exact:true});await size.click();
  assert.equal(await size.getAttribute('aria-pressed'),'true');
  assert.equal(await size.evaluate(e=>getComputedStyle(e).borderRadius),'999px');
  const add=page.locator('[aria-label="Purchase actions"]').getByRole('button',{name:'Add to Cart',exact:true});
  assert.equal(await add.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(232, 216, 196)');
  assert.equal(await add.locator('svg').count(),1);
  await size.click();assert(await add.isDisabled());
 },{startPath:productPath});
 await scenario(browser,engine,'REFINE-RECOMMENDATIONS','Recommendation cards omit expand controls while catalogue cards retain them',async page=>{
  await until(()=>page.evaluate(()=>localStorage.getItem('hidi_recently_viewed_products_v1')?.includes('myra-peach-comfort-kurta-set')),'recent product recorded');
  await settleFixtureNetwork(page,{prefetchOnly:true});await page.goto(base+productPath,{waitUntil:'networkidle'});
  await page.locator('.pdp-recent article').first().waitFor();await page.locator('.pdp-related article').first().waitFor();
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   for(const section of ['.pdp-related','.pdp-recent']){assert.equal(await page.locator(section).getByRole('button',{name:/^Expand /}).count(),0);await page.locator(section).screenshot({path:resolve(output,engine+'-recommendations-'+width+section.replace('.pdp-','-')+'.png')});}
  }
  await settleFixtureNetwork(page,{prefetchOnly:true});await page.goto(base+'/collections/all',{waitUntil:'networkidle'});assert(await page.getByRole('button',{name:/^Expand /}).count()>0);
 },{startPath:'/products/'+products[1].slug});
 await scenario(browser,engine,'REFINE-DELIVERY','PIN validation, busy state, courier dates, COD, errors and response reset',async page=>{
  const box=page.locator('.delivery-box'),input=box.getByLabel('Delivery PIN code',{exact:true}),check=box.getByRole('button',{name:'Check delivery PIN code',exact:true});
  let payload={serviceable:true,cod:true,city:'Hyderabad',estimatedDeliveryDate:'2099-10-21'},status=200;
  await page.route('**/api/store/checkout/delivery-serviceability?**',async route=>{await new Promise(r=>setTimeout(r,120));await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});});
  for(const pin of ['','000000','12345']){await input.fill(pin);await check.click();await box.getByText('Enter a valid six-digit Indian PIN code.').waitFor();}
  await input.fill('500089');await check.click();assert(await check.isDisabled());
  await box.getByText(/Estimated delivery by/).waitFor();await box.getByText('Pay on delivery available',{exact:true}).waitFor();
  assert.equal(await box.locator('.delivery-checked-pin').count(),0);assert(await input.evaluate(e=>e.readOnly));assert.equal(await box.getByRole('button',{name:'Check delivery PIN code',exact:true}).count(),0);
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await box.screenshot({path:resolve(output,engine+'-delivery-single-row-'+width+'.png')});}
  await box.getByRole('button',{name:'Change',exact:true}).click();await until(()=>input.evaluate(e=>e===document.activeElement),'PIN focus restored');
  payload={serviceable:true,cod:true,estimatedDeliveryDate:'2020-01-01',estimatedTransitDays:1};await check.click();await box.getByText('Estimated delivery in 1 day after dispatch').waitFor();await box.getByText('Pay on delivery available',{exact:true}).waitFor();
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await box.screenshot({path:resolve(output,engine+'-delivery-transit-'+width+'.png')});}
  await box.getByRole('button',{name:'Change',exact:true}).click();payload={serviceable:true,cod:false,estimatedTransitDays:1};await check.click();await box.getByText('Pay on delivery is unavailable for this PIN.').waitFor();
  await box.getByRole('button',{name:'Change',exact:true}).click();payload={serviceable:true,cod:true,estimatedTransitDays:null};await check.click();await box.getByText('The courier has not supplied an arrival estimate yet.').waitFor();
  await box.getByRole('button',{name:'Change',exact:true}).click();await input.fill('500001');assert.equal(await box.getByText('Online payment available',{exact:true}).count(),0);
  payload={serviceable:false};await check.click();await box.getByText('Delivery is currently unavailable to 500001.').waitFor();
  for(const next of [{serviceable:'yes'},null]){payload=next;await check.click();await box.getByText('Delivery availability cannot be checked right now. Please try again later.').waitFor();}
  status=503;payload={};await check.click();await box.getByText('Delivery availability cannot be checked right now. Please try again later.').waitFor();
  await page.screenshot({path:resolve(output,engine+'-refinement-delivery-mobile.png'),fullPage:true});
 },phone);
 await scenario(browser,engine,'REFINE-FOOTER','Gold inline newsletter across pages, validation, server errors and confirmed success',async page=>{
  for(const path of ['/about','/shipping','/collections/all',productPath]){
   await settleFixtureNetwork(page,{prefetchOnly:true});
   await page.goto(base+path,{waitUntil:'networkidle'});
   assert.equal(await page.locator('.footer .footer-note').count(),0);
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});const form=page.locator('.footer .newsletter');await form.scrollIntoViewIfNeeded();
    const geometry=await form.evaluate(e=>{const i=e.querySelector('input'),b=e.querySelector('button'),ir=i.getBoundingClientRect(),br=b.getBoundingClientRect();return{inputY:ir.y,buttonY:br.y,bg:getComputedStyle(b).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.equal(geometry.bg,'rgb(229, 194, 121)');assert(Math.abs(geometry.inputY-geometry.buttonY)<2);assert(!geometry.overflow);
    if(path==='/about'&&[390,1440].includes(width))await page.locator('.footer').screenshot({path:resolve(output,engine+'-footer-without-tagline-'+width+'.png')});
   }
  }
  let status=503;await page.route('**/api/store/marketing/newsletter',route=>route.fulfill({status,json:status===200?{message:'You’re subscribed to HIDI.'}:{message:'Please retry later.'}}));
  const footer=page.locator('.footer');await footer.getByLabel('Email address',{exact:true}).fill('fixture@example.invalid');await footer.getByRole('button',{name:'Subscribe',exact:true}).click();await page.locator('#newsletter-status').getByText('Please retry later.').waitFor();
  status=200;await footer.getByRole('button',{name:'Subscribe',exact:true}).click();await page.locator('#newsletter-status').getByText('You’re subscribed to HIDI.').waitFor();
  await settleFixtureNetwork(page,{prefetchOnly:true});
 },{startPath:'/about'});
 await scenario(browser,engine,'REFINE-ABOUT','Corporate Meet HIDI uses existing brand and working support/policy links on all widths',async page=>{
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('main h1').innerText(),'Considered clothing.\nA clear point of view.');assert.equal(await page.locator('main img[src*="hidi-manifesto"]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  for(const href of ['/contact','/returns','/collections/all'])assert((await page.locator('main a[href="'+href+'"]').count())>0);
 },{startPath:'/about'});
}
