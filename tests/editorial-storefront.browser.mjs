/** Production Next build with isolated commerce fixtures. No real orders, OTP or payments. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runQualityChecks } from './storefront-quality.browser.mjs';
import { runCheckoutThemeChecks } from './checkout-theme.browser.mjs';
const pw = await import(process.env.HIDI_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href : 'playwright');
const output = resolve('test-results/editorial-storefront'); await mkdir(output, {recursive:true});
const port=3107, apiPort=4107, base=`http://127.0.0.1:${port}`;
const requestedCases=new Set((process.env.HIDI_BROWSER_CASES||'').split(',').filter(Boolean));
const folders=['ira-beige-office-kurta-set','myra-peach-comfort-kurta-set','kiara-wine-festive-kurta-set','nivya-olive-work-kurta','rhea-mint-daily-kurta','anika-ivory-embroidered-set'];
const products=folders.map((slug,i)=>({
  id:`fixture-${i}`,slug,name:i===0?'Ira everyday kurta':i===5?'Anika embroidered occasion set with a deliberately long product name':`HIDI editorial piece ${i+1}`,
  description:'Isolated browser-test catalogue. Not a customer order.\nIncludes: Kurta and trousers\nFit: Relaxed\nLining: Unlined',shortDescription:'Considered Indian wear.',fabric:'Fixture fabric information',care:'Read the garment care label.',
  collections:[{id:'new',slug:'new-arrivals',name:'New arrivals'}],category:{id:'kurta',name:'Kurta',slug:'kurta'},
  minPricePaise:149900,maxPricePaise:i===1?179900:149900,inStock:i!==4,
  images:['01-main.png','03-detail.png'].map((name,n)=>({id:`img-${i}-${n}`,url:`/products/${slug}/${name}`,alt:n?'Garment detail':'HIDI editorial portrait',position:n})),
  // A price range must contain two PURCHASABLE prices, not an unavailable variant.
  variants:[{id:`v-${i}-m`,sku:`FIXTURE-${i}-M`,color:'Ivory',size:'M',pricePaise:149900,mrpPaise:199900,available:i===4?0:4,bustMm:1100,garmentLengthMm:1120},{id:`v-${i}-l`,sku:`FIXTURE-${i}-L`,color:'Ivory',size:'L',pricePaise:i===1?179900:149900,mrpPaise:199900,available:i===1?4:0},...(i===0?[{id:'v-0-xl',sku:'FIXTURE-0-XL',color:'Wine',size:'XL',pricePaise:149900,mrpPaise:199900,available:3,images:[{id:'wine-fixture',url:`/products/${slug}/02-alt.png`,alt:'Isolated alternate-colour image',position:0}]}]:[])],
}));
const carts=new Map(),writes=[],results=[],typography=[],pageErrors=[];
let cartMode='ok',catalogueMode='ok',serverLog='',server,activeBrowser;
const delay=ms=>new Promise(done=>setTimeout(done,ms));
function basket(session){if(!carts.has(session))carts.set(session,[]);const items=carts.get(session),subtotalPaise=items.reduce((n,i)=>n+i.lineTotalPaise,0),shippingPaise=subtotalPaise>0&&subtotalPaise<149900?9900:0;return{items,itemCount:items.reduce((n,i)=>n+i.quantity,0),subtotalPaise,shippingPaise,totalPaise:subtotalPaise+shippingPaise};}
const upstream=createServer(async(req,res)=>{
  const url=new URL(req.url,`http://127.0.0.1:${apiPort}`),route=url.pathname.replace(/^\/v1/,'');
  const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  try{
    let text='';for await(const part of req)text+=part;const body=text?JSON.parse(text):{};
    if(req.method!=='GET')writes.push({method:req.method,route,body});
    if(req.method==='GET'&&/^\/products(?:\/(?:featured|best-sellers))?$/.test(route))return send(catalogueMode==='error'?503:200,catalogueMode==='empty'?[]:products);
    if(req.method==='GET'&&/^\/products\/[^/]+\/related$/.test(route))return send(200,products.slice(1,5));
    if(req.method==='GET'&&/^\/products\/[^/]+$/.test(route)){const p=products.find(p=>p.slug===decodeURIComponent(route.split('/')[2]));return send(p?200:404,p||{message:'Not found'});}
    if(route.startsWith('/reviews/products/'))return send(200,{averageRating:0,reviewCount:0,verifiedReviewCount:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0},reviews:[]});
    const cart=route.match(/^\/carts\/([^/]+)(?:\/items(?:\/([^/]+))?)?$/);
    if(cart){const session=cart[1];if(req.method==='GET')return send(200,basket(session));
      if(req.method==='POST'){
        await delay(150);
        if(cartMode==='conflict')return send(409,{message:'This size is no longer available.'});
        if(cartMode==='server')return send(500,{message:'Fixture uncertain write'});
        if(cartMode==='rate')return send(429,{message:'Too many requests'});
        if(cartMode==='malformed')return send(200,{accepted:true});
        assert.deepEqual(Object.keys(body).sort(),['quantity','variantId']);assert.equal(body.quantity,1);
        const product=products.find(p=>p.variants.some(v=>v.id===body.variantId)),variant=product?.variants.find(v=>v.id===body.variantId);
        if(!variant||variant.available<1)return send(409,{message:'Unavailable'});
        const current=basket(session),existing=current.items.find(item=>item.variant.id===variant.id);
        if(existing){existing.quantity++;existing.lineTotalPaise=existing.quantity*variant.pricePaise;}
        else current.items.push({id:`item-${variant.id}`,quantity:1,lineTotalPaise:variant.pricePaise,product:{id:product.id,slug:product.slug,name:product.name,image:product.images[0].url},variant:{...variant}});
        return send(200,basket(session));
      }
      const current=basket(session),item=current.items.find(i=>i.id===cart[2]);if(!item)return send(404,{message:'Not found'});
      if(req.method==='DELETE')carts.set(session,current.items.filter(i=>i.id!==item.id));
      if(req.method==='PATCH'){
        if(body.variantId){
          await delay(150);
          if(cartMode==='conflict')return send(409,{message:'Selected size is no longer available.'});
          if(cartMode==='server')return send(500,{message:'Fixture uncertain update'});
          if(cartMode==='rate')return send(429,{message:'Too many requests'});
          if(cartMode==='malformed')return send(200,{accepted:true});
          const product=products.find(p=>p.id===item.product.id),variant=product?.variants.find(v=>v.id===body.variantId&&v.color===item.variant.color);
          if(!variant||variant.available<body.quantity)return send(409,{message:'Selected size is unavailable.'});
          const existing=current.items.find(i=>i.id!==item.id&&i.variant.id===variant.id);
          if(existing){existing.quantity+=body.quantity;existing.lineTotalPaise=existing.quantity*variant.pricePaise;carts.set(session,current.items.filter(i=>i.id!==item.id));}
          else {item.variant={...variant};item.quantity=body.quantity;item.lineTotalPaise=body.quantity*variant.pricePaise;}
        }else {item.quantity=body.quantity;item.lineTotalPaise=body.quantity*item.variant.pricePaise;}
      }
      return send(200,basket(session));
    }
    if(route==='/marketing/newsletter'&&req.method==='POST')return send(200,{message:'You are on the HIDI list. Thank you for joining.'});
    if(route.startsWith('/shipping'))return send(200,{serviceable:true,codAvailable:false});
    return send(401,{message:'Authentication required'});
  }catch(error){send(500,{message:String(error)});}
});
await new Promise((done,reject)=>{upstream.once('error',reject);upstream.listen(apiPort,'127.0.0.1',done);});
server=spawn(process.execPath,[resolve('apps/web/node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:resolve('apps/web'),env:{...process.env,NODE_ENV:'production',API_URL:`http://127.0.0.1:${apiPort}/v1`,INTERNAL_API_URL:`http://127.0.0.1:${apiPort}/v1`,HIDI_HERO_VIDEO_URL:'/fixture-unavailable-campaign.mp4'},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',b=>{serverLog+=b;});server.stderr.on('data',b=>{serverLog+=b;});
async function until(check,label,timeout=8000){const start=Date.now();while(!(await check())){if(Date.now()-start>timeout)throw new Error(`Timed out: ${label}`);await delay(50);}}
// A cached networkidle lifecycle does not cover product links newly exposed by
// scrolling to the wishlist button. Require current requests to finish and a
// fresh quiet interval before forcing a reload; all page errors remain fatal.
const fixtureNetworkStates = new WeakMap();
function trackFixtureNetwork(page) {
  let state = fixtureNetworkStates.get(page);
  if (state) return state;
  state = { pending: new Set(), lastActivity: Date.now() };
  fixtureNetworkStates.set(page, state);
  page.on('request', request => { state.pending.add(request); state.lastActivity = Date.now(); });
  const finished = request => { state.pending.delete(request); state.lastActivity = Date.now(); };
  page.on('requestfinished', finished);
  page.on('requestfailed', finished);
  return state;
}
async function settleFixtureNetwork(page) {
  const state = trackFixtureNetwork(page), started = Date.now();
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  while (state.pending.size || Date.now() - Math.max(started, state.lastActivity) < 500) {
    assert(Date.now() - started < 15000, 'Fixture network did not settle: ' + [...state.pending].map(request => request.url()).join(', '));
    await delay(50);
  }
}
async function settledReload(page) {
  await settleFixtureNetwork(page);
  return page.reload({ waitUntil: 'networkidle', timeout: 30000 });
}
function sampleDrawerGeometry(page) {
  // Both boxes must come from one browser task, rather than two protocol calls
  // that can straddle a header resize or its ResizeObserver positioning update.
  return page.evaluate(() => {
    const header=document.querySelector('.site-header'),panel=document.querySelector('#mobile-navigation');
    const box=element=>{if(!element)return null;const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};};
    return {header:box(header),panel:box(panel),menuTop:header?.style.getPropertyValue('--hidi-menu-top'),panelTop:panel?getComputedStyle(panel).top:null,announcementHeight:getComputedStyle(document.documentElement).getPropertyValue('--hidi-announcement-height'),scrollY,viewport:{width:innerWidth,height:innerHeight}};
  });
}
async function waitForDrawerAlignment(page) {
  const started=Date.now(),samples=[];
  let stableAnchor,stableSince;
  while(Date.now()-started<3000) {
    const geometry=await sampleDrawerGeometry(page),{header,panel}=geometry;
    const aligned=header&&panel&&header.width>0&&header.height>0&&panel.width>0&&panel.height>0&&Math.abs(panel.y-(header.y+header.height))<=2;
    const stable=stableAnchor&&header&&panel&&['header','panel'].every(name=>['x','y','width','height'].every(key=>Math.abs(geometry[name][key]-stableAnchor[name][key])<=0.25));
    samples.push({elapsedMilliseconds:Date.now()-started,...geometry});if(samples.length>8)samples.shift();
    if(!aligned) {stableAnchor=undefined;stableSince=undefined;}
    else if(!stable) {stableAnchor=geometry;stableSince=Date.now();}
    if(aligned&&stableSince!==undefined&&Date.now()-stableSince>=150)return geometry;
    await delay(25);
  }
  assert.fail('Drawer must meet header within 2px after stable layout: '+JSON.stringify(samples));
}
async function fontAudit(page,engine,label){
  await page.evaluate(()=>document.fonts.ready);
  const values=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>{const style=getComputedStyle(el),box=el.getBoundingClientRect();return !el.closest('[aria-hidden="true"],.sr-only,.cart-status,script,style')&&style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());}).map(el=>{const style=getComputedStyle(el);return{section:el.closest('[data-section]')?.getAttribute('data-section')||(el.closest('.site-header')?'header':el.closest('.footer')?'footer':el.closest('[role="dialog"],dialog')?'dialog':'global'),tag:el.tagName,text:el.textContent.trim().replace(/\s+/g,' ').slice(0,140),family:style.fontFamily,size:style.fontSize,weight:style.fontWeight,lineHeight:style.lineHeight,spacing:style.letterSpacing,color:style.color};}));
  typography.push(...values.map(v=>({engine,viewport:page.viewportSize().width,state:label,...v})));
  for(const value of values){assert.match(value.family,/Helvetica Neue|Segoe UI|Arial/,`${value.section}: ${value.text}`);assert(parseFloat(value.size)>=11,`Unreadable type: ${JSON.stringify(value)}`);}
  for(const input of await page.locator('input:not([type="checkbox"]):not([type="radio"]):visible,select:visible,textarea:visible').all())assert(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'Text fields must remain at least 16px');
}
async function scenario(browser,engine,id,title,work,options={}){
  if(requestedCases.size&&!requestedCases.has(id))return;
  const {startPath='/',...contextOptions}=options;
  assert(typeof startPath==='string'&&startPath.startsWith('/')&&!startPath.startsWith('//'),'Only isolated same-origin entry routes are allowed');
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',...contextOptions});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();trackFixtureNetwork(page);page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(engine==='webkit'){
    // WebKit can leave document.fonts.ready pending in Playwright's utility world.
    // Require loaded fonts in the page world before capturing the same screenshot.
    process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
    const screenshot=page.screenshot.bind(page);
    page.screenshot=async options=>{await until(()=>page.evaluate(()=>document.fonts.status==='loaded'),'loaded document fonts',10000);return screenshot(options);};
  }
  cartMode='ok';catalogueMode='ok';const start=Date.now();
  try{
    await page.goto(base+startPath,{waitUntil:'domcontentloaded'});await page.locator('#main-content').waitFor();
    if(startPath==='/'){
      await page.locator('[data-hidi-editorial="v2"]').waitFor();await until(()=>page.locator('[data-editorial-product]').first().locator('button[aria-pressed]').first().isEnabled(),'storefront hydration');
      await page.waitForLoadState('networkidle');
    }else{
      // CartLink creates this browser-session key from its client effect; no fixture state is injected.
      await until(()=>page.evaluate(()=>Boolean(localStorage.getItem('hidi_cart_session'))),'direct-entry client hydration');
    }
    await work(page,context);assert.deepEqual(errors,[],'Unexpected browser exceptions');results.push({engine,id,title,status:'PASS',durationMs:Date.now()-start});console.log(`PASS ${engine} ${id} ${title}`);
  }
  catch(error){results.push({engine,id,title,status:'FAIL',error:String(error.stack||error),durationMs:Date.now()-start});console.error(`FAIL ${engine} ${id}: ${error}`);await page.screenshot({path:resolve(output,`${engine}-${id}-failure.png`),timeout:10000}).catch(()=>{});await writeFile(resolve(output,`${engine}-${id}-failure.html`),await page.content().catch(()=>''));}
  finally{pageErrors.push(...errors.map(error=>({engine,id,error})));await context.close();}
}
const card=page=>page.locator('[data-editorial-product="ira-beige-office-kurta-set"]');
async function openAdd(page){await card(page).hover();await card(page).getByRole('button',{name:'Quick add',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Ira everyday kurta',exact:true});await dialog.waitFor();return dialog;}
try{
  await until(async()=>{try{return(await fetch(base+'/healthz',{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}},'production server readiness',60000);
  for(const engine of(process.env.HIDI_BROWSER_ENGINES||'chromium').split(',')){
    const browser=activeBrowser=await pw[engine].launch({headless:true});
    await scenario(browser,engine,'VIS-01','Responsive surfaces, type roles, image rendering and horizontal overflow',async page=>{
      for(const width of[320,360,390,412,768,1024,1440,1846]){
        await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await until(()=>page.locator('.site-header').getAttribute('data-scrolled').then(v=>v==='false'),'top header state');
        const state=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,neutral:[...document.querySelectorAll('[data-neutral-surface]')].map(el=>({bg:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage})),h1:document.querySelectorAll('main h1').length,fields:[...document.querySelectorAll('[data-editorial-product] select')].length}));
        assert(state.scroll<=state.width+1,`Horizontal overflow at ${width}`);assert.equal(state.h1,1);assert.equal(state.fields,0);assert.equal(state.neutral.length,6);
        for(const surface of state.neutral){assert.equal(surface.bg,'rgb(251, 246, 242)');assert.equal(surface.image,'none');}
        await fontAudit(page,engine,`homepage-${width}`);
        const name=await card(page).locator('h3').evaluate(el=>getComputedStyle(el).fontSize),price=await card(page).locator('h3 + p').evaluate(el=>getComputedStyle(el).fontSize).catch(()=>null);
        const actualPrice=await card(page).locator('p').first().evaluate(el=>getComputedStyle(el).fontSize);assert.equal(name,'14px');assert.equal(actualPrice,name,'Product name and price share the same type role');
        const first=page.locator('[data-section="hero"] img').first();await until(()=>first.evaluate(el=>el.complete&&el.naturalWidth>0),'hero image');
        if(width===390||width===1440)await page.screenshot({timeout:30000,path:resolve(output,`${engine}-home-${width}.png`),fullPage:true});
      }
    });
    await scenario(browser,engine,'HDR-01','Transparent header, scroll blur and home-logo return to top',async page=>{
      const header=page.locator('.site-header');assert.equal(await header.getAttribute('data-home'),'true');assert.equal(await header.evaluate(el=>getComputedStyle(el,'::before').backdropFilter),'none');
      await page.evaluate(()=>scrollTo(0,900));await until(()=>header.getAttribute('data-scrolled').then(v=>v==='true'),'scrolled header');assert.match(await header.evaluate(el=>getComputedStyle(el,'::before').backdropFilter),/blur\(12px\)/);
      await header.getByRole('link',{name:'HIDI — Wear the Feeling',exact:true}).click();await until(()=>page.evaluate(()=>scrollY<2),'logo scroll');
    });
    await scenario(browser,engine,'NAV-01','Mobile drawer anchor, single close action, Escape and focus return',async page=>{
      const button=page.getByRole('button',{name:'Open menu',exact:true});await button.click();const panel=page.getByRole('dialog',{name:'Mobile navigation'});await panel.waitFor();
      const geometry=await waitForDrawerAlignment(page),headerBox=geometry.header,panelBox=geometry.panel;assert(Math.abs(panelBox.y-(headerBox.y+headerBox.height))<=2,'Drawer must meet header: '+JSON.stringify(geometry));assert.equal(await page.getByRole('button',{name:'Close menu',exact:true}).count(),1);await fontAudit(page,engine,'mobile-navigation');
      await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});await until(()=>page.getByRole('button',{name:'Open menu',exact:true}).evaluate(el=>el===document.activeElement),'menu focus return');
    },{viewport:{width:390,height:844},hasTouch:true});
    await scenario(browser,engine,'MOT-01','Reduced motion avoids playback and keeps campaign poster visible',async page=>{
      assert.equal(await page.getByRole('button',{name:'Pause ambient motion'}).count(),0);assert.equal(await page.locator('video').getAttribute('src'),null);assert.equal(await page.locator('[data-motion]').getAttribute('data-motion'),'paused');
    });
    await scenario(browser,engine,'MOT-02','Ambient pause/resume, announcements pause, broken-video poster fallback',async page=>{
      await page.getByRole('button',{name:'Pause ambient motion'}).click();assert.equal(await page.locator('[data-motion]').getAttribute('data-motion'),'paused');await page.getByRole('button',{name:'Play ambient motion'}).click();await until(()=>page.locator('[data-motion]').getAttribute('data-motion').then(v=>v==='running'),'motion resume');
      await page.getByRole('button',{name:'Pause announcements',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Play announcements'}).getAttribute('aria-pressed'),'true');await until(()=>page.locator('video').count().then(n=>n===0),'unavailable video removed');assert.equal(await page.locator('[data-motion]').getAttribute('data-video-playing'),'false');
    },{reducedMotion:'no-preference'});
    await scenario(browser,engine,'SRCH-01','Search suggestions, thumbnails, typed results, no-match state and focus restoration',async page=>{
      await page.getByRole('button',{name:'Search',exact:true}).click();const search=page.getByRole('dialog',{name:'Search HIDI',exact:true});await search.waitFor();await until(()=>search.locator('[aria-label="Discover HIDI products"] a').count().then(n=>n===4),'discovery thumbnails');assert.equal(await search.getByRole('navigation',{name:'Suggested searches'}).getByRole('link').count(),4);assert.equal(await search.getByRole('link',{name:'Workwear Edit',exact:true}).getAttribute('href'),'/collections/work-edit');
      await search.getByRole('searchbox',{name:'Search HIDI products'}).fill('Ira');await until(()=>search.locator('#hidi-search-results a').count().then(n=>n===1),'matching result');await fontAudit(page,engine,'search-dialog');await page.screenshot({timeout:30000,path:resolve(output,`${engine}-search.png`)});
      await search.getByRole('searchbox',{name:'Search HIDI products'}).fill('zz-no-match-zz');await search.getByRole('status').filter({hasText:'No HIDI pieces matched'}).waitFor();await page.keyboard.press('Escape');await search.waitFor({state:'hidden'});await until(()=>page.getByRole('button',{name:'Search',exact:true}).evaluate(el=>el===document.activeElement),'search focus return');
    });
    await scenario(browser,engine,'SRCH-02','Search network failure is explicit and retry recovers',async page=>{
      let fail=true;await page.route('**/api/store/products',route=>fail?route.fulfill({status:503,contentType:'application/json',body:'{"message":"Unavailable"}'}):route.continue());await page.getByRole('button',{name:'Search',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Search HIDI',exact:true});await dialog.getByRole('alert').waitFor();fail=false;await dialog.getByRole('button',{name:'Try again'}).click();await dialog.locator('[aria-label="Discover HIDI products"]').waitFor();
    });
    await scenario(browser,engine,'CARD-01','Minimal home cards, same-variant MRP and sold-out safeguards',async page=>{
      assert.equal(await page.locator('[data-editorial-product]').count(),6);assert.equal(await card(page).locator('select:visible,fieldset:visible').count(),0);assert.match(await card(page).innerText(),/₹1,499/);assert.equal(await card(page).locator('del:visible').count(),1);assert.equal(await page.locator('[data-editorial-product="myra-peach-comfort-kurta-set"] del:visible').count(),0,'Range prices must not pair misleading MRP');
      const sold=page.locator('[data-editorial-product="rhea-mint-daily-kurta"]');assert.equal(await sold.getByRole('button',{name:'Quick add'}).count(),0);assert.match(await sold.innerText(),/Sold out/);assert.equal(await page.locator('[data-editorial-product="anika-ivory-embroidered-set"] h3').evaluate(el=>getComputedStyle(el).textOverflow),'ellipsis');
    });
    await scenario(browser,engine,'CART-01','Quick add requires size, handles colour changes and cycles keyboard focus',async page=>{
      const dialog=await openAdd(page),add=dialog.getByRole('button',{name:'Add to bag',exact:true});assert.equal(await add.isDisabled(),true);assert.equal(await dialog.getByRole('button',{name:'L — unavailable',exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:'M',exact:true}).click();assert.equal(await add.isEnabled(),true);await dialog.getByRole('button',{name:'Wine',exact:true}).click();assert.equal(await add.isDisabled(),true);assert.equal(await dialog.getByRole('button',{name:'XL',exact:true}).getAttribute('aria-pressed'),'false');
      await fontAudit(page,engine,'quick-add');await page.screenshot({timeout:30000,path:resolve(output,`${engine}-quick-add.png`)});for(const key of ['Tab','Shift+Tab'])for(let i=0;i<15;i++){await page.keyboard.press(key);assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Focus escaped modal');}await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await until(()=>card(page).getByRole('button',{name:'Quick add'}).evaluate(el=>el===document.activeElement),'quick-add focus return');
    });
    await scenario(browser,engine,'CART-02','Confirmed cart write occurs once; bag and checkout retain the same session',async page=>{
      const dialog=await openAdd(page);await dialog.getByRole('button',{name:'M',exact:true}).click();const before=writes.length;await dialog.getByRole('button',{name:'Add to bag',exact:true}).evaluate(button=>{button.click();button.click();button.click();});await dialog.getByRole('status').filter({hasText:'added to your bag'}).waitFor();assert.equal(writes.length-before,1);assert.deepEqual(writes.at(-1).body,{variantId:'v-0-m',quantity:1});
      await dialog.getByRole('link',{name:'View shopping bag'}).click();await page.waitForURL('**/cart');await page.getByRole('heading',{name:'Ira everyday kurta'}).waitFor();assert.match(await page.locator('.order-summary').innerText(),/₹1,499/);await fontAudit(page,engine,'populated-bag');await page.getByRole('link',{name:'Continue to checkout',exact:true}).click();await page.waitForURL('**/checkout');await page.getByRole('heading',{name:'Almost yours.'}).waitFor();await fontAudit(page,engine,'checkout');assert(!writes.some(r=>/orders|payments|auth|otp/.test(r.route)),'No real order/payment/auth writes');
    });
    for(const[mode,id,pattern]of[['conflict','CART-03',/no longer available/],['server','CART-04',/Check your bag before trying again/],['rate','CART-05',/Please wait a moment/],['malformed','CART-06',/Check your bag before trying again/]]){
      await scenario(browser,engine,id,`Quick-add ${mode} response never fabricates success or automatically retries`,async page=>{cartMode=mode;const dialog=await openAdd(page);await dialog.getByRole('button',{name:'M',exact:true}).click();const before=writes.length;await dialog.getByRole('button',{name:'Add to bag',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.match(await dialog.getByRole('alert').innerText(),pattern);await delay(350);assert.equal(writes.length-before,1);assert.doesNotMatch(await dialog.getByRole('status').innerText(),/added to your bag/);if(mode==='conflict')assert.equal(await dialog.getByRole('button',{name:'M — unavailable',exact:true}).isDisabled(),true);});
    }
    await scenario(browser,engine,'CART-07','Touch quick add and mobile bag quantity increase, decrease and removal',async page=>{
      await card(page).getByRole('button',{name:'Quick add',exact:true}).tap();const dialog=page.getByRole('dialog',{name:'Ira everyday kurta',exact:true});await dialog.getByRole('button',{name:'M',exact:true}).tap();await dialog.getByRole('button',{name:'Add to bag',exact:true}).tap();await dialog.getByRole('status').filter({hasText:'added to your bag'}).waitFor();await fontAudit(page,engine,'mobile-quick-add');await page.screenshot({timeout:30000,path:resolve(output,`${engine}-mobile-quick-add.png`)});
      await dialog.getByRole('link',{name:'View shopping bag'}).tap();await page.waitForURL('**/cart');await page.getByRole('button',{name:'Increase size M quantity'}).tap();await until(()=>page.locator('.cart-group-heading p').innerText().then(v=>v.includes('Qty 2')),'quantity increase');assert.match(await page.locator('.order-summary').innerText(),/₹2,998/);await page.getByRole('button',{name:'Decrease size M quantity'}).tap();await until(()=>page.locator('.cart-group-heading p').innerText().then(v=>v.includes('Qty 1')),'quantity decrease');await fontAudit(page,engine,'mobile-bag');await page.getByRole('button',{name:'Remove size M from bag'}).tap();await page.getByRole('heading',{name:'Your bag is waiting.'}).waitFor();
    },{viewport:{width:390,height:844},hasTouch:true});
    await scenario(browser,engine,'RESP-01','Catalogue header clears measured announcements while scrolling and plus remains accessible',async page=>{
      for(const width of [320,390,768,1440]){
        await page.setViewportSize({width,height:844});await page.evaluate(()=>scrollTo(0,600));await delay(150);
        const bounds=await page.evaluate(()=>{const header=document.querySelector('.site-header'),ticker=document.querySelector('[aria-label="HIDI shopping services"]'),h=header.getBoundingClientRect(),t=ticker.getBoundingClientRect();return{top:h.top,bottom:h.bottom,tickerBottom:t.bottom,width:innerWidth,scrollWidth:document.documentElement.scrollWidth};});
        assert(bounds.top>=bounds.tickerBottom-1,`Clipped header at ${width}: ${JSON.stringify(bounds)}`);assert(bounds.bottom<180);assert(bounds.scrollWidth<=width+1);
        const plus=page.getByRole('button',{name:/Quick add.*Ira everyday kurta/});assert.equal(await plus.locator('svg').count(),1);
        assert(await plus.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;}));
        await fontAudit(page,engine,`catalogue-scrolled-${width}`);
        if(width===390)await page.screenshot({timeout:30000,path:resolve(output,`${engine}-catalogue-header-mobile.png`)});
      }
      await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:/Quick add.*Ira everyday kurta/}).click();await page.getByRole('dialog').filter({hasText:'Ira everyday kurta'}).waitFor();await page.keyboard.press('Escape');
    },{startPath:'/collections/all'});
    for(const mode of ['ok','conflict','merge'])await scenario(browser,engine,`EDIT-${mode}`,'Cart size edit updates price, preserves failed edits and merges an existing size',async page=>{
      const productCard=page.locator('[data-editorial-product="myra-peach-comfort-kurta-set"]');
      await productCard.getByRole('button',{name:'Quick add',exact:true}).click();const dialog=page.getByRole('dialog',{name:'HIDI editorial piece 2',exact:true});
      await dialog.getByRole('button',{name:'M',exact:true}).click();await dialog.getByRole('button',{name:'Add to bag',exact:true}).click();await dialog.getByRole('status').filter({hasText:'added to your bag'}).waitFor();
      if(mode==='merge'){await dialog.getByRole('button',{name:'L',exact:true}).click();await dialog.getByRole('button',{name:'Add to bag',exact:true}).click();await dialog.getByRole('status').filter({hasText:'L · Ivory added'}).waitFor();}
      await dialog.getByRole('link',{name:'View shopping bag'}).click();await page.waitForURL('**/cart');
      const edit=page.getByRole('button',{name:'Edit size M for HIDI editorial piece 2'});await edit.click();const sizes=page.getByRole('group',{name:'Size for HIDI editorial piece 2'});await sizes.getByRole('button',{name:'L',exact:true}).click();
      assert.match(await page.locator('.cart-items').innerText(),/Item total ₹1,799/);cartMode=mode==='conflict'?'conflict':'ok';const before=writes.length;
      await page.getByRole('button',{name:'Save size'}).evaluate(el=>{el.click();el.click();el.click();});
      if(mode==='conflict'){await page.getByRole('alert').filter({hasText:'no longer available'}).waitFor();assert.match(await page.locator('.cart-variant-label').innerText(),/Size M/);await page.getByRole('button',{name:'Cancel',exact:true}).click();await until(()=>edit.evaluate(el=>el===document.activeElement),'cart edit focus return');}
      else {await page.getByRole('status').filter({hasText:'Size updated in your bag.'}).waitFor();await page.getByRole('button',{name:'Edit size L for HIDI editorial piece 2'}).waitFor();assert.equal(await page.locator('.cart-variant-row').count(),1);assert.match(await page.locator('.order-summary').innerText(),mode==='merge'?/₹3,598/:/₹1,799/);}
      assert.equal(writes.length-before,1);assert.deepEqual(writes.at(-1).body,{quantity:1,variantId:'v-1-l'});await fontAudit(page,engine,`cart-edit-${mode}`);if(mode==='ok')await page.screenshot({timeout:30000,path:resolve(output,`${engine}-cart-size-edit-mobile.png`),fullPage:true});
    },{viewport:{width:390,height:844},hasTouch:true});
    await scenario(browser,engine,'EDIT-unavailable','Unavailable cart sizes stay disabled and Cancel makes no write',async page=>{
      const dialog=await openAdd(page);await dialog.getByRole('button',{name:'M',exact:true}).click();await dialog.getByRole('button',{name:'Add to bag',exact:true}).click();await dialog.getByRole('status').filter({hasText:'added to your bag'}).waitFor();await dialog.getByRole('link',{name:'View shopping bag'}).click();await page.waitForURL('**/cart');const before=writes.length;
      await page.getByRole('button',{name:'Edit size M for Ira everyday kurta'}).click();const sizes=page.getByRole('group',{name:'Size for Ira everyday kurta'});assert(await sizes.getByRole('button',{name:'L',exact:true}).isDisabled());assert.equal(await sizes.getByRole('button',{name:'XL',exact:true}).count(),0);await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(writes.length,before);
    });
    for(const mode of ['server','rate','malformed','network'])await scenario(browser,engine,`EDIT-${mode}`,'Failed size update preserves the last confirmed bag and never retries a write',async page=>{
      const productCard=page.locator('[data-editorial-product="myra-peach-comfort-kurta-set"]');
      await productCard.getByRole('button',{name:'Quick add',exact:true}).click();const dialog=page.getByRole('dialog',{name:'HIDI editorial piece 2',exact:true});
      await dialog.getByRole('button',{name:'M',exact:true}).click();await dialog.getByRole('button',{name:'Add to bag',exact:true}).click();await dialog.getByRole('status').filter({hasText:'added to your bag'}).waitFor();await dialog.getByRole('link',{name:'View shopping bag'}).click();await page.waitForURL('**/cart');
      await page.getByRole('button',{name:'Edit size M for HIDI editorial piece 2'}).click();await page.getByRole('group',{name:'Size for HIDI editorial piece 2'}).getByRole('button',{name:'L',exact:true}).click();
      let attempts=0;if(mode==='network')await page.route('**/api/store/carts/*/items/*',route=>{attempts++;return route.abort('failed');});else cartMode=mode;
      const before=writes.length;await page.getByRole('button',{name:'Save size'}).click();const alert=page.locator('.form-error[role="alert"]');await alert.waitFor();assert.match(await alert.innerText(),mode==='rate'?/Please wait a moment/:/Check your bag before trying again/);
      await delay(250);assert.equal(mode==='network'?attempts:writes.length-before,1);assert.match(await page.locator('.cart-variant-label').innerText(),/Size M/);assert.match(await page.locator('.order-summary').innerText(),/₹1,499/);assert.equal(await page.locator('.cart-status').textContent(),'');
      await page.getByRole('button',{name:'Cancel',exact:true}).click();assert(await page.getByRole('button',{name:'Edit size M for HIDI editorial piece 2'}).isEnabled());
    },{viewport:{width:390,height:844},hasTouch:true});
    await scenario(browser,engine,'EDIT-load-retry','Size lookup failure can be retried or cancelled without changing the bag',async page=>{
      const dialog=await openAdd(page);await dialog.getByRole('button',{name:'M',exact:true}).click();await dialog.getByRole('button',{name:'Add to bag',exact:true}).click();await dialog.getByRole('status').filter({hasText:'added to your bag'}).waitFor();await dialog.getByRole('link',{name:'View shopping bag'}).click();await page.waitForURL('**/cart');const before=writes.length;
      let failed=true;await page.route('**/api/store/products/ira-beige-office-kurta-set',route=>failed?route.fulfill({status:503,contentType:'application/json',body:'{"message":"Unavailable"}'}):route.continue());await page.getByRole('button',{name:'Edit size M for Ira everyday kurta'}).click();await page.locator('.cart-items [role="alert"]').waitFor();failed=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('group',{name:'Size for Ira everyday kurta'}).waitFor();await fontAudit(page,engine,'cart-editor-open');assert(await page.getByRole('button',{name:'Save size'}).isDisabled());await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(writes.length,before);
    });
    if(engine==='chromium')await scenario(browser,engine,'ZOOM-pinch','Native two-finger pinch works on PDP and catalogue without zooming or locking the page',async(page,context)=>{
      const cdp=await context.newCDPSession(page);
      const pinch=async(viewport,label)=>{
        const box=await viewport.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
        const points=d=>[{id:1,x:x-d,y,radiusX:2,radiusY:2},{id:2,x:x+d,y,radiusX:2,radiusY:2}];
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(45)});
        for(const d of [55,65,75,85,95])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(d)});
        await until(()=>label.innerText().then(text=>parseInt(text)>150),'pinch zooms in');assert.equal(await page.evaluate(()=>visualViewport.scale),1);
        for(const d of [85,65,45,35,25])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(d)});
        await until(()=>label.innerText().then(text=>text==='100%'),'pinch zooms out');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(45)});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(70)});await until(()=>label.innerText().then(text=>parseInt(text)>120),'second pinch begins');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.keyboard.press('-');assert.equal(await label.innerText(),'100%','Cancelled touch releases the gesture and keyboard zoom still works');
        await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.equal(await label.innerText(),'180%');await page.keyboard.press('-');assert.equal(await label.innerText(),'100%');
      };
      await page.getByRole('button',{name:/Inspect HIDI editorial portrait/}).first().tap();await pinch(page.locator('div[class*="viewport"]').first(),page.locator('[class*="zoomLabel"]').first());await page.getByRole('button',{name:'Close image viewer'}).tap();
      await page.goto(base+'/collections/all');await page.getByRole('button',{name:/Expand HIDI editorial portrait/}).first().tap();await pinch(page.locator('dialog[open] div[class*="largePhoto"]').first(),page.locator('dialog[open] [class*="zoomLabel"]').first());await page.getByRole('button',{name:'Close enlarged photo'}).tap();assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    },{startPath:'/products/ira-beige-office-kurta-set',viewport:{width:390,height:844},hasTouch:true});
    await scenario(browser,engine,'WISH-01','Wishlist toggles and survives a settled full reload without changing cart',async page=>{
      const before=writes.length;await card(page).getByRole('button',{name:/Add to wishlist/}).click();await card(page).getByRole('button',{name:/Remove from wishlist/}).waitFor();
      // Settle Next prefetch before unloading. Do not suppress WebKit page errors.
      await settledReload(page);await card(page).getByRole('button',{name:/Remove from wishlist/}).waitFor();await card(page).getByRole('button',{name:/Remove from wishlist/}).click();await card(page).getByRole('button',{name:/Add to wishlist/}).waitFor();assert.equal(writes.length,before);
    });
    await scenario(browser,engine,'PRIV-01','Compact privileges preserve offer destinations and terms',async page=>{
      const details=page.locator('[data-section="privileges"] details');assert.equal(await details.getAttribute('open'),null);await details.locator('summary').click();assert.match(await details.innerText(),/₹3,999\+/);assert.match(await details.innerText(),/2 g silver/);assert.equal(await details.getByRole('link').count(),3);await fontAudit(page,engine,'privileges-expanded');await details.locator('summary').click();assert.equal(await details.getAttribute('open'),null);
    });
    await scenario(browser,engine,'LOOK-01','Carousel navigates, labels editorial sources and filters the archive',async page=>{
      const section=page.locator('[data-section="lookbook"]');assert.match(await section.innerText(),/HIDI editorial photography/);assert.equal(await page.locator('[aria-label="Customer styling photographs"]').count(),0);assert.equal(await section.getByRole('button',{name:'Previous look'}).isDisabled(),true);await section.getByRole('button',{name:'Next look'}).click();await until(()=>section.getByRole('button',{name:'Previous look'}).isEnabled(),'carousel advances');await section.getByRole('link',{name:'Explore the lookbook'}).click();await page.waitForURL('**/lookbook');await page.getByRole('heading',{name:'The HIDI lookbook.'}).waitFor();
      for(const[name,count]of[['Work',2],['Everyday',2],['Occasion',2],['All',6]]){await page.getByRole('group',{name:'Filter lookbook'}).getByRole('button',{name,exact:true}).click();assert.equal(await page.locator('[aria-label="Editorial lookbook"] article').count(),count);}await fontAudit(page,engine,'lookbook-archive');await page.screenshot({timeout:30000,path:resolve(output,`${engine}-lookbook.png`),fullPage:true});
    });
    await scenario(browser,engine,'FOOT-01','Footer archive works and newsletter uses the existing service',async page=>{
      const footer=page.locator('.footer');assert.equal(await footer.locator('[aria-disabled="true"]').count(),0);assert((await footer.locator('a[href="/lookbook"]').count())>0);await footer.getByRole('textbox',{name:'Email address',exact:true}).fill('editorial-fixture@example.invalid');const before=writes.length;await footer.getByRole('button',{name:/Subscribe/}).click();await until(()=>writes.length>before,'newsletter request');assert.equal(writes.at(-1).route,'/marketing/newsletter');assert.equal(writes.at(-1).body.source,'FOOTER');await page.locator('#newsletter-status').filter({hasText:/joined|list|Thank|subscribed|Welcome/i}).waitFor();
    });
    await scenario(browser,engine,'EMPTY-01','Empty catalogue retains hero, discovery and calm recovery',async page=>{
      catalogueMode='empty';await page.waitForLoadState('networkidle');await page.reload({waitUntil:'networkidle'});await page.getByText('Our latest edit is being prepared.').waitFor();assert.equal(await page.locator('[data-editorial-product]').count(),0);assert.equal(await page.getByRole('heading',{name:'Wear the feeling.'}).count(),1);
    });
    await runQualityChecks({browser,engine,scenario,until,base,output,products,writes,setCartMode:value=>{cartMode=value;}});
    await runCheckoutThemeChecks({browser,engine,scenario,until,base,output,products,settleFixtureNetwork});
    await browser.close();activeBrowser=null;
  }
}finally{
  if(activeBrowser)await activeBrowser.close();server.kill('SIGTERM');upstream.closeAllConnections();await new Promise(done=>upstream.close(done));
  await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Production build; isolated fixtures; no live transactions',results,pageErrors,writes},null,2));await writeFile(resolve(output,'typography.json'),JSON.stringify(typography,null,2));
  const keys=['engine','viewport','state','section','tag','text','family','size','weight','lineHeight','spacing','color'],csvValue=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  await writeFile(resolve(output,'typography.csv'),keys.join(',')+'\n'+typography.map(v=>keys.map(k=>csvValue(v[k])).join(',')).join('\n'));await writeFile(resolve(output,'next-server.log'),serverLog);
}
const failed=results.filter(r=>r.status==='FAIL');assert(results.length>0,'At least one browser case must run');console.log(`${results.length-failed.length}/${results.length} browser cases passed; ${typography.length} computed text-style observations.`);assert.equal(failed.length,0,failed.map(r=>`${r.engine} ${r.id}: ${r.error}`).join('\n'));
