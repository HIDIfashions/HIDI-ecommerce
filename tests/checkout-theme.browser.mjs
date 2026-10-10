import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const brown='rgb(89, 29, 32)';
export async function runCheckoutThemeChecks({browser,engine,scenario,until,base,output,products,settleFixtureNetwork}) {
 const resting=page=>page.evaluate(()=>document.documentElement.hasAttribute('data-hidi-button-theme')?'rgb(251, 246, 242)':'rgb(89, 29, 32)');
 const phone={viewport:{width:390,height:844},isMobile:engine!=='firefox',hasTouch:true};
 const navigate=async(page,path)=>{
  await settleFixtureNetwork(page,{prefetchOnly:true});
  const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
  assert(response?.ok(),'Successful fixture route '+path);
 };
 const cartFor=price=>({items:[{id:'quote-fixture',quantity:1,lineTotalPaise:price,product:{id:products[0].id,slug:products[0].slug,name:products[0].name,image:products[0].images[0].url},variant:{id:'quote-m',size:'M',color:'Ivory',available:4}}],itemCount:1,subtotalPaise:price,shippingPaise:price<149900?9900:0,totalPaise:price+(price<149900?9900:0)});
 const loadCheckout=async(page,price=100000)=>{
  await page.route('**/api/store/carts/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cartFor(price))}));
  await navigate(page,'/checkout');await page.getByRole('textbox',{name:'Mobile number',exact:true}).waitFor();
 };
 const color=el=>el.evaluate(e=>getComputedStyle(e).backgroundColor);
 await scenario(browser,engine,'FIX-01','Guest sign-in card matches hierarchy and all responsive totals include shipping',async page=>{
  await loadCheckout(page);
  const card=page.locator('.checkout-signin-card');await card.waitFor();
  assert(await page.locator('.checkout-mobile-summary').evaluate(e=>e.open),'Charged shipping must be visible without an extra tap');
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:844});const sign=card.getByRole('link',{name:'Sign In',exact:true}),guest=card.getByRole('button',{name:'Continue as Guest',exact:true});
   assert.equal(await color(sign),await resting(page));assert.equal(await sign.getAttribute('href'),'/account?returnTo=%2Fcheckout');
   const [s,g]=await Promise.all([sign.boundingBox(),guest.boundingBox()]);assert(g.y>=s.y+s.height,'Guest option must be on its own line below Sign In');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Checkout overflow '+width);
   const summary=width<=720?page.locator('.checkout-mobile-summary'):page.locator('.checkout-summary');if(width<=720)await page.locator('.checkout-mobile-summary').evaluate(e=>e.open=true);
   assert.match(await summary.innerText(),/Shipping[\s\S]*₹99/);assert.match(await summary.innerText(),/1,099/);
   assert.equal(await color(page.locator('.checkout-pay-button')),await resting(page));
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,`${engine}-checkout-fixed.png`),fullPage:true});
  await card.getByRole('button',{name:'Continue as Guest',exact:true}).click();await page.getByText('Continuing as guest.',{exact:false}).waitFor();assert.equal(await card.count(),0);
 },phone);
 await scenario(browser,engine,'FIX-02','Phone typing and pasted content allow digits with one leading plus only',async page=>{
  await loadCheckout(page);const input=page.getByRole('textbox',{name:'Mobile number',exact:true});
  for(const [raw,value,valid] of [['+91 (987) 654-3210','+919876543210',true],['9876abc543210','9876543210',true],['98+76543210','9876543210',true],['++91+9876543210','+919876543210',true],['1234567','1234567',false],['+','+',false]]){
   await input.fill(raw);assert.equal(await input.inputValue(),value);assert.equal(await input.evaluate(e=>e.checkValidity()),valid);
  }
  await input.fill('');await input.pressSequentially('abc+919876543210');assert.match(await input.inputValue(),/^\+?[0-9]*$/);
 },phone);
 await scenario(browser,engine,'FIX-03','Filter footer stays visible and never overlaps options on small phones and landscape',async page=>{
  await page.getByRole('button',{name:'Filter & Sort',exact:true}).waitFor();
  for(const viewport of [{width:320,height:568},{width:390,height:360},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.getByRole('button',{name:'Filter & Sort',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Product filters'});await dialog.waitFor();
   const show=dialog.getByRole('button',{name:/Show \d+ styles/});assert.equal(await color(show),await resting(page));
   const geometry=()=>dialog.evaluate(d=>{const scroll=d.querySelector('[class*="filterScroll"]'),footer=d.querySelector('[class*="drawerApply"]'),b=footer.querySelector('button'),r=b.getBoundingClientRect(),s=scroll.getBoundingClientRect(),f=footer.getBoundingClientRect();return {scrollBottom:s.bottom,footerTop:f.top,bottom:r.bottom,height:innerHeight,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
   let g=await geometry();assert(g.scrollBottom<=g.footerTop+1);assert(g.bottom<=g.height&&g.hit);
   await dialog.locator('[class*="filterScroll"]').evaluate(e=>e.scrollTop=e.scrollHeight);g=await geometry();assert(g.scrollBottom<=g.footerTop+1&&g.hit);
   await show.click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  }
 },{...phone,startPath:'/collections/all'});
 await scenario(browser,engine,'FIX-04','Every product has the screenshot Shipping & Returns rows and a working policy link',async page=>{
  for(const product of products.slice(0,3)){
   await settleFixtureNetwork(page,{prefetchOnly:true});
   if(new URL(page.url()).pathname!=='/products/'+product.slug)await navigate(page,'/products/'+product.slug);const section=page.locator('details').filter({has:page.getByText('Shipping & Returns',{exact:true})});await section.waitFor();
   await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor();assert(await section.evaluate(e=>e.open));assert.match(await section.innerText(),/Free Shipping[\s\S]*₹1,499 and above[\s\S]*Easy Returns[\s\S]*7 days[\s\S]*Exchanges/);
   await settleFixtureNetwork(page,{prefetchOnly:true});
   const link=section.getByRole('link',{name:/View Shipping, Returns & Exchange Policy/});await link.click();await page.waitForURL('**/returns#shipping-returns-exchange');assert.match(await page.locator('#shipping-returns-exchange').innerText(),/₹99/);
  }
 },{...phone,startPath:'/products/'+products[0].slug});
 await scenario(browser,engine,'FIX-07','Mobile Quick add maintains the current default palette through selection and success',async page=>{
  await page.getByRole('button',{name:'Quick add — '+products[0].name,exact:true}).click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:products[0].name,exact:true})});await dialog.waitFor();const add=dialog.getByRole('button',{name:'Add to bag',exact:true});assert.equal(await color(add),await resting(page));await dialog.getByRole('button',{name:'M',exact:true}).click();assert.equal(await color(add),await resting(page));await add.click();await dialog.getByRole('button',{name:'Added to bag',exact:true}).waitFor();assert.equal(await color(dialog.getByRole('button',{name:'Added to bag',exact:true})),await resting(page));await page.screenshot({path:resolve(output,`${engine}-quick-add-fixed.png`)});
 },{...phone,startPath:'/collections/all'});
 await scenario(browser,engine,'FIX-05','Boundary shipping summaries and bag quantity recalculation agree on both screens',async page=>{
  for(const [price,shipping] of [[149899,9900],[149900,0],[149901,0]]){
   await page.route('**/api/store/carts/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cartFor(price))}));
   await navigate(page,'/cart');await page.locator('.summary-total').waitFor();assert.match(await page.locator('.order-summary').innerText(),shipping?/Shipping\s*₹99/:/Shipping\s*Complimentary/);
   await navigate(page,'/checkout');await page.getByRole('textbox',{name:'Mobile number',exact:true}).waitFor();assert.equal(await page.locator('.checkout-mobile-summary').evaluate(e=>e.open),Boolean(shipping));assert.match(await page.locator('.checkout-summary').innerText(),shipping?/Shipping\s*₹99/:/Shipping\s*Complimentary/);
   await settleFixtureNetwork(page);
   await page.unroute('**/api/store/carts/**');
  }
 },phone);
 await scenario(browser,engine,'FIX-06','Gateway receives the shipping-inclusive server amount and HIDI button theme',async page=>{
  await page.route('**/checkout.razorpay.com/**',route=>route.fulfill({contentType:'text/javascript',body:'window.Razorpay=class{constructor(o){window.__payment=o;}open(){}close(){}on(){}}'}));
  await loadCheckout(page);await page.evaluate(()=>{window.Razorpay=class{constructor(o){window.__payment=o;}open(){}close(){}on(){}};});
  let calls=0;await page.route('**/api/store/checkout/prepare',route=>{calls++;const request=route.request().postDataJSON();assert.equal(request.expectedTotalPaise,100000);assert.equal(request.expectedPayableTotalPaise,109900);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({orderNumber:'FIXTURE-ORDER',amountPaise:109900,totalPaise:109900,subtotalPaise:100000,shippingPaise:9900,currency:'INR',providerOrderId:'fixture-rzp',razorpayKeyId:'fixture-key'})});});
  for(const [name,value] of [['Email address','fixture@example.invalid'],['Mobile number','+919876543210'],['First name','Fixture'],['House, building and street address','1 Test Street'],['PIN code','500001'],['City','Hyderabad'],['State','Telangana']])await page.locator('.checkout-form').getByRole('textbox',{name,exact:true}).fill(value);
  await page.getByRole('button',{name:/Pay securely/}).click();await until(()=>page.evaluate(()=>Boolean(window.__payment)),'Mock gateway opened');const payment=await page.evaluate(()=>({amount:window.__payment.amount,theme:window.__payment.theme}));assert.equal(payment.amount,109900);assert.equal(payment.theme.color,'#591d20');assert.equal(calls,1);
 },phone);
}
