import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),[base,mode]=process.argv.slice(2),cases=[];
await mkdir('evidence/product-page-release',{recursive:true});
for(const engine of ['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});try{for(const [width,height] of [[390,844],[375,812],[320,568]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>!['GET','HEAD','OPTIONS'].includes(route.request().method())?route.fulfill({status:204,body:''}):route.fallback());
  if(mode==='candidate')await page.route('**/_next/image**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#eadbd0"/></svg>'}));
  await page.goto(base+'/products/hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants',{waitUntil:'domcontentloaded'});await page.locator('[data-hidi-hydrated=true]').waitFor();
  await page.locator('.pdp-gallery img:visible').first().evaluate(image=>image.decode());
  await page.waitForLoadState('networkidle',{timeout:30000});
  let sizes=await page.locator('.sizes').boundingBox(),sticky=await page.locator('[aria-label="Mobile purchase actions"]').boundingBox();
  if(width>=375)assert(sizes.y+sizes.height<=sticky.y-4,`${engine} ${width}x${height}: initial sizes clear sticky action`);
  await page.getByRole('button',{name:'Select size',exact:true}).click();
  sizes=await page.locator('.sizes').boundingBox();sticky=await page.locator('[aria-label="Mobile purchase actions"]').boundingBox();
  assert(sizes.y+sizes.height<=sticky.y-4,'Size selection scrolls clear of the purchase bar');
  await page.locator('.sizes button').getByText('M',{exact:true}).click();assert.equal(await page.getByRole('button',{name:'Add to Cart',exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`evidence/product-page-release/${mode}-${engine}-${width}x${height}.png`});cases.push({engine,width,height,passed:true,initialSizesVisible:width>=375,stickyClear:true});console.log('SHORT_MOBILE',JSON.stringify(cases.at(-1)));await page.close();
 }}finally{await browser.close();}
}
await writeFile(`evidence/product-page-release/short-${mode}.json`,JSON.stringify({passed:true,cases},null,2));
