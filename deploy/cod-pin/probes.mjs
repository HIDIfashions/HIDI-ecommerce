import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';
const pw=await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const pause=ms=>new Promise(done=>setTimeout(done,ms));
export async function probe(base,output,engines=(process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')) {
  await mkdir(output,{recursive:true}); const results=[];
  for(const engine of engines) {
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try { for(const viewport of [{width:390,height:844},{width:1440,height:900}]) {
      const context=await browser.newContext({viewport,hasTouch:viewport.width<=844,reducedMotion:'reduce'}),page=await context.newPage(); page.setDefaultTimeout(20000);
      const errors=[],unexpectedWrites=[],prepares=[],pinRequests=[]; let subtotal=100000,shipping=9900,codPin=true,codOption=true,failPrepare=false,empty=false;
      page.on('pageerror',error=>errors.push(error.message));
      const pending=new Set(),navigationFailures=[];let navigationActivity=0;
      const tracked=request=>new URL(request.url()).searchParams.has('_rsc');
      page.on('request',request=>{if(tracked(request)){pending.add(request);navigationActivity=Date.now();}});
      const completed=request=>{if(tracked(request)){pending.delete(request);navigationActivity=Date.now();}};
      page.on('requestfinished',completed);
      page.on('requestfailed',request=>{if(tracked(request))navigationFailures.push({url:request.url(),reason:request.failure()?.errorText});completed(request);});
      const settle=async()=>{const started=Date.now();while(pending.size||Date.now()-Math.max(started,navigationActivity)<500){assert(Date.now()-started<25000,'Next navigation and prefetch requests settle');await pause(40);}};
      const cart=()=>({itemCount:empty?0:1,subtotalPaise:subtotal,shippingPaise:shipping,totalPaise:subtotal+shipping,items:empty?[]:[{id:'isolated-checkout-line',quantity:1,lineTotalPaise:subtotal,product:{id:'fixture-product',slug:'fixture-checkout-style',name:'Floral Kurta Set',image:null},variant:{id:'fixture-size',size:'L',color:'Burnt Orange',available:4}}]});
      await context.addInitScript(()=>{localStorage.removeItem('hidi_supabase_session');localStorage.setItem('hidi_cart_session','b4acfcb8-010e-4afa-9ba5-987890bcc417');});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.hostname==='checkout.razorpay.com')return route.fulfill({status:200,contentType:'text/javascript',body:`window.Razorpay=class { constructor(options){window.__checkoutOptions=options;} on(){} open(){window.__checkoutOpened=(window.__checkoutOpened||0)+1;} close(){}};`});
        if(url.pathname.includes('/api/store/carts/')) { assert(['GET','HEAD'].includes(request.method())); return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cart())}); }
        if(url.pathname.includes('/api/store/checkout/confirmation/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({orderNumber:'ISOLATED-UI-COD',status:'CONFIRMED',createdAt:'2026-10-11T04:00:00Z',subtotalPaise:subtotal,shippingPaise:shipping,totalPaise:subtotal+shipping,discountPaise:0,taxPaise:0,customerPhone:'+919876543210',shippingAddress:{firstName:'Isolated',line1:'Fixture street',city:'Hyderabad',state:'Telangana',postalCode:'500001',countryCode:'IN'},payment:{provider:'COD',status:'PENDING',amountPaise:subtotal+shipping},items:cart().items.map(item=>({...item,productName:item.product.name,slug:item.product.slug,size:item.variant.size,color:item.variant.color,unitPricePaise:subtotal,totalPaise:subtotal}))})});
        if(url.pathname.endsWith('/checkout/payment-options'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({cod:codOption,online:true})});
        if(url.pathname.endsWith('/checkout/delivery-serviceability')){
          const pin=url.searchParams.get('pin');pinRequests.push(pin);
          const allowed=codPin&&pin!=='500002';
          if(pin==='500003')await pause(900);
          if(pin==='500004')return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Isolated lookup failure"}'});
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({cod:allowed,serviceable:allowed,city:'Hyderabad',stateCode:'Telangana'})});
        }
        if(url.pathname.endsWith('/checkout/prepare')) {
          const body=request.postDataJSON();prepares.push(body);assert.equal(body.expectedPayableTotalPaise,subtotal+shipping);assert.equal(body.shippingAddress.countryCode,'IN');
          await pause(120);
          const value=failPrepare?{message:'Payment fixture unavailable'}:body.paymentMethod==='COD'?{provider:'COD',confirmed:true,captured:false,orderNumber:'ISOLATED-UI-COD',status:'CONFIRMED',amountPaise:subtotal+shipping,totalPaise:subtotal+shipping,subtotalPaise:subtotal,shippingPaise:shipping,walletAppliedPaise:0,currency:'INR'}:{provider:'RAZORPAY',captured:false,orderNumber:'ISOLATED-UI-ONLINE',status:'PENDING_PAYMENT',amountPaise:subtotal+shipping,totalPaise:subtotal+shipping,subtotalPaise:subtotal,shippingPaise:shipping,walletAppliedPaise:0,currency:'INR',razorpayKeyId:'rzp_test_isolated_ui',providerOrderId:'isolated_provider_order'};
          return route.fulfill({status:failPrepare?503:200,contentType:'application/json',body:JSON.stringify(value)});
        }
        if(!['GET','HEAD'].includes(request.method())) { if(!isBlockedTelemetry(request.method(),request.url(),new URL(base).origin))unexpectedWrites.push({method:request.method(),path:url.pathname});return route.abort(); }
        if(request.resourceType()==='media')return route.abort();
        return route.continue();
      });
      const go=async()=>{await settle();const response=await page.goto(base+'/checkout',{waitUntil:'domcontentloaded'});assert(response.ok());await page.locator('.checkout-pay-button').waitFor();await pause(250);await settle();};
      const geometry=async()=>{
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
        const header=await page.locator('.site-header').boundingBox();assert(header.y>=-1 && header.y<2,'Header fixed at the top');
        const button=await page.locator('.checkout-pay-button').boundingBox(); assert(button && button.width>=140,'Payment action has a usable touch target');
        if(viewport.width<=720) {
          const bar=await page.locator('.checkout-payment-action').boundingBox();assert(Math.abs(bar.y+bar.height-viewport.height)<=2,'Payment footer fixed to viewport bottom');assert(button.y>=bar.y&&button.y+button.height<=viewport.height,'Button stays inside footer');
          assert(await page.locator('.checkout-action-total').isVisible(),'Mobile total is visible');
          await page.locator('.checkout-pay-button').evaluate(e=>{const r=e.getBoundingClientRect();if(!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw new Error('Payment action is covered');});
        } else { const summary=await page.locator('.checkout-summary').boundingBox();assert(button.x>=summary.x&&button.x+button.width<=summary.x+summary.width+1,'Desktop action is inside the order summary'); }
      };
      try {
        await go(); await geometry();
        assert.equal(await page.locator('.checkout-pay-button').count(),1,'Single submit action');assert.equal(await page.locator('.checkout-pay-button').evaluate(e=>e.form?.id),'hidi-checkout-form','External action uses original native form');
        assert.equal(await page.locator('.checkout-back-link').getAttribute('href'),'/cart');
        const sign=page.getByRole('link',{name:'Sign In',exact:true}),guest=page.getByRole('button',{name:'Continue as Guest',exact:true});
        await sign.scrollIntoViewIfNeeded();await settle();
        assert.equal(await sign.getAttribute('href'),'/account?returnTo=%2Fcheckout');const sb=await sign.boundingBox(),gb=await guest.boundingBox();assert(gb.y>=sb.y+sb.height,'Guest is below highlighted sign-in');
        assert.equal(await sign.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(89, 29, 32)');
        assert.equal(await page.locator('.checkout-pay-button > span').evaluate(e=>getComputedStyle(e).color),'rgb(255, 248, 239)','Payment button copy has high contrast');
        assert.match(await page.locator('.checkout-summary').textContent(),/Shipping\s*₹99/);assert.match(await page.locator('.checkout-payment-action').innerText(),/1,099/);
        if(viewport.width<=720){assert(await page.locator('.checkout-mobile-summary').evaluate(e=>e.open),'Charged shipping remains disclosed');await page.locator('.checkout-mobile-summary > summary').click();assert(!(await page.locator('.checkout-mobile-summary').evaluate(e=>e.open)));}
        const cod=page.getByRole('radio',{name:/Cash on delivery/});assert(await cod.isDisabled());
        await guest.click();assert.match(await page.locator('.checkout-guest-status').innerText(),/Continuing as guest/);
        await page.locator('.checkout-pay-button').click();await pause(200);assert.equal(prepares.length,0,'Incomplete form cannot prepare an order');
        const phone=page.getByRole('textbox',{name:'Mobile number',exact:true});await phone.fill('+91 (987) a654-3210');assert.equal(await phone.inputValue(),'+919876543210');
        await page.getByRole('textbox',{name:'Email address',exact:true}).fill('isolated-ui@example.test');await page.getByRole('textbox',{name:'First name',exact:true}).fill('Isolated');await page.getByRole('textbox',{name:'House, building and street address',exact:true}).fill('Fixture street');
        const pin=page.getByRole('textbox',{name:'PIN code',exact:true});
        const codAvailable=()=>page.waitForFunction(()=>!document.querySelector('input[value="COD"]').disabled);
        // Emulate a browser restoring the whole address without input/change/blur events.
        await page.evaluate(()=>{for(const [key,value] of Object.entries({firstName:'Isolated',line1:'Fixture cached street',postalCode:'500001',city:'Hyderabad',state:'Telangana'}))document.querySelector(`input[name="${key}"]`).value=value;});
        await codAvailable();assert.equal(await pin.inputValue(),'500001');await cod.check();assert(await cod.isChecked());
        assert.equal(pinRequests.filter(value=>value==='500001').length,1,'One lookup for a silently restored PIN');
        // Autofill emits change in some browsers, but never focuses or blurs the PIN field.
        await pin.evaluate(e=>{e.value='500002';e.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.getByText('Unavailable for this PIN code',{exact:true}).waitFor();assert(await cod.isDisabled());assert(await page.getByRole('radio',{name:/Pay online/}).isChecked(),'Autofill changes reset COD');
        // Pasted input is checked while the field is still focused.
        await pin.focus();await pin.evaluate(e=>{e.value='500001';e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:'500001'}));});
        await codAvailable();assert(await pin.evaluate(e=>document.activeElement===e),'No PIN blur needed');
        await pin.fill('5000');assert(await cod.isDisabled());await pause(350);assert(!pinRequests.includes('5000'),'Incomplete PIN sends no lookup');
        await pin.fill('000001');await pause(350);assert(!pinRequests.includes('000001'),'Invalid PIN sends no lookup');
        await pin.fill('500004');await page.locator('.checkout-delivery-unavailable').waitFor();assert(await cod.isDisabled(),'Lookup failure keeps COD disabled');
        await pin.fill('500003');await page.waitForFunction(()=>document.querySelector('#checkout-pin-status')?.textContent.includes('Checking'));
        await pin.fill('500002');await page.getByText('Unavailable for this PIN code',{exact:true}).waitFor();await pause(1100);assert(await cod.isDisabled(),'Late serviceable response cannot enable COD for a different PIN');
        await pin.fill('500001');await codAvailable();const checkedCount=pinRequests.length;await pause(600);assert.equal(pinRequests.length,checkedCount,'Polling does not repeat a completed lookup');
        await page.getByRole('textbox',{name:'City',exact:true}).fill('Hyderabad');await page.getByRole('textbox',{name:'State',exact:true}).fill('Telangana');
        await page.locator('.checkout-reservation-details > summary').click();assert.match(await page.locator('.checkout-reservation-details').innerText(),/15 minutes/);await page.locator('.checkout-reservation-details > summary').click();
        await page.evaluate(()=>{const button=document.querySelector('.checkout-pay-button');button.click();button.click();});await page.waitForFunction(()=>window.__checkoutOpened===1);assert.equal(prepares.length,1,'Double submit prepares once');assert.equal(await page.evaluate(()=>window.__checkoutOptions.amount),109900,'Razorpay receives confirmed total');assert.equal(prepares[0].customerPhone,'+919876543210');
        await page.evaluate(()=>window.__checkoutOptions.modal.ondismiss());await page.waitForFunction(()=>!document.querySelector('.checkout-pay-button').disabled);
        failPrepare=true;await page.locator('.checkout-pay-button').click();await page.getByRole('alert').filter({hasText:'Payment fixture unavailable'}).waitFor();assert.equal(prepares[1].checkoutToken,prepares[0].checkoutToken,'Retry keeps idempotency token');assert(await page.locator('.checkout-pay-button').isEnabled());failPrepare=false;
        await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await geometry();
        if(viewport.width<=720){const footer=page.locator('.footer-bottom');await footer.scrollIntoViewIfNeeded();const fb=await footer.boundingBox(),bar=await page.locator('.checkout-payment-action').boundingBox();assert(fb.y+fb.height<=bar.y+2,'Footer support/policy links are clear of payment bar');}
        await settle();
        await cod.check();await settle();await page.locator('.checkout-pay-button').click();await page.waitForURL(/order-confirmed\?order=ISOLATED-UI-COD/);await page.getByText('ISOLATED-UI-COD',{exact:true}).waitFor();assert.equal(prepares.at(-1).paymentMethod,'COD');assert.equal(await page.evaluate(()=>window.__checkoutOpened||0),1,'COD does not open the gateway');
        for(const [value,fee,label] of [[149899,9900,'1,597.99'],[149900,0,'1,499'],[249900,0,'2,499']]) {subtotal=value;shipping=fee;await go();assert.match(await page.locator('.checkout-payment-action').innerText(),new RegExp(label.replace('.','\\.')));assert.match(await page.locator('.checkout-summary').textContent(),fee?/Shipping\s*₹99/:/Shipping\s*Complimentary/);await geometry();}
        codOption=false;await go();assert(await page.getByRole('radio',{name:/Cash on delivery/}).isDisabled());assert.match(await page.locator('.checkout-payment-methods').innerText(),/Temporarily unavailable/);
        await page.locator('.checkout-payment-methods').scrollIntoViewIfNeeded();await geometry();
        await page.evaluate(()=>document.activeElement?.blur());
        await page.screenshot({path:output+'/'+engine+'-'+viewport.width+'-checkout.png'});
        await settle();empty=true;await page.goto(base+'/checkout',{waitUntil:'domcontentloaded'});await page.getByText('Your bag is empty.',{exact:true}).waitFor();await settle();assert(await page.locator('.checkout-back-link').isVisible(),'Empty bag retains Back to bag');assert.equal(await page.locator('.checkout-pay-button').count(),0,'Empty bag has no stale submit action');
        assert.deepEqual(unexpectedWrites,[],'No production write escaped interception');assert.deepEqual(errors,[],'No checkout JavaScript exceptions');
        results.push({engine,...viewport,passed:true,checks:['native-form-validation','shipping-thresholds','fixed-header','fixed-mobile-payment-footer','guest','COD-PIN-reset','COD-unavailable','online-payment-total','double-submit','idempotent-retry','COD-no-gateway','footer-clearance','no-overflow'],isolatedPrepares:prepares.length,realWrites:0});console.log('PASS '+engine+' '+viewport.width+': checkout layout and isolated payment regression');
      } catch(error) { await writeFile(output+'/'+engine+'-'+viewport.width+'-failure.html',await page.content());await page.screenshot({path:output+'/'+engine+'-'+viewport.width+'-failure.png',fullPage:true}).catch(()=>{});await writeFile(output+'/report.json',JSON.stringify({passed:false,engine,viewport,error:error.stack,errors,navigationFailures,results},null,2));throw error; }
      finally {await context.close();}
    } } finally {await browser.close();}
  }
  const report={passed:true,engines,viewports:[390,1440],results,realWrites:0};await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[2])await probe(process.argv[2],process.argv[3]||'evidence/cod-pin/probes');
