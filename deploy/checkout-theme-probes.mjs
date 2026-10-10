import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
export async function probe(base,output,engines=['chromium','firefox','webkit']){
 await mkdir(output,{recursive:true});const reports=[];
 const response=await fetch(base+'/api/store/products');assert(response.ok);const products=await response.json();assert(Array.isArray(products));const product=products.find(p=>p.variants?.some(v=>v.available>0))||products[0];assert(product,'Catalogue required for live verification');
 for(const engine of engines){
  const browser=await pw[engine].launch({headless:true});
  try{for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
   const context=await browser.newContext({viewport,hasTouch:viewport.width<1100,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const pending=new Set();let activity=0;const navigation=r=>new URL(r.url()).searchParams.has('_rsc');
   page.on('request',r=>{if(navigation(r)){pending.add(r);activity=Date.now();}});
   const finished=r=>{if(navigation(r)){pending.delete(r);activity=Date.now();}};page.on('requestfinished',finished);page.on('requestfailed',finished);
   const go=async path=>{const start=Date.now();while(pending.size||Date.now()-Math.max(start,activity)<500){assert(Date.now()-start<15000,'Navigation requests did not settle');await new Promise(r=>setTimeout(r,50));}const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});assert(response?.ok(),'Route must load: '+path+' (HTTP '+response?.status()+')');};
   await context.route('**/*',r=>['GET','HEAD'].includes(r.request().method())&&r.request().resourceType()!=='media'?r.continue():r.abort());
   const cart={items:[{id:'read-only-fixture',quantity:1,lineTotalPaise:100000,product:{id:product.id,slug:product.slug,name:product.name,image:product.images?.[0]?.url||null},variant:{id:'read-only-size',size:'M',color:'Fixture',available:1}}],itemCount:1,subtotalPaise:100000,shippingPaise:9900,totalPaise:109900};
   await context.route('**/api/store/carts/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cart)}));
   try{
    await go('/');await page.locator('.site-header').waitFor();await page.locator('.button:visible').first().waitFor();for(const button of await page.locator('.button:visible,.newsletter .newsletter-field button:visible').all())assert.equal(await button.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(89, 29, 32)');
    await go('/checkout');const sign=page.getByRole('link',{name:'Sign In',exact:true});await sign.waitFor();assert.equal(await sign.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(89, 29, 32)');assert.equal(await page.getByRole('button',{name:'Continue as Guest',exact:true}).count(),1);
    assert.match(await page.locator('.checkout-summary').innerText(),/Shipping\s*₹99/);assert.match(await page.locator('.checkout-summary').innerText(),/1,099/);
    if(viewport.width<=720)assert(await page.locator('.checkout-mobile-summary').evaluate(e=>e.open),'Charged shipping is visible immediately');
    const input=page.getByRole('textbox',{name:'Mobile number',exact:true});assert.equal(await input.getAttribute('maxlength'),null,'Legacy wrapper must not truncate formatted input');
    for(const [raw,clean] of [['+91 abc9876543210','+919876543210'],['+91 (987) 654-3210','+919876543210'],['+442071234567','+442071234567']]){await input.fill(raw);assert.equal(await input.inputValue(),clean);assert(await input.evaluate(e=>e.checkValidity()));}
    assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
    await go('/products/'+product.slug);const details=page.locator('details').filter({has:page.getByText('Shipping & Returns',{exact:true})});await details.waitFor();assert.match(await details.innerText(),/Free Shipping[\s\S]*Easy Returns[\s\S]*Exchanges/);assert.equal(await details.getByRole('link',{name:/View Shipping, Returns & Exchange Policy/}).count(),1);
    const add=page.locator('[class*="purchaseActions"]').getByRole('button',{name:'Add to bag',exact:true});if(await add.count())assert.equal(await add.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(89, 29, 32)');
    if(viewport.width<=720){
     await go('/collections/all');await page.getByRole('button',{name:'Filter & Sort',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Product filters'});const show=dialog.getByRole('button',{name:/Show \d+ styles/});assert.equal(await show.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(89, 29, 32)');
     const check=()=>dialog.evaluate(d=>{const s=d.querySelector('[class*="filterScroll"]'),f=d.querySelector('[class*="drawerApply"]'),b=f.querySelector('button'),r=b.getBoundingClientRect();return {clear:s.getBoundingClientRect().bottom<=f.getBoundingClientRect().top+1,visible:r.bottom<=innerHeight,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});let g=await check();assert(g.clear&&g.visible&&g.hit);await dialog.locator('[class*="filterScroll"]').evaluate(e=>e.scrollTop=e.scrollHeight);g=await check();assert(g.clear&&g.visible&&g.hit);await show.click();
     const quickTrigger=page.getByRole('button',{name:'Quick add — '+product.name,exact:true});if(await quickTrigger.count()){await quickTrigger.first().click();const quick=page.getByRole('dialog');const bag=quick.getByRole('button',{name:'Add to bag',exact:true});assert.equal(await bag.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(89, 29, 32)');await page.keyboard.press('Escape');}
    }
    assert.deepEqual(errors,[]);reports.push({engine,...viewport,status:'PASS'});
    await page.waitForFunction(()=>document.fonts.status==='loaded');
    const previous=process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
    if(engine==='webkit')process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
    try{await page.screenshot({path:output+'/'+engine+'-'+viewport.width+'.png'});}finally{if(previous===undefined)delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY=previous;}
    console.log('PASS '+engine+' '+viewport.width+': checkout, shipping, phone, product policy and theme');
   }finally{await context.close();}
  }}finally{await browser.close();}
 }
 await writeFile(output+'/report.json',JSON.stringify(reports,null,2));return reports;
}
