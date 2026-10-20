import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = new URL('../evidence/product-page/', import.meta.url); await mkdir(dir, {recursive:true}); const results=[];
for (const [engine,browserType] of Object.entries({chromium,firefox,webkit}).filter(([name])=>(process.env.HIDI_BROWSER_ENGINES || 'chromium').split(',').includes(name))) {
const browser = await browserType.launch({headless:true});
try { for (const width of [1440,1280,768,390,320]) {
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();const errors=[];await page.route('**/_next/image**', async route => {
   // Functional tests use a local image, so they never depend on private media credentials.
   await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#eadbd0"/><text x="100" y="400" font-size="32">Product photograph fixture</text></svg>'});
 });page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.PDP_BASE_URL || 'http://localhost:3117')+'/products/hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants',{waitUntil:'domcontentloaded',timeout:180000});
 await page.getByRole('heading',{level:1,name:'Fuchsia Pink Kurta Set with Straight Pants'}).waitFor();
 await page.locator('[data-hidi-hydrated="true"]').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at '+width);
 assert.equal(await page.getByText('Model information',{exact:true}).count(),0);
 const facts=page.locator('[aria-label="Product quality and fit summary"]');
 await facts.getByText('Mandarin Collar with V-Slit',{exact:true}).waitFor();
 await facts.getByText('Three-Quarter Sleeves',{exact:true}).waitFor();
 await facts.getByText('Garment measurements are not available for this style yet.',{exact:true}).waitFor();
 const add=page.locator('[aria-label="Purchase actions"] button').first();assert.equal(await add.isEnabled(),false);
 if(width<=620){ await page.getByRole('button',{name:'Select size',exact:true}).click(); await page.locator('.sizes button').first().waitFor(); }
 await page.locator('.sizes button').getByText('M',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Purchase actions"] button')?.disabled===false);
 await page.getByRole('button',{name:'View product image 2',exact:true}).click();assert.equal(await page.getByRole('button',{name:'View product image 2',exact:true}).getAttribute('aria-pressed'),'true');
 await page.locator('.pdp-gallery button:visible').click();await page.getByRole('dialog',{name:/detailed image viewer/}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:/detailed image viewer/}).count(),0);
 await page.getByRole('button',{name:'Size & fit guide',exact:true}).click();await page.getByText('Verified measurements are not published for this style yet.').waitFor();await page.getByRole('button',{name:'Size & fit guide',exact:true}).click();
 let cartWrites=0;
 await page.route('**/api/store/carts/**/items',async route=>{cartWrites++;const body=route.request().postDataJSON();assert.equal(body.quantity,1);assert.equal(body.variantId,'cmv9ouyv800q701evm5pi8gav');await route.fulfill({json:{itemCount:1}});});
 const visibleAdd=page.getByRole('button',{name:'Add to Cart',exact:true});
 assert.equal(await visibleAdd.count(),1);
 await visibleAdd.click();await page.getByRole('status').getByText('Size M · Fuchsia Pink added to your bag.',{exact:true}).waitFor();assert.equal(cartWrites,1);
 await page.route('**/api/store/checkout/delivery-serviceability?**',route=>route.fulfill({json:{serviceable:true,cod:true,city:'Bengaluru',estimatedTransitDays:4}}));
 await page.getByRole('textbox',{name:'Delivery PIN code'}).fill('560001');await page.getByRole('button',{name:'Check delivery PIN code'}).click();await page.getByText('Pay on delivery available',{exact:true}).waitFor();
 await page.getByRole('button',{name:'View product image 1',exact:true}).click();await page.locator('.pdp-gallery img:visible').evaluate(im=>im.decode());await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL('functional-'+engine+'-'+width+'.png',dir)),fullPage:true});await page.screenshot({path:fileURLToPath(new URL('functional-viewport-'+engine+'-'+width+'.png',dir))});
 const box=await visibleAdd.boundingBox(); results.push({engine,width,purchaseButtonBottom:box.y+box.height,overflow:false,errors});assert.deepEqual(errors,[]);await context.close();
 }} finally {await browser.close();}
}
await writeFile(new URL('functional-results.json',dir),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
