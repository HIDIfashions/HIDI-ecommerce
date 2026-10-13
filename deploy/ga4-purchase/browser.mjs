import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const source=await readFile(new URL('./hidi-analytics.js',import.meta.url),'utf8');
const live=process.argv.includes('--live');
const base='https://hidiindia.com';
const catalogueResponse=await fetch(base+'/api/store/products');assert(catalogueResponse.ok);
const products=await catalogueResponse.json();const product=products.find(p=>p.inStock&&p.variants?.some(v=>v.available>0));
assert(product?.slug,'An in-stock product is required');const productPath='/products/'+product.slug;
const reports=[];
function isolatedReceipt(order){
  const review=order.endsWith('REVIEW'),failed=order.endsWith('FAILED');
  return {orderNumber:order,status:review?'PAYMENT_REVIEW':failed?'PENDING_PAYMENT':'CONFIRMED',currency:'INR',createdAt:'2026-10-13T10:00:00.000Z',
    subtotalPaise:339800,discountPaise:0,shippingPaise:9900,taxPaise:0,totalPaise:349700,walletAppliedPaise:100000,
    customerEmail:'isolated@example.test',customerPhone:'0000000000',shippingAddress:{line1:'Isolated browser fixture',city:'Test',state:'Test',postalCode:'000000'},
    payment:{provider:'RAZORPAY',status:review?'AUTHORIZED':failed?'FAILED':'CAPTURED',method:'upi',amountPaise:249700},
    items:[{id:'isolated-item',slug:'isolated-kurta',productName:'Isolated Kurta',size:'M',color:'Blue',quantity:2,unitPricePaise:169900,totalPaise:339800}]};
}
const browser=await chromium.launch();
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();let simulatedWrites=0,failed=false,receiptReads=0;const blocked=[];
    await page.addInitScript(()=>{localStorage.setItem('hidi_cart_session','isolated-purchase-session');window.__ga4CartEvents=[];window.gtag=(...args)=>{if(args[0]==='event')window.__ga4CartEvents.push({name:args[1],params:args[2]});};});
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(/googletagmanager|google-analytics|facebook\.net/.test(url.hostname))return route.fulfill({status:200,contentType:'application/javascript',body:''});
      if(url.pathname==='/api/hidi/performance')return route.abort();
      if(url.pathname==='/hidi-analytics.js'&&!live)return route.fulfill({status:200,contentType:'application/javascript',body:source});
      if(url.pathname==='/api/hidi/analytics-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,ga4MeasurementId:'G-Z45WSHLDHG'})});
      if(/^\/(?:api\/store|v1)\/checkout\/confirmation\//.test(url.pathname)){
        assert.equal(request.method(),'GET');receiptReads++;
        const order=decodeURIComponent(url.pathname.split('/').at(-1));assert(order.startsWith('GA4-ISOLATED-'));
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(isolatedReceipt(order))});
      }
      if(/^\/api\/store\/carts\//.test(url.pathname)){
        if(request.method()==='POST'&&/\/items\/?$/.test(url.pathname)){
          simulatedWrites++;const body=request.postDataJSON();
          await new Promise(done=>setTimeout(done,150));
          if(failed)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Isolated out-of-stock fixture'})});
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({itemCount:simulatedWrites,items:[{id:'isolated-item',quantity:simulatedWrites,unitPricePaise:169900,product:{slug:'isolated-kurta',name:'Isolated Kurta'},variant:{id:body.variantId,size:'M',pricePaise:169900}}]})});
        }
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],itemCount:0,subtotalPaise:0,totalPaise:0})});
      }
      if(!['GET','HEAD'].includes(request.method())){blocked.push(url.pathname);return route.abort();}
      return route.continue();
    });
    if(live){
      const deployed=await page.request.get(base+'/hidi-analytics.js');assert(deployed.ok());
      assert.equal(createHash('sha256').update(await deployed.body()).digest('hex'),createHash('sha256').update(source).digest('hex'),'Live analytics source differs');
    }
    await page.goto(base+productPath,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__ga4CartEvents.some(e=>e.name==='view_item'),{timeout:30000});
    await page.locator('.product-page').waitFor();
    if(await page.locator('[data-hidi-react-pdp]').count())await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor({state:'attached'});
    let size;
    for(const name of ['M','L','XL','XXL']){const options=page.locator('.sizes').getByRole('button',{name,exact:true});for(let i=0;i<await options.count();i++){const candidate=options.nth(i);if(await candidate.isVisible()&&await candidate.isEnabled()){size=candidate;break;}}if(size)break;}
    assert(size,'A live product must have an available size');
    const buttons=page.getByRole('button',{name:/add to cart|add to bag/i});let add;
    for(let i=0;i<await buttons.count();i++){const button=buttons.nth(i);if(await button.isVisible()){add=button;break;}}
    assert(add,'Visible add-to-cart button required');
    for(let attempt=0;attempt<12&&!await add.isEnabled();attempt++){await size.click();await page.waitForTimeout(500);}
    if(!await add.isEnabled())console.log('GA4_CART_CONTROL_DIAGNOSTICS',JSON.stringify(await page.locator('.sizes button,button[class*="addButton"]').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,pressed:n.getAttribute('aria-pressed'),disabled:n.disabled,className:n.className})))));
    assert(await add.isEnabled(),'Product size selection must enable original Add to Cart');
    const additions=()=>page.evaluate(()=>window.__ga4CartEvents.filter(e=>e.name==='add_to_cart'));
    await add.click();await page.waitForFunction(()=>window.__ga4CartEvents.filter(e=>e.name==='add_to_cart').length===1);
    await page.waitForTimeout(300);await add.click();await page.waitForFunction(()=>window.__ga4CartEvents.filter(e=>e.name==='add_to_cart').length===2);
    const emitted=await additions();assert.equal(emitted.length,2);assert(emitted.every(e=>e.params.items[0].quantity===1&&e.params.value===1699));
    await page.waitForTimeout(300);failed=true;await add.click();await page.waitForTimeout(500);assert.equal((await additions()).length,2,'Rejected addition must not be counted');
    assert.deepEqual(blocked,[],'Unexpected shopping write attempt');assert.equal(simulatedWrites,3);
    const purchaseOrder='GA4-ISOLATED-CAPTURED';
    await page.goto(base+'/order-confirmed?order='+purchaseOrder,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__ga4CartEvents.some(e=>e.name==='purchase'));
    const purchases=await page.evaluate(()=>window.__ga4CartEvents.filter(e=>e.name==='purchase'));
    assert.equal(purchases.length,1);assert.equal(purchases[0].params.value,3398);assert.equal(purchases[0].params.shipping,99);
    assert.equal(purchases[0].params.items[0].quantity,2);assert.equal(purchases[0].params.items[0].price,1699);
    for(const privateValue of ['isolated@example.test','0000000000','Isolated browser fixture','isolated-purchase-session'])assert(!JSON.stringify(purchases).includes(privateValue));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__ga4CartEvents.some(e=>e.name==='page_view'));
    await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.__ga4CartEvents.filter(e=>e.name==='purchase').length),0,'Reload must not repeat purchase');
    for(const status of ['REVIEW','FAILED']){
      const beforeReads=receiptReads;
      await page.goto(base+'/order-confirmed?order=GA4-ISOLATED-'+status,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__ga4CartEvents.some(e=>e.name==='page_view'));
      await page.waitForTimeout(500);assert(receiptReads>beforeReads,'Receipt endpoint must be intercepted');
      assert.equal(await page.evaluate(()=>window.__ga4CartEvents.filter(e=>e.name==='purchase').length),0,status+' must not count as purchase');
    }
    assert.deepEqual(blocked,[],'No unexpected live writes during purchase checks');
    reports.push({device:mobile?'mobile':'desktop',successfulEvents:2,rejectedEvents:0,purchaseEvents:1,duplicatePurchases:0,reviewPurchases:0,failedPurchases:0,isolatedReceiptReads:receiptReads,liveCartWrites:0,liveOrderWrites:0,originalButtonFlowRetained:true});
    console.log('GA4_PURCHASE_BROWSER_PASS',JSON.stringify(reports.at(-1)));
    await context.close();
  }
}finally{await browser.close();}
await mkdir('evidence/ga4-purchase',{recursive:true});
await writeFile('evidence/ga4-purchase/'+(live?'live':'candidate')+'.json',JSON.stringify({passed:true,live,sourceSha256:createHash('sha256').update(source).digest('hex'),results:reports,liveWrites:0},null,2));
