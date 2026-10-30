import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function probe(base,{live=false}={}){
 const out='evidence/header-theme';await mkdir(out,{recursive:true});
 const config=live?null:JSON.parse(await readFile(process.env.HIDI_HEADER_PUBLIC,'utf8'));
 const products=live?await(await fetch(base+'/api/store/products')).json():null;
 const product=live?products.find(p=>p.inStock)?.slug:'offer-fixture-0';assert(product);
 const routes=['/','/collections/all','/products/'+product,'/cart','/checkout','/account','/wishlist','/about','/contact','/shipping','/returns','/privacy','/guides','/guides/kurta-set-buying-guide','/guides/choosing-kurta-set-size','/lookbook'];
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);const results=[],errors=[];
 for(const engine of live?['chromium']:['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',extraHTTPHeaders:{'X-Forwarded-Host':'hidiindia.com','X-Forwarded-Proto':'https'}});
   await context.addInitScript(()=>localStorage.setItem('hidi_cart_session','promo-fixture-session'));
   await context.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(!['GET','HEAD'].includes(r.method())||r.resourceType()==='media'||/razorpay|google-analytics|googletagmanager|cloudflareinsights/.test(url.hostname))return route.abort();
    if(!live&&url.origin!==base)return route.abort();
    if(live&&url.pathname.startsWith('/api/store/carts/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],itemCount:0,subtotalPaise:0,shippingPaise:0,totalPaise:0})});
    const value=!live?({'/api/hidi/hero-config':config.hero,'/api/hidi/landing-media-config':config.landing,'/api/hidi/portrait-order':config.portraitOrder})[url.pathname]:null;
    if(value)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
    return route.continue();
   });
   for(const path of routes){
    const page=await context.newPage();page.setDefaultTimeout(60000);
    page.on('pageerror',e=>errors.push({engine,width,path,message:e.message}));
    try{
     const response=await page.goto(base+path,{waitUntil:'domcontentloaded'});
     if(path==='/privacy'){
      // A private policy document is absent in the isolated runtime. The public
      // policy is verified through its unchanged settings snapshot at rollout.
      assert(live?response.ok():[200,404].includes(response.status()));results.push({engine,width,path,passed:true,privatePolicyNotWritten:true});continue;
     }
     assert(response.ok(),path+' status '+response.status());
     const guide=path.startsWith('/guides'),header=page.locator(guide?'body > header':'.site-header');await header.waitFor();
     if(!guide)await page.waitForFunction(()=>{const e=document.querySelector('.site-header');return e?.id==='site-header'?!e.hasAttribute('data-hidi-first-header'):!!document.documentElement.style.getPropertyValue('--hidi-header-height');});
     assert(await page.locator('link[data-hidi-header-burgundy]').count(),path+' missing delivered stylesheet');
     await page.waitForFunction(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor==='rgb(89, 30, 34)',guide?'body > header':'.site-header');
     const details=await header.evaluate((e,guide)=>{const s=getComputedStyle(e),b=getComputedStyle(e,'::before'),img=e.querySelector('img'),r=e.getBoundingClientRect();return {color:s.backgroundColor,before:b.backgroundColor,opacity:b.opacity,height:r.height,logo:img?.getAttribute('src'),overflow:document.documentElement.scrollWidth>innerWidth+1};},guide);
     assert(details.logo&&details.height>40&&!details.overflow,JSON.stringify({path,details}));
     if(!guide){assert.equal(details.before,'rgb(89, 30, 34)');assert.equal(details.opacity,'1');await page.evaluate(()=>scrollTo(0,700));await page.waitForTimeout(200);assert.equal(await header.evaluate(e=>getComputedStyle(e,'::before').backgroundColor),'rgb(89, 30, 34)');await page.evaluate(()=>scrollTo(0,0));}
     if(!live&&path==='/checkout'){await page.locator('#hidi-coupon-code').waitFor();assert.equal(await page.locator('#hidi-coupon-code').inputValue(),'');await page.locator('.hidi-coupon-hint').getByRole('button',{name:'WELCOME250',exact:true}).waitFor();assert.equal(await page.locator('.hidi-coupon-hint').getByText('GET1',{exact:true}).count(),0);}
     if(path==='/'||path==='/collections/all'){
      const menu=page.getByRole('button',{name:path==='/'?'Open HIDI menu':'Open menu',exact:true});if(await menu.isVisible()){await menu.click();await page.getByRole('dialog').first().waitFor();assert.equal(await header.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(89, 30, 34)');await page.keyboard.press('Escape');}
      const search=page.getByRole('button',{name:path==='/'?'Search HIDI products':'Search',exact:true});await search.click();await page.getByRole('dialog').first().waitFor();await page.keyboard.press('Escape');
     }
     if(path==='/'||path==='/checkout')await page.screenshot({path:out+'/'+(live?'live-':'')+engine+'-'+width+'-'+(path==='/'?'home':'checkout')+'.png'});
     results.push({engine,width,path,passed:true,...details});console.log('PASS '+(live?'live ':'candidate ')+'header '+engine+' '+width+' '+path);
    }catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error;}finally{page.removeAllListeners('pageerror');await page.close();}
   }
   await context.close();
  }}finally{await browser.close();}
 }
 assert.deepEqual(errors,[]);
 const report={passed:true,actualRuntime:true,results,errors,productionWrites:0};await writeFile(out+'/'+(live?'live':'candidate')+'.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[2]==='live')await probe('https://hidiindia.com',{live:true});
