/** Real preserved-image route checks. All commerce writes are intercepted or blocked. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const brown='rgb(89, 29, 32)', ivory='rgb(255, 248, 239)', green='rgb(37, 211, 102)',greenInk='rgb(5, 66, 37)';
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const selectedClass=cls=>/(?:^|[\s_])(?:active|selected)(?:$|[\s_])|[A-Za-z](?:Active|Selected)(?:_|$)/.test(cls||'');
export async function probe(base, output, engines=(process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')) {
  await mkdir(output,{recursive:true});const results=[];let examined=0,telemetryRequestsBlocked=0,adminRefreshesIsolated=0;
  const catalogueResponse=await fetch(base+'/api/store/products');assert(catalogueResponse.ok,'Public catalogue must load');
  const products=await catalogueResponse.json();assert(Array.isArray(products),'Public catalogue shape');
  const product=products.find(value=>value.variants?.some(variant=>variant.available>0))||products[0];assert(product?.slug,'Product is required for real PDP verification');
  const runs=await Promise.allSettled(engines.map(async engine=>{
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{}),...(engine==='webkit'&&process.env.HIDI_WEBKIT_EXECUTABLE?{executablePath:process.env.HIDI_WEBKIT_EXECUTABLE}:{})});
    try{for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
      const context=await browser.newContext({viewport,hasTouch:viewport.width<1100,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(20000);
      const errors=[],unexpectedWrites=[],telemetryBlocked=[];page.on('pageerror',error=>errors.push({path:new URL(page.url()).pathname,message:error.message}));
      await context.route('**/*',async route=>{
        const request=route.request();if(!['GET','HEAD'].includes(request.method())){const url=new URL(request.url()),localPerformance=request.method()==='POST'&&url.origin===new URL(base).origin&&url.pathname==='/api/hidi/performance';const googleAnalytics=request.method()==='POST'&&['www.google-analytics.com','region1.google-analytics.com'].includes(url.hostname)&&['/g/collect','/collect'].includes(url.pathname);(localPerformance||googleAnalytics?telemetryBlocked:unexpectedWrites).push({method:request.method(),host:url.hostname,path:url.pathname});return route.abort();}
        if(process.env.HIDI_BUTTON_TEST_INJECT_SOURCE==='1'&&request.resourceType()==='document'){
          const response=await route.fetch(),type=response.headers()['content-type']||'';
          if(type.includes('text/html')){let html=await response.text();if(!/data-hidi-button-theme=/.test(html))html=html.replace(/<html\b/i,'<html data-hidi-button-theme="site"');const css='<link rel="stylesheet" data-hidi-button-states="v1" href="/button-states/buttons.css">',script=/<script\b[^>]*data-hidi-button-states=/.test(html)?'':'<script defer data-hidi-button-states="v1" src="/button-states/buttons.js"></script>';html=html.replace(/<\/head>/i,css+script+'</head>');return route.fulfill({response,body:html});}
          return route.fulfill({response});
        }
        return request.resourceType()==='media'?route.abort():route.continue();
      });
      if(process.env.HIDI_BUTTON_TEST_INJECT_SOURCE==='1')for(const name of ['buttons.css','buttons.js'])await context.route('**/button-states/'+name,route=>readFile(resolve('deploy/button-states',name)).then(body=>route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':'text/javascript',body})));
      const cart={items:[{id:'isolated-theme-line',quantity:1,lineTotalPaise:100000,product:{id:product.id,slug:product.slug,name:product.name,image:product.images?.[0]?.url||null},variant:{id:'isolated-theme-size',size:'M',color:'Fixture',available:4}}],itemCount:1,subtotalPaise:100000,shippingPaise:9900,totalPaise:109900};
      let cartAdds=0;
      await context.route('**/api/store/carts/**',route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();assert.equal(body.quantity,1);assert.equal(typeof body.variantId,'string');cartAdds++;}return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cart)});});
      await context.route('**/api/store/checkout/payment-options',route=>route.fulfill({status:200,contentType:'application/json',body:'{"cod":true,"online":true}'}));
      await context.route('**/api/store/checkout/delivery-serviceability?*',route=>route.fulfill({status:200,contentType:'application/json',body:'{"cod":true,"serviceable":true,"city":"Hyderabad","stateCode":"Telangana"}'}));
      await context.route('**/api/admin/session',route=>{const method=route.request().method();if(method==='GET'||method==='PUT'){if(method==='PUT')adminRefreshesIsolated++;return route.fulfill({status:401,contentType:'application/json',body:'{"message":"Admin session required"}'});}unexpectedWrites.push({method,path:'/api/admin/session'});return route.abort();});
      const pending=new Set();let navigationActivity=0;
      const tracked=request=>new URL(request.url()).searchParams.has('_rsc');
      page.on('request',request=>{if(tracked(request)){pending.add(request);navigationActivity=Date.now();}});
      const completed=request=>{if(tracked(request)){pending.delete(request);navigationActivity=Date.now();}};page.on('requestfinished',completed);page.on('requestfailed',completed);
      async function settle(){const started=Date.now();while(pending.size||Date.now()-Math.max(started,navigationActivity)<350){assert(Date.now()-started<20000,'Navigation did not settle');await delay(40);}}
      async function go(path){await settle();const response=await page.goto(base+path,{waitUntil:'domcontentloaded'});assert(response?.ok(),'Successful route '+path);await page.locator('body').waitFor();await delay(200);}
      async function assess(label,extra=''){
        await page.evaluate(()=>{document.activeElement?.blur();});await page.mouse.move(1,1);await delay(220);
        const controls=await page.locator('button:visible,summary:visible,input[type="submit"]:visible,input[type="button"]:visible,a.button:visible,a.button-dark:visible,a.button-light:visible,a.cart-checkout-button:visible'+(extra?','+extra:'')).evaluateAll(elements=>elements.map(element=>{
          const style=getComputedStyle(element),body=getComputedStyle(document.body),root=getComputedStyle(document.documentElement);
          return {tag:element.tagName,text:(element.getAttribute('aria-label')||element.textContent||element.value||'').trim().slice(0,120),className:element.className,pressed:element.getAttribute('aria-pressed'),selected:element.getAttribute('aria-selected'),expanded:element.getAttribute('aria-expanded'),current:element.getAttribute('aria-current'),checked:element.matches('label')&&!!element.querySelector('input:checked'),disclosureOpen:element.tagName==='SUMMARY'&&element.parentElement?.tagName==='DETAILS'&&element.parentElement.open,disabled:element.matches(':disabled')||element.getAttribute('aria-disabled')==='true',background:style.backgroundColor,color:style.color,border:style.borderTopColor,borderWidth:parseFloat(style.borderTopWidth),borderStyle:style.borderTopStyle,bodyBackground:body.backgroundColor,rootBackground:root.backgroundColor,pageBackground:root.getPropertyValue('--hidi-page-bg').trim(),hasPhoto:!!element.querySelector('img')||element.matches('.pdp-image.product-art,[class*="_photoButton_"],[class*="__photoButton"]'),isBackdrop:/backdrop|Backdrop/.test(element.className)};
        }));assert(controls.length>0,label+' has visible controls');
        for(const control of controls){
          if(control.hasPhoto||control.isBackdrop)continue;
          const isSelected=control.checked||control.disclosureOpen||control.pressed==='true'||control.selected==='true'||control.expanded==='true'||(control.current&&control.current!=='false')||selectedClass(control.className);
          const whatsapp=new URL(page.url()).pathname.startsWith('/products/')&&/^(?:Order|Continue) on WhatsApp/i.test(control.text);
          const bodyColor=control.bodyBackground!=='rgba(0, 0, 0, 0)'?control.bodyBackground:control.rootBackground!=='rgba(0, 0, 0, 0)'?control.rootBackground:'rgb(251, 246, 242)';
          assert.equal(control.background,whatsapp?green:isSelected?brown:bodyColor,label+' '+control.text+' background ('+control.className+', aria-pressed='+control.pressed+')');
          assert.equal(control.color,whatsapp?greenInk:isSelected?ivory:brown,label+' '+control.text+' text');
          assert.equal(control.border,whatsapp?green:brown,label+' '+control.text+' border');
          assert(control.borderWidth>=1&&control.borderStyle!=='none',label+' '+control.text+' visible border');examined++;
        }
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' has no horizontal overflow');
        results.push({engine,...viewport,surface:label,controls:controls.length,status:'PASS'});if(process.env.HIDI_BUTTON_DEBUG==='1')console.log('CHECK '+engine+' '+viewport.width+' '+label);return controls;
      }
      try{
        await go('/');await page.locator('.site-header').waitFor();await assess('home');
        await page.getByRole('button',{name:'Search',exact:true}).first().click();await page.getByRole('dialog',{name:'Search HIDI',exact:true}).waitFor();await assess('header search');await page.keyboard.press('Escape');
        if(viewport.width<=900){const menu=page.getByRole('button',{name:/Open navigation|Open menu|Menu/i}).first();if(await menu.count()){await menu.click();await assess('mobile navigation');await page.keyboard.press('Escape');}}
        await go('/collections/all');await assess('collection');
        const filter=page.getByRole('button',{name:viewport.width<=720?'Filter & Sort':'Filter',exact:true});
        if(await filter.count()){await filter.click();const dialog=page.getByRole('dialog',{name:'Product filters'});await dialog.waitFor();await assess('filter dialog');const option=dialog.getByRole('checkbox').first();if(await option.count()){await option.check();assert(await option.isChecked());}const apply=dialog.getByRole('button',{name:/Show \d+ styles/});await apply.click();await dialog.waitFor({state:'hidden'});await assess('applied filters');const clear=page.getByRole('button',{name:'Clear all filters',exact:true});if(await clear.count())await clear.click();}
        if(viewport.width<=720){for(const name of ['Show one product per row','Show two products per row']){const button=page.getByRole('button',{name,exact:true});if(await button.count()){await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');await assess('collection '+name);}}}
        const quick=page.getByRole('button',{name:'Quick add — '+product.name,exact:true}).first();
        if(await quick.count()){await quick.click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:product.name,exact:true})});await dialog.waitFor();await assess('quick add unselected');const choice=dialog.locator('button[aria-pressed="false"]:enabled').last();if(await choice.count()){await choice.click();await assess('quick add selected');const add=dialog.getByRole('button',{name:'Add to bag',exact:true});if(await add.isEnabled()){await add.click();await dialog.getByRole('button',{name:/Added to bag/}).waitFor();await assess('quick add success');}}await page.keyboard.press('Escape');}
        await go('/products/'+product.slug);await page.locator('details').filter({has:page.getByText('Shipping & Returns',{exact:true})}).waitFor();if(process.env.HIDI_BUTTON_TEST_INJECT_SOURCE!=='1'||await page.locator('[data-hidi-react-pdp]').count())await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor();else await page.locator('.sizes button').first().waitFor();await assess('product unselected');
        const size=page.locator('.sizes button[aria-pressed]:enabled').first();if(await size.count()){await size.click();await page.waitForFunction(element=>element.getAttribute('aria-pressed')==='true',await size.elementHandle());assert.equal(await size.getAttribute('aria-pressed'),'true');await assess('product selected size');await size.click();await page.waitForFunction(element=>element.getAttribute('aria-pressed')==='false',await size.elementHandle());assert.equal(await size.getAttribute('aria-pressed'),'false');await assess('product deselected size');}
        const whatsapp=page.getByRole('button',{name:/^Order on WhatsApp/}).first();if(await whatsapp.count()){assert.equal(await whatsapp.evaluate(element=>getComputedStyle(element).backgroundColor),green);if(await whatsapp.isEnabled()){await whatsapp.click();await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Your selection, ready to share.',exact:true})}).waitFor();await assess('WhatsApp product dialog');await page.getByRole('button',{name:'Close WhatsApp selection',exact:true}).click();}}
        await go('/cart');await page.locator('.summary-total').waitFor();await assess('cart');assert.match(await page.locator('.order-summary').innerText(),/Shipping\s*₹99/);
        const edit=page.getByRole('button',{name:/Edit size/}).first();if(await edit.count()){await edit.click();await assess('cart edit size');const cancel=page.getByRole('button',{name:'Cancel',exact:true}).first();if(await cancel.count())await cancel.click();}
        await go('/checkout');await page.getByRole('textbox',{name:'Mobile number',exact:true}).waitFor();await assess('checkout', '.checkout-payment-methods label:visible');
        const pin=page.getByRole('textbox',{name:'PIN code',exact:true});await pin.fill('500001');await pin.blur();await page.getByText('Pay the full amount when your order arrives',{exact:true}).waitFor();const cod=page.getByRole('radio',{name:/Cash on delivery/});if(viewport.width<=720&&await page.locator('.checkout-mobile-summary').evaluate(element=>element.open)){await page.locator('.checkout-mobile-summary > summary').click();assert.equal(await page.locator('.checkout-mobile-summary').evaluate(element=>element.open),false,'Customer can collapse the summary to expose payment choices');}await cod.check();assert(await cod.isChecked());await assess('checkout COD selected','.checkout-payment-methods label:visible');await page.getByRole('radio',{name:/Pay online/}).check();await assess('checkout online reselected','.checkout-payment-methods label:visible');
        const signin=page.getByRole('link',{name:'Sign In',exact:true}),guest=page.getByRole('button',{name:'Continue as Guest',exact:true});const [signBox,guestBox]=await Promise.all([signin.boundingBox(),guest.boundingBox()]);assert(guestBox.y>=signBox.y+signBox.height,'Guest stays below Sign In');assert.match(await page.locator('.checkout-summary').innerText(),/Shipping\s*₹99/);assert.match(await page.locator('.checkout-summary').innerText(),/1,099/);
        const mobile=page.getByRole('textbox',{name:'Mobile number',exact:true});await mobile.fill('+91 (987) abc654-3210');assert.equal(await mobile.inputValue(),'+919876543210');
        await go('/account');await assess('account');await go('/account/rewards');await page.getByRole('link',{name:'Sign in to view rewards',exact:true}).waitFor();await assess('rewards','a[class*="button" i]:visible');
        const adminPaths=['/admin','/admin/products','/admin/products/price-tags','/admin/inventory',...(process.env.HIDI_BUTTON_TEST_INJECT_SOURCE==='1'?[]:['/admin/landing-media','/admin/packing-scanner','/packing-scanner-control.html','/admin/product-quick-fill','/admin/product-bulk','/admin/product-delete?product=nonexistent-theme-fixture'])];
        for(const path of adminPaths){await go(path);await assess('admin '+path,'nav[aria-label="Admin navigation"] a:visible');}
        await settle();assert.deepEqual(errors,[],'Unexpected page exceptions');assert.deepEqual(unexpectedWrites,[],'No unexpected real writes');
        const previous=process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;if(engine==='webkit')process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';try{await page.screenshot({path:join(output,`${engine}-${viewport.width}-states.png`),fullPage:true});}finally{if(previous===undefined)delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY=previous;}
        console.log(`PASS ${engine} ${viewport.width}: home, search, collection, filters, quick add, product, WhatsApp, cart, payment choices and account; ${cartAdds} isolated cart additions`);
      }catch(error){
        const previous=process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;if(engine==='webkit')process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
        try{await page.screenshot({path:join(output,`${engine}-${viewport.width}-failure.png`),fullPage:true}).catch(()=>{});}finally{if(previous===undefined)delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY=previous;}
        await writeFile(join(output,'report.json'),JSON.stringify({passed:false,engine,...viewport,sourceThemeInjected:process.env.HIDI_BUTTON_TEST_INJECT_SOURCE==='1',examinedControls:examined,results,error:error.stack},null,2));throw error;
      }finally{telemetryRequestsBlocked+=telemetryBlocked.length;await context.close();}
    }}finally{await browser.close();}
  }));
  const failure=runs.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  const report={scope:process.env.HIDI_BUTTON_TEST_INJECT_SOURCE==='1'?'Production Next build with exact source theme assets; isolated API':'Actual candidate/live rendered pages; real commerce writes blocked; cart and anonymous admin-session requests isolated',passed:true,sourceThemeInjected:process.env.HIDI_BUTTON_TEST_INJECT_SOURCE==='1',engines,viewports:[320,390,844,1440],examinedControls:examined,liveWrites:0,telemetryRequestsBlocked,adminRefreshesIsolated,results};await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert(process.argv[2],'Base URL required');await probe(process.argv[2],process.argv[3]||'evidence/button-states/probes');}
