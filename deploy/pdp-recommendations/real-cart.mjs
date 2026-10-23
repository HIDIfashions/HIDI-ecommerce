import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const origin=process.env.HIDI_RUNTIME_BASE,out=process.env.HIDI_TEST_OUTPUT;
assert(origin==='https://hidiindia.com','Real guest cart tests only on approved live origin');
await mkdir(out,{recursive:true});const response=await fetch(origin+'/api/store/products');assert(response.ok);const products=await response.json();
const report={passed:false,realCartTests:[],ordersCreated:0};
const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
async function ready(page){await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor();}
async function realCart(width,product){
 const session=randomUUID(),context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});
 await context.addInitScript(session=>localStorage.setItem('hidi_cart_session',session),session);
 await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());return ['GET','HEAD'].includes(r.method())||(u.origin===origin&&u.pathname===`/api/store/carts/${session}/items`&&r.method()==='POST')?route.continue():route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(45000);let passed=false;
 try{
  assert((await page.goto(origin+'/products/'+product.slug,{waitUntil:'domcontentloaded'})).ok());await ready(page);
  const purchase=page.locator('.pdp-info .pdp-purchase'),choice=purchase.locator('.sizes button[aria-pressed]:enabled').first();
  const size=(await choice.textContent()).trim();await choice.click();await page.waitForFunction(()=>document.querySelector('.pdp-info .pdp-purchase .sizes button[aria-pressed="true"]'));
  const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/store/carts/${session}/items`);
  await purchase.getByRole('button',{name:'Add to Cart',exact:true}).click();const res=await pending;assert(res.ok(),`Real cart HTTP ${res.status()}`);const cart=await res.json();
  assert.equal(cart.itemCount,1);assert.equal(cart.items[0].product.slug,product.slug);assert.equal(cart.items[0].variant.size,size);assert.equal(cart.items[0].quantity,1);
  const submitted=res.request().postDataJSON();assert.equal(submitted.variantId,cart.items[0].variant.id);
  await page.goto(origin+'/cart',{waitUntil:'domcontentloaded'});await page.waitForFunction(name=>document.querySelector('.cart-page')?.textContent.includes(name),product.name);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(name=>document.querySelector('.cart-page')?.textContent.includes(name),product.name);
  await page.screenshot({path:`${out}/real-cart-${width}-${product.slug}.png`});
  passed=true;report.realCartTests.push({width,slug:product.slug,size,status:res.status(),correctVariant:true,quantity:1,cartPageAndReload:true,passed:true});
 }finally{
  const cartResponse=await context.request.get(`${origin}/api/store/carts/${session}`);assert(cartResponse.ok());const current=await cartResponse.json();
  for(const item of current.items){const removed=await context.request.delete(`${origin}/api/store/carts/${session}/items/${item.id}`);assert(removed.ok(),'Clean up isolated cart');}
  const empty=await context.request.get(`${origin}/api/store/carts/${session}`);assert.equal((await empty.json()).itemCount,0);
  if(passed)report.realCartTests.at(-1).testItemsRemoved=true;
  await context.close();
 }
 console.log(`PASS real cart ${width} ${product.slug}`);
}
try{for(const width of [1536,390])for(const product of products.filter(p=>p.variants?.some(v=>v.available>0)).slice(0,3))await realCart(width,product);report.passed=true;}
catch(error){report.error=error.stack;throw error;}
finally{report.results=report.realCartTests;await writeFile(out+'/real-cart-report.json',JSON.stringify(report,null,2));await browser.close();}
