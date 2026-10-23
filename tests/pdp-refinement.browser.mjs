import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
const { chromium, firefox, webkit } = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = new URL('../evidence/product-page/', import.meta.url); await mkdir(dir, {recursive:true}); const results=[];
for (const [engine,browserType] of Object.entries({chromium,firefox,webkit}).filter(([name])=>(process.env.HIDI_BROWSER_ENGINES || 'chromium').split(',').includes(name))) {
const browser = await browserType.launch({headless:true});
try { for (const width of [1440,1280,768,390,320]) {
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();const errors=[];await page.route('**/_next/image**', async route => {
   // Functional tests use a local image, so they never depend on private media credentials.
   await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#eadbd0"/><text x="100" y="400" font-size="32">Product photograph fixture</text></svg>'});
 });page.on('pageerror',e=>{errors.push(e.message);console.error('PDP_RUNTIME_ERROR',engine,width,e.message);});
 await page.route('**/*',route=>!['GET','HEAD','OPTIONS'].includes(route.request().method())?route.fulfill({status:204,body:''}):route.fallback());
 await page.goto((process.env.PDP_BASE_URL || 'http://localhost:3117')+'/products/hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants',{waitUntil:'domcontentloaded',timeout:180000});
 try { await page.getByRole('heading',{level:1,name:'Fuchsia Pink Kurta Set with Straight Pants'}).waitFor(); }
 catch(error){await writeFile(new URL('functional-failure-'+engine+'-'+width+'.html',dir),await page.content());await page.screenshot({path:fileURLToPath(new URL('functional-failure-'+engine+'-'+width+'.png',dir)),fullPage:true});throw error;}
 await page.locator('[data-hidi-hydrated="true"]').waitFor();
 if(process.env.HIDI_VERIFY_COLLECTION_NAVIGATION==='1'){
  // Let the retained header's initial prefetches finish before leaving its document.
  await page.waitForLoadState('networkidle',{timeout:30000});
  const base=process.env.PDP_BASE_URL||'http://localhost:3117';
  await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});
  await page.waitForLoadState('networkidle',{timeout:30000});
  // Use the real title link, rather than the card's overlaid image/quick-view hit area.
  await page.locator('h3 a[href="/products/hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants"]').first().focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading',{level:1,name:'Fuchsia Pink Kurta Set with Straight Pants'}).waitFor();
  await page.locator('[data-hidi-hydrated="true"]').waitFor();
  await page.waitForLoadState('networkidle',{timeout:30000});
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at '+width);
 if(width===390){
  const gallery=await page.locator('[class*="activeImage"]').boundingBox();
  assert(gallery.height>=340,'Mobile photo must have a useful full-garment viewing area');
 }
 if(width>=1000){await page.evaluate(()=>scrollTo(0,320));await page.waitForFunction(()=>{const g=document.querySelector('[class*="galleryLayout"]')?.getBoundingClientRect(),h=document.querySelector('.site-header')?.getBoundingClientRect();return g&&h&&g.top>=h.bottom+12&&g.bottom<=innerHeight+1});await page.evaluate(()=>scrollTo(0,0));}
 if(width<=620){assert.equal(await page.locator('[class*="galleryHint"]').isVisible(),false);assert.equal(await page.getByRole('button',{name:'Buy Now',exact:true}).evaluate(el=>getComputedStyle(el).fontSize),'12px');}
 assert.equal(await page.locator('[data-hidi-selection-copy]:visible').count(),0,'No duplicate SKU paragraph above sizes');
 const priceText=await page.locator('.pdp-price').innerText();assert.match(priceText,/MRP|% OFF|Inclusive of all taxes/,'Original PDP pricing details remain visible');
 assert.equal(await page.getByText('Model information',{exact:true}).count(),0);
 const facts=page.locator('[aria-label="Product quality and fit summary"]');
 assert.equal(await facts.evaluate(el=>el.tagName),'DETAILS');
 assert.equal(await facts.getAttribute('open'),null,'Product details starts collapsed');
 const detailsToggle=facts.locator('summary');await detailsToggle.focus();await page.keyboard.press('Enter');
 await facts.getByText('Mandarin Collar with V-Slit',{exact:true}).waitFor();
 await facts.getByText('Three-Quarter Sleeves',{exact:true}).waitFor();
 await detailsToggle.click();assert.equal(await facts.getAttribute('open'),null,'Product details can collapse again');
 await detailsToggle.click();
 assert.equal(await facts.getByText('Garment measurements are not available for this style yet.',{exact:true}).count(),0);
 assert.equal(await facts.getByText('Care',{exact:true}).count(),0);
 assert.equal(await page.getByText('Specifications',{exact:true}).count(),0);
 for(const name of ['Material & Care','Shipping & Returns','Photography & Colour']){const section=page.locator('details').filter({has:page.locator('summary').getByText(name,{exact:true})});const box=await section.boundingBox();assert(box.height>=52&&box.height<=60,'Closed section spacing must match its heading row');}
 const add=page.locator('[aria-label="Purchase actions"] button').first();assert.equal(await add.isEnabled(),true);
 let missingSizeWrites=0;const watch=request=>{if(request.method()==='POST' && /\/carts\/.+\/items/.test(request.url()))missingSizeWrites++;};page.on('request',watch);
 for(const name of ['Add to Cart','Buy Now']){const action=page.getByRole('button',{name,exact:true});assert.equal(await action.count(),1);assert(await action.isEnabled());await action.click();const picker=page.getByRole('dialog',{name:'Choose your size',exact:true});await picker.waitFor();assert.equal(await picker.locator('[aria-pressed="true"]').count(),0);await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});assert(await action.evaluate(el=>document.activeElement===el),'Closing the picker restores focus to its purchase action');}
 assert.equal(missingSizeWrites,0,'No cart write without an explicit size');page.off('request',watch);
 await page.locator('.sizes button').first().waitFor();
 await page.locator('.sizes button').getByText('M',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Purchase actions"] button')?.disabled===false);
 await page.getByRole('button',{name:'View product image 2',exact:true}).click();assert.equal(await page.getByRole('button',{name:'View product image 2',exact:true}).getAttribute('aria-pressed'),'true');
 await page.locator('.pdp-gallery button:visible').click();await page.getByRole('dialog',{name:/detailed image viewer/}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:/detailed image viewer/}).count(),0);
 await page.getByRole('button',{name:'Size & fit guide',exact:true}).click();await page.getByText('Size measurements are awaiting confirmation.').waitFor();await page.getByRole('button',{name:'Size & fit guide',exact:true}).click();
 let cartWrites=0;
 await page.route('**/api/store/carts/**/items',async route=>{cartWrites++;const body=route.request().postDataJSON();assert.equal(body.quantity,1);assert.equal(body.variantId,'cmv9ouyv800q701evm5pi8gav');await route.fulfill({json:{itemCount:1}});});
 const visibleAdd=page.getByRole('button',{name:'Add to Cart',exact:true});
 assert.equal(await visibleAdd.count(),1);
 await visibleAdd.click();await page.getByRole('status').getByText('Size M · Fuchsia Pink added to your bag.',{exact:true}).waitFor();assert.equal(cartWrites,1);
 await page.route('**/api/store/checkout/delivery-serviceability?**',route=>route.fulfill({json:{serviceable:true,cod:true,city:'Bengaluru',estimatedTransitDays:4}}));
 const pin=page.getByRole('textbox',{name:'Delivery PIN code'}),check=page.getByRole('button',{name:'Check delivery PIN code'});const pinBox=await pin.boundingBox(),checkBox=await check.boundingBox();assert(Math.abs(pinBox.height-checkBox.height)<=1,'PIN entry and Check button align');assert(pinBox.width+checkBox.width<=382,'PIN form stays compact');
 await pin.fill('560001');await page.getByRole('button',{name:'Check delivery PIN code'}).click();await page.getByText('Pay on delivery available',{exact:true}).waitFor();
 await page.getByRole('button',{name:'View product image 1',exact:true}).click();await page.locator('.pdp-gallery img:visible').evaluate(im=>im.decode());await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL('functional-'+engine+'-'+width+'.png',dir)),fullPage:true});await page.screenshot({path:fileURLToPath(new URL('functional-viewport-'+engine+'-'+width+'.png',dir))});
 const box=await visibleAdd.boundingBox();
 // The picker remembers the purchase intent and submits the explicitly chosen SKU once.
 for(const name of ['Add to Cart','Buy Now']){
  await page.locator('.sizes button').getByText('M',{exact:true}).click();
  const before=cartWrites;await page.getByRole('button',{name,exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Choose your size',exact:true});await picker.waitFor();
  await picker.getByText(name==='Buy Now'?'Select a size to continue to checkout.':'Select a size to add this item to your bag.',{exact:true}).waitFor();
  if(name==='Buy Now')await page.route('**/api/store/carts/*',route=>route.fulfill({json:{items:[],subtotalPaise:0,totalPaise:0,shippingPaise:0}}));
  await picker.locator('[data-size-choice="M"]').click();await picker.waitFor({state:'hidden'});
  if(name==='Buy Now')await page.waitForURL('**/checkout');else await page.getByRole('status').getByText('Size M · Fuchsia Pink added to your bag.',{exact:true}).waitFor();
  assert.equal(cartWrites,before+1,'Picker must write the exact SKU only once');
 }
 results.push({engine,width,purchaseButtonBottom:box.y+box.height,overflow:false,errors});assert.deepEqual(errors,[]);await context.close();
 }} finally {await browser.close();}
}
await writeFile(new URL('functional-results.json',dir),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
