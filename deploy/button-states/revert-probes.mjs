/** Verify the exact pre-button-change UI. Commerce writes are fulfilled locally or blocked. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from './request-policy.mjs';
const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const brown='rgb(89, 29, 32)', ivory='rgb(255, 248, 239)';
assert.notEqual(process.env.HIDI_BUTTON_TEST_INJECT_SOURCE,'1','A revert gate must test actual pages without injected assets');
assert.notEqual(process.env.HIDI_BUTTON_TEST_INJECT_THEME,'1','A revert gate must test actual pages without injected assets');
const delay=ms=>new Promise(done=>setTimeout(done,ms));
// Proven in the unmodified retained SSR/assets baseline in all three engines.
const retainedHydrationError='Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.';
/** The retained landing and commerce headers use distinct accessible trigger names. */
export async function verifyHeaderDialogs(page, assess) {
  const header=page.locator('.site-header');await header.waitFor();
  await header.getByRole('button',{name:/^(?:Search|Search HIDI products)$/}).first().click();
  const search=page.getByRole('dialog',{name:'Search HIDI',exact:true});await search.waitFor();
  await assess('header search');await page.keyboard.press('Escape');await search.waitFor({state:'hidden'});
  const menu=header.getByRole('button',{name:/^(?:Open HIDI menu|Open navigation|Open menu|Menu)$/}).first();
  if(await menu.count()){
    const legacy=await menu.getAttribute('aria-label')==='Open HIDI menu',element=await menu.elementHandle();
    await menu.click();await page.waitForFunction(button=>button.getAttribute('aria-expanded')==='true',element);
    const navigation=page.getByRole('dialog',{name:legacy?'The world of HIDI.':'Mobile navigation',exact:true});
    await navigation.waitFor();await assess(legacy?'HIDI navigation':'mobile navigation');
    await page.keyboard.press('Escape');await navigation.waitFor({state:'hidden'});
    assert.equal(await element.getAttribute('aria-expanded'),'false','Closing navigation clears the selected trigger');
  }
}
/** Preserved Next releases may predate ProductPageShell's hydration marker. */
export async function waitForProductControls(page) {
  await page.locator('.product-page').waitFor();
  if(await page.locator('[data-hidi-react-pdp]').count())await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor({state:'attached'});
  const size=page.locator('.sizes button[aria-pressed]:enabled').first();await size.waitFor();
  return size;
}
export async function probe(base, output, engines=(process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')) {
  await mkdir(output,{recursive:true});const results=[],baselineHydrationErrors=[];let examined=0,telemetryRequestsBlocked=0,adminRefreshesIsolated=0;
  const catalogueResponse=await fetch(base+'/api/store/products');assert(catalogueResponse.ok,'Public catalogue must load');
  const products=await catalogueResponse.json();assert(Array.isArray(products),'Public catalogue shape');
  const product=products.find(value=>value.variants?.some(variant=>variant.available>0))||products[0];assert(product?.slug,'Product is required for real PDP verification');
  const runs=await Promise.allSettled(engines.map(async engine=>{
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{}),...(engine==='webkit'&&process.env.HIDI_WEBKIT_EXECUTABLE?{executablePath:process.env.HIDI_WEBKIT_EXECUTABLE}:{})});
    try{for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
      const context=await browser.newContext({viewport,hasTouch:viewport.width<1100,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(20000);
      const errors=[],unexpectedWrites=[],telemetryBlocked=[];let legacyProduct=false,legacyAdminTools=false;page.on('pageerror',error=>errors.push({path:new URL(page.url()).pathname,message:error.message}));
      await context.route('**/*',async route=>{
        const request=route.request();if(!['GET','HEAD'].includes(request.method())){const url=new URL(request.url()),telemetry=isBlockedTelemetry(request.method(),request.url(),new URL(base).origin);(telemetry?telemetryBlocked:unexpectedWrites).push({method:request.method(),host:url.hostname,path:url.pathname});return route.abort();}
        return request.resourceType()==='media'?route.abort():route.continue();
      });
      const cart={items:[{id:'isolated-theme-line',quantity:1,lineTotalPaise:100000,product:{id:product.id,slug:product.slug,name:product.name,image:product.images?.[0]?.url||null},variant:{id:'isolated-theme-size',size:'M',color:'Fixture',available:4}}],itemCount:1,subtotalPaise:100000,shippingPaise:9900,totalPaise:109900};
      let cartAdds=0;
      await context.route('**/api/store/carts/**',route=>{const method=route.request().method();if(!['GET','HEAD','POST'].includes(method)){unexpectedWrites.push({method,path:new URL(route.request().url()).pathname});return route.abort();}if(method==='POST'){const body=route.request().postDataJSON();assert.equal(body.quantity,1);assert.equal(typeof body.variantId,'string');cartAdds++;}return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cart)});});
      await context.route('**/api/store/checkout/payment-options',route=>route.fulfill({status:200,contentType:'application/json',body:'{"cod":true,"online":true}'}));
      await context.route('**/api/store/checkout/delivery-serviceability?*',route=>route.fulfill({status:200,contentType:'application/json',body:'{"cod":true,"serviceable":true,"city":"Hyderabad","stateCode":"Telangana"}'}));
      await context.route('**/api/admin/session',route=>{const method=route.request().method();if(method==='GET'||method==='PUT'){if(method==='PUT')adminRefreshesIsolated++;return route.fulfill({status:401,contentType:'application/json',body:'{"message":"Admin session required"}'});}unexpectedWrites.push({method,path:'/api/admin/session'});return route.abort();});
      const pending=new Set();let navigationActivity=0;
      const tracked=request=>new URL(request.url()).searchParams.has('_rsc');
      page.on('request',request=>{if(tracked(request)){pending.add(request);navigationActivity=Date.now();}});
      const completed=request=>{if(tracked(request)){pending.delete(request);navigationActivity=Date.now();}};page.on('requestfinished',completed);page.on('requestfailed',completed);
      async function settle(){const started=Date.now();while(pending.size||Date.now()-Math.max(started,navigationActivity)<350){assert(Date.now()-started<20000,'Navigation did not settle');await delay(40);}}
      async function go(path){await settle();const response=await page.goto(base+path,{waitUntil:'domcontentloaded'});assert(response?.ok(),'Successful route '+path);if(path==='/admin/products')legacyAdminTools=/data-hidi-admin-quick-tools/.test(await response.text());await page.locator('body').waitFor();await page.waitForFunction(()=>Array.from(document.querySelectorAll('script[src]:not([nomodule])')).filter(script=>new URL(script.src).origin===location.origin&&(new URL(script.src).pathname.startsWith('/_next/')||script.type==='module')).every(script=>performance.getEntriesByName(script.src).length>0));await delay(200);}
      async function assess(label,extra='',includeHidden=false){
        await page.evaluate(()=>{document.activeElement?.blur();});await page.mouse.move(1,1);
        await page.evaluate(async()=>{const controls=Array.from(document.querySelectorAll('button,summary,input[type="submit"],input[type="button"],a.button,a.button-dark,a.button-light,a.cart-checkout-button,label:has(input[type="radio"]),label:has(input[type="checkbox"])'));controls.forEach(element=>getComputedStyle(element).backgroundColor);const transitions=controls.flatMap(element=>element.getAnimations()).filter(animation=>animation.constructor.name==='CSSTransition'&&Number.isFinite(animation.effect?.getComputedTiming().endTime));await Promise.all(transitions.map(animation=>animation.finished.catch(()=>{})));});await delay(40);
        const visible=includeHidden?'':':visible';
        const controls=await page.locator(['button','summary','input[type="submit"]','input[type="button"]','a.button','a.button-dark','a.button-light','a.cart-checkout-button'].map(selector=>selector+visible).join(',')+(extra?','+extra:'')).evaluateAll(elements=>elements.map(element=>{
          const style=getComputedStyle(element),body=getComputedStyle(document.body),root=getComputedStyle(document.documentElement);
          return {tag:element.tagName,text:(element.getAttribute('aria-label')||element.textContent||element.value||'').trim().slice(0,120),className:element.className,pressed:element.getAttribute('aria-pressed'),selected:element.getAttribute('aria-selected'),expanded:element.getAttribute('aria-expanded'),current:element.getAttribute('aria-current'),checked:element.matches('label')&&!!element.querySelector('input:checked'),disclosureOpen:element.tagName==='SUMMARY'&&element.parentElement?.tagName==='DETAILS'&&element.parentElement.open,disabled:element.matches(':disabled')||element.getAttribute('aria-disabled')==='true',background:style.backgroundColor,color:style.color,border:style.borderTopColor,borderWidth:parseFloat(style.borderTopWidth),borderStyle:style.borderTopStyle,fillVariable:style.getPropertyValue('--hidi-button-fill').trim(),inkVariable:style.getPropertyValue('--hidi-button-ink').trim(),transitionProperty:style.transitionProperty,transitionDuration:style.transitionDuration,bodyBackground:body.backgroundColor,rootBackground:root.backgroundColor,pageBackground:root.getPropertyValue('--hidi-page-bg').trim(),hasPhoto:!!element.querySelector('img')||element.matches('.pdp-image.product-art,[class*="_photoButton_"],[class*="__photoButton"]'),isBackdrop:/backdrop|Backdrop/.test(element.className)};
        }));assert(controls.length>0,label+' has visible controls');
        assert.equal(await page.locator('html').getAttribute('data-hidi-button-theme'),null,label+' removed the theme marker');
        assert.equal(await page.locator('[data-hidi-button-states],link[href*="/button-states/"],script[src*="/button-states/"]').count(),0,label+' removed all button overlay hooks and assets');
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--hidi-button-body').trim()),'',label+' removed the theme body variable');
        for(const control of controls){
          assert.equal(control.fillVariable,'',label+' '+control.text+' has no overlay fill variable');
          assert.equal(control.inkVariable,'',label+' '+control.text+' has no overlay ink variable');
          assert.notEqual(control.background,'',label+' '+control.text+' retains its original computed style');examined++;
        }
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' has no horizontal overflow');
        results.push({engine,...viewport,surface:label,controls:controls.length,status:'PASS'});if(process.env.HIDI_BUTTON_REVERT_DEBUG==='1')console.log('CHECK '+engine+' '+viewport.width+' '+label);return controls;
      }
      async function primaryPalette(locator,label,checkBorder=true){
        assert(await locator.count()>0,label+' retains the original action');
        const styles=await locator.evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return {background:style.backgroundColor,color:style.color,border:style.borderTopColor};}));
        for(const style of styles){assert.equal(style.background,brown,label+' original header-color background');assert.equal(style.color,ivory,label+' original ivory text');if(checkBorder)assert.equal(style.border,brown,label+' original header-color border');}
      }
      try{
        await go('/');await page.locator('.site-header').waitFor();await assess('home');await primaryPalette(page.locator('.button:visible'),'Home calls to action',false);
        await verifyHeaderDialogs(page,assess);
        await go('/collections/all');await assess('collection');
        const filter=page.getByRole('button',{name:viewport.width<=720?'Filter & Sort':'Filter',exact:true});
        if(await filter.count()){await filter.click();const dialog=page.getByRole('dialog',{name:'Product filters'});await dialog.waitFor();await assess('filter dialog');const option=dialog.getByRole('checkbox').first();if(await option.count()){await option.check();assert(await option.isChecked());}const apply=dialog.getByRole('button',{name:/Show \d+ styles/});await apply.click();await dialog.waitFor({state:'hidden'});await assess('applied filters');const clear=page.getByRole('button',{name:'Clear all filters',exact:true});if(await clear.count())await clear.click();}
        if(viewport.width<=720){for(const name of ['Show one product per row','Show two products per row']){const button=page.getByRole('button',{name,exact:true});if(await button.count()){await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');await assess('collection '+name);}}}
        const quick=page.getByRole('button',{name:'Quick add — '+product.name,exact:true}).first();
        if(await quick.count()){await quick.click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:product.name,exact:true})});await dialog.waitFor();await assess('quick add unselected');await primaryPalette(dialog.getByRole('button',{name:'Add to bag',exact:true}),'Quick Add action');const choice=dialog.locator('button[aria-pressed="false"]:enabled').last();if(await choice.count()){await choice.click();await assess('quick add selected');await primaryPalette(choice,'Quick Add selected size');const add=dialog.getByRole('button',{name:'Add to bag',exact:true});if(await add.isEnabled()){await add.click();await dialog.getByRole('button',{name:/Added to bag/}).waitFor();await assess('quick add success');}}await page.keyboard.press('Escape');}
        await go('/products/'+product.slug);await page.locator('details').filter({has:page.getByText('Shipping & Returns',{exact:true})}).waitFor();legacyProduct=await page.locator('[data-hidi-react-pdp]').count()===0;const size=await waitForProductControls(page);assert.equal(await size.getAttribute('aria-pressed'),'false');await assess('product unselected');
        await size.click();await page.waitForFunction(element=>element.getAttribute('aria-pressed')==='true',await size.elementHandle());assert.equal(await size.getAttribute('aria-pressed'),'true');await assess('product selected size');await primaryPalette(size,'Product selected size');await size.click();await page.waitForFunction(element=>element.getAttribute('aria-pressed')==='false',await size.elementHandle());assert.equal(await size.getAttribute('aria-pressed'),'false');await assess('product deselected size');assert.equal(await size.evaluate(element=>getComputedStyle(element).backgroundColor),await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'Deselected product size restores the body color');
        await size.click();await page.waitForFunction(element=>element.getAttribute('aria-pressed')==='true',await size.elementHandle());
        const whatsapp=page.locator('.product-page button[class*="product-contact-actions"][class*="whatsapp"]').first();assert.equal(await whatsapp.count(),1,'Product retains its WhatsApp order control');await assess('product action palette');await primaryPalette(whatsapp,'Original WhatsApp action');await primaryPalette(page.locator('.product-page [class*="purchaseActions"]').getByRole('button',{name:/^Add to (?:Cart|bag)$/,includeHidden:true}),'Original Add to Cart action');
        if(await whatsapp.isEnabled()){await whatsapp.click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Your selection, ready to share.',exact:true})});await dialog.waitFor();await assess('WhatsApp product dialog');const continuation=dialog.getByRole('button',{name:'Continue on WhatsApp',exact:true});await primaryPalette(continuation,'Original WhatsApp continuation');await page.getByRole('button',{name:'Close WhatsApp selection',exact:true}).click();await dialog.waitFor({state:'hidden'});}
        else{assert(await whatsapp.isDisabled(),'Unconfigured WhatsApp ordering remains disabled');const note=await whatsapp.getAttribute('aria-describedby');assert(note,'Unavailable WhatsApp action explains its status');assert.match(await page.locator('[id="'+note+'"]').textContent(),/WhatsApp ordering is not available yet/);results.push({engine,...viewport,surface:'Original WhatsApp unavailable state preserved',controls:1,status:'PASS'});examined++;}
        await go('/cart');await page.locator('.summary-total').waitFor();await assess('cart');assert.match(await page.locator('.order-summary').innerText(),/Shipping\s*₹99/);
        const edit=page.getByRole('button',{name:/Edit size/}).first();if(await edit.count()){await edit.click();await assess('cart edit size');const cancel=page.getByRole('button',{name:'Cancel',exact:true}).first();if(await cancel.count())await cancel.click();}
        await go('/checkout');await page.getByRole('textbox',{name:'Mobile number',exact:true}).waitFor();await assess('checkout', '.checkout-payment-methods label:visible');await primaryPalette(page.getByRole('link',{name:'Sign In',exact:true}),'Checkout Sign In');
        const pin=page.getByRole('textbox',{name:'PIN code',exact:true});await pin.fill('500001');await pin.blur();await page.getByText('Pay the full amount when your order arrives',{exact:true}).waitFor();const cod=page.getByRole('radio',{name:/Cash on delivery/});if(viewport.width<=720&&await page.locator('.checkout-mobile-summary').evaluate(element=>element.open)){await page.locator('.checkout-mobile-summary > summary').click();assert.equal(await page.locator('.checkout-mobile-summary').evaluate(element=>element.open),false,'Customer can collapse the summary to expose payment choices');}await cod.check();assert(await cod.isChecked());await assess('checkout COD selected','.checkout-payment-methods label:visible');await page.getByRole('radio',{name:/Pay online/}).check();await assess('checkout online reselected','.checkout-payment-methods label:visible');
        const signin=page.getByRole('link',{name:'Sign In',exact:true}),guest=page.getByRole('button',{name:'Continue as Guest',exact:true});const [signBox,guestBox]=await Promise.all([signin.boundingBox(),guest.boundingBox()]);assert(guestBox.y>=signBox.y+signBox.height,'Guest stays below Sign In');assert.match(await page.locator('.checkout-summary').innerText(),/Shipping\s*₹99/);assert.match(await page.locator('.checkout-summary').innerText(),/1,099/);
        const mobile=page.getByRole('textbox',{name:'Mobile number',exact:true});await mobile.fill('98a765-43');assert.equal(await mobile.inputValue(),'9876543');await mobile.fill('+919876543210');assert.equal(await mobile.inputValue(),'+919876543210');
        await go('/account');await assess('account');await go('/account/rewards');await page.getByRole('link',{name:'Sign in to view rewards',exact:true}).waitFor();await assess('rewards','a[class*="button" i]:visible');
        await go('/returns');await assess('returns');await go('/shipping');await assess('shipping');await go('/account/returns');await assess('account returns');await go('/wishlist');await assess('wishlist');
        const adminPaths=['/admin','/admin/products','/admin/products/price-tags','/admin/inventory','/admin/landing-media','/admin/packing-scanner','/packing-scanner-control.html','/admin/product-quick-fill','/admin/product-bulk','/admin/product-delete?product=nonexistent-theme-fixture','/admin/privacy-policy'];
        for(const path of adminPaths){await go(path);if(path==='/admin/landing-media'){await page.getByText('HIDI Admin sign-in required',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Go to Admin Sign-in',exact:true}).getAttribute('href'),'/admin/sign-in');assert.equal(await page.locator('#workspace').evaluate(element=>element.hidden),true,'Anonymous media workspace remains protected');assert.equal(await page.locator('html').getAttribute('data-hidi-button-theme'),null);await assess('admin '+path+' signed-out workspace','',true);}else if(path.startsWith('/admin/product-delete?')){await page.locator('#loading').waitFor({state:'hidden'});const signin=page.getByRole('link',{name:'Sign in to HIDI Admin',exact:true});await signin.waitFor();assert.equal(await signin.getAttribute('href'),'/admin/sign-in');assert.equal(await page.locator('#review').evaluate(element=>element.hidden),true,'Anonymous deletion controls remain protected');assert(await page.locator('#deleteButton').isDisabled(),'Anonymous deletion remains disabled');assert.equal(await page.locator('html').getAttribute('data-hidi-button-theme'),null);await assess('admin '+path+' signed-out deletion','',true);}else await assess('admin '+path,'nav[aria-label="Admin navigation"] a:visible');}
        await settle();const provenPaths=legacyProduct?['/products/'+product.slug,...(legacyAdminTools?['/admin/products']:[])]:[];const known=errors.filter(error=>provenPaths.includes(error.path)&&error.message===retainedHydrationError);for(const path of provenPaths)assert(known.filter(error=>error.path===path).length<=1,'Legacy hydration errors must not increase beyond one proven occurrence at '+path);baselineHydrationErrors.push(...known.map(error=>({engine,...viewport,...error})));assert.deepEqual(errors.filter(error=>!known.includes(error)),[],'Unexpected page exceptions');assert.deepEqual(unexpectedWrites,[],'No unexpected real writes');
        const previous=process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;if(engine==='webkit')process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';try{await page.screenshot({path:join(output,`${engine}-${viewport.width}-states.png`),fullPage:true});}finally{if(previous===undefined)delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY=previous;}
        console.log(`PASS ${engine} ${viewport.width}: home, search, collection, filters, quick add, product, WhatsApp, cart, payment choices and account; ${cartAdds} isolated cart additions`);
      }catch(error){
        await writeFile(join(output,`${engine}-${viewport.width}-failure.html`),await page.content()).catch(()=>{});
        const previous=process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;if(engine==='webkit')process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
        try{await page.screenshot({path:join(output,`${engine}-${viewport.width}-failure.png`),fullPage:true}).catch(()=>{});}finally{if(previous===undefined)delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY=previous;}
        await writeFile(join(output,'report.json'),JSON.stringify({passed:false,engine,...viewport,sourceThemeInjected:false,examinedControls:examined,results,pageErrors:errors,unexpectedWrites,error:error.stack},null,2));throw error;
      }finally{telemetryRequestsBlocked+=telemetryBlocked.length;await context.close();}
    }}finally{await browser.close();}
  }));
  const failure=runs.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  const report={scope:'Exact pre-button-change candidate/live pages; commerce writes blocked; cart and anonymous admin-session requests isolated',passed:true,sourceThemeInjected:false,engines,viewports:[320,390,844,1440],examinedControls:examined,liveWrites:0,telemetryRequestsBlocked,adminRefreshesIsolated,baselineHydrationErrors,results};await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert(process.argv[2],'Base URL required');await probe(process.argv[2],process.argv[3]||'evidence/button-states-revert/probes');}
