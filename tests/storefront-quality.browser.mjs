/** Field/selection regressions on fresh direct-entry routes and actual customer navigation. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
export async function runQualityChecks({browser,engine,scenario,until,base,output,products,writes,setCartMode}) {
 const productPath=index=>'/products/'+products[index].slug;
 const productCases=new Set(['QUAL-03','QUAL-04','QUAL-05','QUAL-07','QUAL-12','QUAL-15']);
 const run=(id,title,work,options={})=>{
  const startPath=id==='QUAL-02'?productPath(1):productCases.has(id)||id.startsWith('QUAL-06-')?productPath(0):id==='QUAL-08'||id==='QUAL-09'?'/collections/all':id==='QUAL-14'?'/lookbook':id==='QUAL-16'?'/search?q=ira&q=ignored':id==='QUAL-17'?'/about':'/';
  return scenario(browser,engine,id,title,work,{...options,startPath});
 };
 const pdp=async(page,index=0)=>{assert.equal(new URL(page.url()).pathname,productPath(index));await page.locator('[data-pdp-summary]').waitFor();await until(()=>page.locator('.pdp-related button[aria-pressed]').first().isEnabled(),'product-page hydration');};
 const actions=page=>page.locator('[aria-label="Purchase actions"]');
 const size=(page,name)=>page.locator('.sizes').getByRole('button',{name,exact:true});
 const summary=page=>page.locator('[data-pdp-summary]');
 const phone={viewport:{width:390,height:844},hasTouch:true};
 const shots=async(page,name)=>page.screenshot({path:resolve(output,`${engine}-quality-${name}.png`),fullPage:true});
 await run('QUAL-01','Mobile hero separates header, garment and copy at 320, 390 and 768px',async page=>{
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));
   const boxes=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return{top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return{header:box('.site-header'),hero:box('[data-section="hero"]'),image:box('[data-hidi-campaign]'),title:box('[data-section="hero"] h1'),overflow:document.documentElement.scrollWidth>innerWidth};});
   assert(!boxes.overflow);assert(boxes.hero.top>=boxes.header.bottom-1,'Campaign begins below mobile header');
   if(width<=760){assert(boxes.title.top>=boxes.image.bottom,'Copy never covers garment');assert(boxes.hero.height>=560&&boxes.hero.height<=640);}
  }await page.setViewportSize({width:390,height:844});await shots(page,'home');
 },phone);
 await run('QUAL-02','PDP price, MRP, selected size and deselection follow the exact variant',async page=>{
  await pdp(page,1);assert.match(await summary(page).innerText(),/From ₹1,499/);assert(await actions(page).getByRole('button',{name:'Add to Cart',exact:true}).isDisabled());
  for(const [name,price] of [['M','₹1,499'],['L','₹1,799']]){await size(page,name).click();await until(async()=>(await summary(page).innerText()).includes('Size '+name),'selected size reflected');assert((await summary(page).innerText()).includes(price));assert.match(await summary(page).innerText(),/MRP ₹1,999/);assert.equal(await size(page,name).getAttribute('aria-pressed'),'true');}
  await size(page,'L').click();assert(await actions(page).getByRole('button',{name:'Buy Now',exact:true}).isDisabled());assert.match(await summary(page).innerText(),/Select a size/);await shots(page,'product');
 });
 await run('QUAL-03','Colour changes reset size and update price, specifications and colour-specific photography',async page=>{
  await pdp(page);await size(page,'M').click();await page.locator('.colour-options').getByRole('button',{name:'Wine',exact:true}).click();
  await until(async()=>(await summary(page).innerText()).includes('Wine'),'colour summary');assert.match(await summary(page).innerText(),/Select a size/);assert.equal(await size(page,'M').count(),0);assert(await actions(page).getByRole('button',{name:'Buy Now',exact:true}).isDisabled());
  assert.equal(await page.locator('.pdp-gallery button').count(),1);assert.match(await page.locator('.pdp-gallery img').first().getAttribute('src'),/02-alt/);
  await size(page,'XL').click();assert.match(await summary(page).innerText(),/FIXTURE-0-XL/);await page.getByText('Specifications',{exact:true}).click();assert.match(await page.locator('details').filter({has:page.getByText('Specifications',{exact:true})}).innerText(),/Wine/);
 });
 await run('QUAL-04','Size guide units, missing measurements, related-product navigation and sold-out controls',async page=>{
  await pdp(page);assert(await size(page,'L — unavailable').isDisabled());await page.getByRole('button',{name:'Size & fit guide',exact:true}).click();const guide=page.getByRole('region',{name:'HIDI size and fit guide'});
  assert.match(await guide.innerText(),/110/);assert.match(await guide.innerText(),/112/);await guide.getByRole('button',{name:'in',exact:true}).click();assert.match(await guide.innerText(),/43\.3/);assert.match(await guide.innerText(),/44\.1/);await guide.getByRole('button',{name:'cm',exact:true}).click();assert.match(await guide.innerText(),/finished-garment/);
  await page.locator('.colour-options').getByRole('button',{name:'Wine',exact:true}).click();assert.match(await guide.innerText(),/not published/);assert.equal(await guide.getByRole('table').count(),0);
  await page.locator(`.pdp-related a[href="${productPath(4)}"]`).first().click();await page.waitForURL(url=>url.pathname===productPath(4));await pdp(page,4);
  assert(await actions(page).getByRole('button',{name:'Add to Cart',exact:true}).isDisabled());assert(await size(page,'M — unavailable').isDisabled());
 });
 await run('QUAL-05','PDP duplicate-click guard posts one exact SKU and quantity, no client price',async page=>{
  await pdp(page);await size(page,'M').click();const before=writes.length;await actions(page).getByRole('button',{name:'Add to Cart',exact:true}).evaluate(button=>{button.click();button.click();});
  await page.locator('.pdp-add-message').filter({hasText:'added to your bag'}).waitFor();const requests=writes.slice(before);assert.equal(requests.length,1);assert.deepEqual(requests[0].body,{variantId:'v-0-m',quantity:1});
 });
 for(const mode of ['conflict','server','rate','malformed'])await run('QUAL-06-'+mode,'PDP '+mode+' response never fabricates success or automatically retries',async page=>{
  await pdp(page);await size(page,'M').click();setCartMode(mode);const before=writes.length;await actions(page).getByRole('button',{name:'Add to Cart',exact:true}).click();
  const alert=page.getByRole('alert').filter({has:page.getByRole('link',{name:'Review your bag',exact:true})});await alert.waitFor();assert.equal(writes.length-before,1);assert.doesNotMatch(await page.locator('.pdp-add-message').innerText(),/added to/);
  if(mode==='conflict'){assert(await size(page,'M — unavailable').isDisabled());assert(await actions(page).getByRole('button',{name:'Buy Now',exact:true}).isDisabled());}else if(mode==='rate')assert.match(await alert.innerText(),/wait a moment/);else assert.match(await alert.innerText(),/couldn’t confirm/);
 });
 await run('QUAL-07','Image inspection supports zoom bounds, arrows, Escape and focus restoration',async page=>{
  await pdp(page);const opener=page.locator('.pdp-gallery button').first();await opener.click();const dialog=page.getByRole('dialog',{name:/detailed image viewer/});await dialog.waitFor();assert(await dialog.getByRole('button',{name:'Zoom out',exact:true}).isDisabled());
  for(let i=0;i<4;i++)await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();assert(await dialog.getByRole('button',{name:'Zoom in',exact:true}).isDisabled());
  await dialog.getByRole('button',{name:'Next product image',exact:true}).click();assert(await dialog.getByRole('button',{name:'Zoom out',exact:true}).isDisabled());await page.keyboard.press('ArrowLeft');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await until(()=>opener.evaluate(el=>document.activeElement===el),'gallery focus restored');
 },phone);
 await run('QUAL-08','Mobile filters correlate size and colour, expose removable selections, clear and restore focus',async page=>{
  const trigger=page.getByRole('button',{name:/^Filter & Sort/});await trigger.click();const dialog=page.getByRole('dialog',{name:'Product filters'});
  await dialog.getByRole('checkbox',{name:'M',exact:true}).check();await dialog.getByRole('checkbox',{name:/^Wine/}).check();await dialog.getByRole('button',{name:'Show 0 styles',exact:true}).click();await page.getByRole('heading',{name:'No styles match those filters.'}).waitFor();
  await page.getByRole('button',{name:'Remove size M filter'}).click();await trigger.click();await dialog.getByRole('checkbox',{name:'XL',exact:true}).check();await dialog.getByRole('button',{name:'Show 1 styles',exact:true}).click();assert.equal(await page.locator('[aria-label="Applied filters"] button').count(),3);await until(()=>trigger.evaluate(el=>el===document.activeElement),'filter focus restored');
  await page.getByRole('button',{name:'Clear all filters',exact:true}).click();await trigger.click();assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(),0);await page.keyboard.press('Escape');await until(()=>trigger.evaluate(el=>el===document.activeElement),'filter focus restored');
  for(const name of ['Show one product per row','Show two products per row']){await page.getByRole('button',{name,exact:true}).click();assert.equal(await page.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true');}await shots(page,'collection');
 },phone);
 await run('QUAL-09','Every price option, fabric selection, sort radio and desktop sort dropdown works',async page=>{
  await page.getByRole('button',{name:'Filter',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Product filters'});
  await dialog.locator('summary').filter({hasText:'Fabric'}).click();await dialog.getByRole('checkbox',{name:'Fixture fabric information',exact:true}).check();assert(await dialog.getByRole('checkbox',{name:'Fixture fabric information',exact:true}).isChecked());await dialog.getByRole('checkbox',{name:'Fixture fabric information',exact:true}).uncheck();
  await dialog.locator('summary').filter({hasText:'Price',hasNotText:'Sort'}).click();for(const label of ['Under ₹1,500','₹1,500–₹2,000','Above ₹2,000','All prices']){await dialog.getByRole('radio',{name:label,exact:true}).check();assert(await dialog.getByRole('radio',{name:label,exact:true}).isChecked());}
  for(const label of ['Price: Low to high','Price: High to low','Name: A–Z','Featured']){await dialog.getByRole('radio',{name:label,exact:true}).check();assert(await dialog.getByRole('radio',{name:label,exact:true}).isChecked());}
  await page.keyboard.press('Escape');for(const value of ['price-low','price-high','name','featured']){await page.getByRole('combobox',{name:'Sort products'}).selectOption(value);assert.equal(await page.getByRole('combobox',{name:'Sort products'}).inputValue(),value);}
 });
 await run('QUAL-10','Reversed-word overlay search and full search preserve the current document',async page=>{
  await page.getByRole('button',{name:'Search',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Search HIDI',exact:true});const input=dialog.getByRole('searchbox',{name:'Search HIDI products'});await input.fill('wine ira');await until(()=>dialog.locator('#hidi-search-results a').count().then(n=>n===1),'reversed-word search');
  await dialog.getByRole('link',{name:'View all search results',exact:true}).click();await page.waitForURL('**/search?*');assert.match(await page.locator('.filter-bar').innerText(),/1 result/);
  await page.getByRole('searchbox',{name:'Search HIDI products'}).fill('no such fixture');await page.evaluate(()=>{window.__qualitySearchDocument='same-document';});
  await page.locator('.search-form').getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('heading',{name:'No styles found.'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__qualitySearchDocument),'same-document','Search must navigate without a full page reload');
 });
 await run('QUAL-11','Malformed search responses show a recoverable error, never an empty catalogue',async page=>{
  let bad=true;await page.route('**/api/store/products',route=>bad?route.fulfill({status:200,contentType:'application/json',body:'{"unexpected":true}'}):route.continue());await page.getByRole('button',{name:'Search',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Search HIDI',exact:true});await dialog.getByRole('alert').waitFor();bad=false;await dialog.getByRole('button',{name:'Try again'}).click();await dialog.locator('[aria-label="Discover HIDI products"]').waitFor();
 });
 await run('QUAL-12','Delivery PIN sanitizes input, rejects invalid PIN locally and distinguishes service states',async page=>{
  await pdp(page);const input=page.getByRole('textbox',{name:'Delivery PIN code'}),check=page.getByRole('button',{name:'Check delivery PIN code'});let calls=0,mode='yes';
  await page.route('**/api/store/checkout/delivery-serviceability?*',route=>{calls++;return route.fulfill({status:mode==='error'?503:200,contentType:'application/json',body:JSON.stringify(mode==='error'?{message:'Unavailable'}:{serviceable:mode==='yes'})});});
  await input.fill('000000');await check.click();assert.equal(calls,0);assert.match(await page.locator('.delivery-box').innerText(),/valid six-digit/);
  for(const [state,text] of [['yes','Delivery is available'],['no','Delivery is currently unavailable'],['error','cannot be checked right now']]){mode=state;await input.fill('500001');await check.click();await until(async()=>(await page.locator('.delivery-box').innerText()).includes(text),state+' PIN response');}assert.equal(calls,3);
 });
 await run('QUAL-13','Policy, contact and planned-offer links navigate with explicit unapproved-content boundaries',async page=>{
  const routes=[['/about','For every role you carry.'],['/contact','How can we help?'],['/shipping','Shipping & delivery'],['/returns','Returns & exchanges'],['/offers','A little more, with clear terms.']];
  for(const [path,title] of routes){
   const response=await page.request.get(base+path);assert.equal(response.status(),200,path);await page.locator(`a[href="${path}"]`).first().click();await page.waitForURL(url=>url.pathname===path);await page.getByRole('heading',{name:title,exact:true}).waitFor();
   assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('h1').count(),1);assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),path+' overflow');
   const content=await page.locator('#main-content').innerText();
   if(path==='/shipping')assert.match(content,/₹1,499 and above/);
   if(path==='/returns'){assert.match(content,/7 days/);assert.doesNotMatch(content,/easy exchanges/i);}
   if(path==='/offers'){assert.match(content,/not combined/);assert.equal(await page.locator('#rupee').count(),1);assert.equal(await page.locator('#silver').count(),1);}
   if(path==='/contact'){assert.equal(await page.locator('a[href^="mailto:"]').count(),0);assert.match(content,/not open in this preview/);await shots(page,'contact');}
  }
 },phone);
 await run('QUAL-14','Direct-entry editorial archive uses alternate photographs and real product links',async page=>{
  const images=await page.locator('[aria-label="Editorial lookbook"] img').evaluateAll(items=>items.map(i=>i.getAttribute('src')));assert.equal(images.length,6);assert(images.every(src=>src.includes('02-alt.png')||src.includes('02-alt')));
  assert.equal(await page.locator('[aria-label="Editorial lookbook"] a[href^="/products/"]').count(),6);
 });
 await run('QUAL-15','Buy Now retains the bag and guest checkout field constraints without submitting payment',async page=>{
  await pdp(page);await size(page,'M').click();const before=writes.length;await actions(page).getByRole('button',{name:'Buy Now',exact:true}).click();await page.waitForURL('**/checkout');await page.locator('.checkout-form').getByRole('textbox',{name:'Email address',exact:true}).waitFor();
  const email=page.locator('.checkout-form').getByRole('textbox',{name:'Email address',exact:true});await email.fill('invalid');assert.equal(await email.evaluate(el=>el.checkValidity()),false);await email.fill('quality-fixture@example.invalid');assert.equal(await email.evaluate(el=>el.checkValidity()),true);
  for(const [name,value] of [['First name','Quality'],['Last name','Fixture'],['Mobile number','9876543210'],['House, building and street address','1 Fixture Street'],['City','Fixture City'],['State','Telangana']]){const input=page.getByRole('textbox',{name,exact:true});await input.fill(value);assert.equal(await input.inputValue(),value);}
  const pin=page.getByRole('textbox',{name:'PIN code',exact:true});await pin.fill('000000');assert.equal(await pin.evaluate(el=>el.checkValidity()),false);assert(await page.getByRole('textbox',{name:'Country',exact:true}).isDisabled());
  assert.equal(writes.slice(before).filter(w=>!w.route.startsWith('/carts/')).length,0,'No order/payment/customer writes');await shots(page,'checkout');
 });
 await run('QUAL-16','Repeated search parameters, resubmission and browser Back preserve query and document',async page=>{
  assert.match(await page.locator('.filter-bar').innerText(),/1 result/);const input=page.getByRole('searchbox',{name:'Search HIDI products'});assert.equal(await input.inputValue(),'ira');
  await page.evaluate(()=>{window.__qualitySearchDocument='direct-entry';});await input.fill('no such fixture');await page.locator('.search-form').getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('heading',{name:'No styles found.'}).waitFor();assert.equal(await page.evaluate(()=>window.__qualitySearchDocument),'direct-entry');
  await page.goBack({waitUntil:'domcontentloaded'});await until(async()=>(await page.locator('.filter-bar').innerText()).includes('1 result'),'search Back results');assert.equal(await input.inputValue(),'ira');assert.equal(await page.evaluate(()=>window.__qualitySearchDocument),'direct-entry');
 });
 await run('QUAL-17','Direct-entry About page retains campaign image without a heavy autoplay film',async page=>{
  await page.getByRole('heading',{name:'For every role you carry.',exact:true}).waitFor();assert.equal(await page.locator('#main-content video[autoplay]').count(),0);assert.equal(await page.locator('#main-content img[src*="hidi-manifesto-ananya"]').count(),1);await shots(page,'about');
 });
}
