import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {snapshotServer} from '../pdp-layout/snapshot-server.mjs';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const out=resolve(process.env.HIDI_TEST_OUTPUT||'outputs/pdp-recommendations');await mkdir(out,{recursive:true});
const css=await readFile(new URL('../../apps/web/app/pdp-recommendations.css',import.meta.url),'utf8');
const actual=process.env.HIDI_RUNTIME_BASE;
const snapshot=await snapshotServer({directory:join(out,'commerce-snapshot'),css,candidate:!actual,upstream:actual||'https://hidiindia.com'});
const base=actual||snapshot.base;
const products=JSON.parse((await snapshot.pull('/api/store/products')).body);
const available=products.filter(p=>p.variants?.some(v=>v.available>0)&&p.images?.length);
const results=[];let cartAdds=0;
async function productReady(page){
 // ProductPageShell sets this only after the product tree hydrates. The
 // recently-viewed effect can run earlier and is not a purchase readiness gate.
 await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor();
 await page.waitForFunction(()=>document.fonts.status==='loaded');
 await page.locator('[class*="activeImage"] img').evaluate(e=>e.decode());
}
async function selected(size,value){await size.page().waitForFunction(({selector,value})=>document.querySelector(selector)?.getAttribute('aria-pressed')===String(value),{selector:'.pdp-info .pdp-purchase .sizes button[aria-pressed]:enabled',value});}
async function compareStyles(page){return page.evaluate(css=>{
 const read=()=>[...document.querySelectorAll('body,.site-header,footer.footer,main,button,input,summary,h1,h2,.cart-page,.checkout-page,.summary-total,.product-grid')].map(e=>{const c=getComputedStyle(e);return {tag:e.tagName,className:e.className,font:c.font,color:c.color,background:c.backgroundColor,padding:c.padding,margin:c.margin,display:c.display,border:c.border};});
 const before=read();const s=document.querySelector('style[data-hidi-storefront-layer-fix]');if(s)s.textContent=s.textContent.replace(css,'');
 return {before,after:read()};
},css);}
try{
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
  const browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&process.platform==='win32'?{channel:'chrome'}:{})});
  try{for(const width of [390,1536]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
   const page=await context.newPage();page.setDefaultTimeout(30000);
   const product=available[0],variant=product.variants.find(v=>v.available>0);
   const cart={items:[{id:'isolated-pdp-line',quantity:1,lineTotalPaise:variant.pricePaise,product:{id:product.id,slug:product.slug,name:product.name,image:product.images[0].url},variant:{id:variant.id,size:variant.size,color:variant.color,available:variant.available}}],itemCount:1,subtotalPaise:variant.pricePaise,shippingPaise:0,totalPaise:variant.pricePaise};
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.startsWith('/api/store/carts/')){
     if(req.method()==='POST'){assert.equal(req.postDataJSON().quantity,1);assert(available.some(p=>p.variants.some(v=>v.id===req.postDataJSON().variantId)));cartAdds++;}
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cart)});
    }
    if(url.pathname==='/api/store/checkout/payment-options')return route.fulfill({json:{cod:true,online:true}});
    if(url.pathname==='/api/store/checkout/delivery-serviceability')return route.fulfill({json:{cod:true,serviceable:true,city:'Hyderabad',stateCode:'Telangana'}});
    if(url.pathname==='/api/admin/session')return route.fulfill({status:401,json:{message:'Admin session required'}});
    if(!['GET','HEAD'].includes(req.method())||/googletagmanager|google-analytics|facebook\.net|razorpay/.test(url.hostname)||req.resourceType()==='media')return route.abort();
    if(process.env.HIDI_MEDIA_READONLY_ORIGIN&&url.origin===base&&(url.pathname.startsWith('/media/')||url.pathname==='/_next/image')){
     const r=await snapshot.pull(process.env.HIDI_MEDIA_READONLY_ORIGIN+url.pathname+url.search);return route.fulfill({status:r.status,contentType:r.contentType,body:r.body});
    }
    if(url.origin!==base){const r=await snapshot.pull(url.href);return route.fulfill({status:r.status,contentType:r.contentType,body:r.body});}
    return route.continue();
   });
   try{
    for(const item of available.slice(0,3)){
     assert((await page.goto(base+'/products/'+item.slug,{waitUntil:'domcontentloaded'})).ok());
     await productReady(page);
     await page.locator('.sizes button:enabled').first().waitFor();
     assert.equal(await page.locator('.pdp-purchase > [class*="selectionSummary"]:visible,.pdp-selected-detail:not(.sr-only):visible').count(),0);
     await page.locator('[class*="activeImage"] img').evaluate(e=>e.decode());
     assert(await page.locator('[class*="activeImage"] img').evaluate(e=>e.naturalWidth>0));
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
     const choice=page.locator('.pdp-info .pdp-purchase .sizes button[aria-pressed]:enabled').first();
     assert.equal(await choice.getAttribute('aria-pressed'),'false');
     await choice.click();await selected(choice,true);
     await choice.click();await selected(choice,false);
     await choice.focus();await choice.press('Enter');await selected(choice,true);
     await choice.press('Space');await selected(choice,false);
    }
    // An empty history must not leave a blank section or extra footer spacer.
    await page.evaluate(()=>localStorage.removeItem('hidi_recently_viewed_products_v1'));
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('.sizes button:enabled').first().waitFor();
    await productReady(page);
    // The recent-history effect confirms client hydration after clearing storage.
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hidi_recently_viewed_products_v1')||'[]').some(item=>location.pathname.endsWith('/'+item.slug)));
    await page.locator('[class*="activeImage"] img').evaluate(e=>e.decode());assert.equal(await page.locator('.pdp-recent').count(),0);
    const purchase=page.locator('.pdp-info .pdp-purchase');
    const size=purchase.locator('.sizes button[aria-pressed]:enabled').first();
    await size.waitFor();assert.equal(await size.getAttribute('aria-pressed'),'false');
    await size.click();await purchase.locator('.sizes button[aria-pressed="true"]').waitFor();
    await purchase.getByRole('button',{name:'Buy Now',exact:true}).click();
    await page.waitForURL('**/checkout',{waitUntil:'domcontentloaded'});
    await page.getByRole('textbox',{name:'Mobile number',exact:true}).waitFor();
    const pin=page.getByRole('textbox',{name:'PIN code',exact:true});await pin.fill('500001');await pin.blur();
    const summary=page.locator('.checkout-mobile-summary');
    if(width<=720&&await summary.count()&&await summary.evaluate(e=>e.open))await summary.locator('summary').click();
    const cod=page.getByRole('radio',{name:/Cash on delivery/});await cod.check();assert(await cod.isChecked());
    const online=page.getByRole('radio',{name:/Pay online/});await online.check();assert(await online.isChecked());
    for(const path of ['/cart','/checkout','/collections/all','/','/account','/admin/sign-in']){
     assert((await page.goto(base+path,{waitUntil:'domcontentloaded'})).ok());await page.waitForFunction(()=>document.fonts.status==='loaded');
     if(path==='/checkout')await page.getByRole('textbox',{name:'Mobile number',exact:true}).waitFor();
     if(path==='/cart')await page.waitForFunction(name=>document.querySelector('.cart-page')?.textContent.includes(name),product.name);
     if(path!=='/admin/sign-in')assert.equal(await page.getByText(/Indian wear with a calm point of view/).count(),0,'Footer copy removed');
     if(path==='/account')await page.locator('input[type="tel"]').first().waitFor();
     const {before,after}=await compareStyles(page);assert.deepEqual(after,before,'Unchanged non-PDP styles '+path);
    }
    results.push({engine,width,products:available.slice(0,3).map(p=>p.slug),hydratedPurchaseControls:true,pointerAndKeyboardSizeSelection:true,emptyHistory:true,buyNowNavigation:true,codAndOnlineChoice:true,unchangedPages:['cart','checkout','collections','home','account','admin-sign-in'],passed:true});
    console.log('PASS commerce '+engine+' '+width);
   }catch(e){await page.screenshot({path:join(out,'commerce-'+engine+'-'+width+'-failure.png'),fullPage:true}).catch(()=>{});throw e;}
   finally{await context.close();}
  }}finally{await browser.close();}
 }
 await writeFile(join(out,'commerce-report.json'),JSON.stringify({passed:true,actualRuntime:!!actual,publicMediaFixture:!!process.env.HIDI_MEDIA_READONLY_ORIGIN,results,isolatedCartAdds:cartAdds,upstreamWrites:0,deploymentPerformed:false},null,2));
}catch(e){await writeFile(join(out,'commerce-failure.json'),JSON.stringify({passed:false,error:e.stack,results},null,2));throw e;}
finally{await snapshot.save();await snapshot.close();}
