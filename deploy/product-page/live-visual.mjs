import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true}),results=[];
try{await mkdir('evidence/product-page-release',{recursive:true});for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});
 await page.route('**/*',route=>!['GET','HEAD','OPTIONS'].includes(route.request().method())?route.fulfill({status:204,body:''}):route.continue());
 await page.goto('https://hidiindia.com/products/hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants',{waitUntil:'domcontentloaded'});
 await page.locator('[data-hidi-hydrated=true]').waitFor();
 const image=page.locator('.pdp-gallery img:visible').first();await image.evaluate(image=>image.decode());
 assert(await image.evaluate(image=>image.naturalWidth>0));assert.equal(await image.evaluate(image=>getComputedStyle(image).objectFit),'contain');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'evidence/product-page-release/live-real-photos-'+width+'.png',fullPage:true});
 results.push({width,realProductPhotoLoaded:true,wholeGarmentContained:true,overflow:false});await page.close();
}await writeFile('evidence/product-page-release/live-visual.json',JSON.stringify({passed:true,results},null,2));}finally{await browser.close();}
