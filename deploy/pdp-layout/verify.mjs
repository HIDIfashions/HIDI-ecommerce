import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {snapshotServer} from './snapshot-server.mjs';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const out=resolve(process.env.HIDI_TEST_OUTPUT||'outputs/pdp-layout');await mkdir(out,{recursive:true});
const css=await readFile(new URL('./pdp-layout.css',import.meta.url),'utf8');
const actual=process.env.HIDI_RUNTIME_BASE;
const snapshot=await snapshotServer({directory:join(out,'test-snapshot'),css,upstream:actual||'https://hidiindia.com'});
const base=actual||snapshot.base;
async function requireApprovedStyle(page){
 assert.equal(await page.locator('style[data-hidi-storefront-layer-fix]').count(),1);
 assert(await page.locator('style[data-hidi-storefront-layer-fix]').textContent().then(text=>text.includes('/* hidi-pdp-layout-20261023 */\n'+css)), 'Actual runtime must serve the exact approved stylesheet');
}
const slug='kur-036-women-s-wine-purple-embroidered-kurta-set-with-dupatta';
const products=JSON.parse((await snapshot.pull('/api/store/products')).body);
const history=products.filter(p=>p.slug!==slug&&p.images?.length).slice(0,2);
assert.equal(history.length,2);
const viewports=[[320,740],[390,844],[620,844],[760,900],[761,900],[1000,900],[1001,768],[1024,768],[1280,720],[1366,768],[1536,864],[1920,1080]];
const engines=(process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',');
const results=[],interactions=[],unchanged=[],errors=[];let isolatedCartAdds=0;
async function decoded(page,selector,expected=null){
 await page.waitForFunction(async({selector,expected})=>{
  const img=document.querySelector(selector);if(!img?.complete||!img.naturalWidth)return false;
  const src=img.currentSrc,url=new URL(src,location.href),source=url.searchParams.get('url')||url.pathname;
  if(expected&&source!==expected)return false;
  try{await img.decode();return img===document.querySelector(selector)&&img.currentSrc===src&&img.naturalWidth>0;}catch{return false;}
 },{selector,expected});
}
async function ready(page){
 await page.locator('.sizes button[aria-pressed]:enabled').first().waitFor();
 await page.locator('.pdp-recent article').first().waitFor();
 await page.waitForFunction(()=>document.fonts.status==='loaded');
 await decoded(page,'[class*="activeImage"] img');
}
async function measure(page,compare=false){
 await decoded(page,'[class*="activeImage"] img');
 await page.waitForFunction(()=>{const e=document.querySelector('[class*="activeImage"]'),top=parseFloat(getComputedStyle(e).getPropertyValue('--pdp-gallery-top'))||150;return innerWidth<761||innerWidth>1000||Math.abs(e.getBoundingClientRect().height-Math.min(820,innerHeight-top-40))<0.1;});
 const handle=await page.waitForFunction(({css,compare})=>{
 // The retained reduced-motion rules use 0.01ms transitions. Disable them in
 // this test task so both stylesheet states are measured at their final size.
 const noTransition=document.createElement('style');noTransition.textContent='*,*::before,*::after{transition:none!important}';document.head.append(noTransition);
 try{
 function read(){
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
 const q=s=>document.querySelector(s), c=s=>getComputedStyle(q(s));
 const active=q('[class*="activeImage"]'),img=active?.querySelector('img');
 if(!img?.complete||!img.naturalWidth||!img.naturalHeight)return false;
 const review=q('#reviews'),related=q('.pdp-related'),recent=q('.pdp-recent');
 return {image:box(active),natural:[img.naturalWidth,img.naturalHeight],fit:getComputedStyle(img).objectFit,
  viewportHeight:innerHeight,galleryTopOffset:parseFloat(getComputedStyle(active).getPropertyValue('--pdp-gallery-top'))||150,scrollY,
  gallery:box(q('[class*="galleryLayout"]')),info:box(q('.pdp-info')),
  reviewGap:box(related).y-box(review).bottom,relatedPadding:c('.pdp-related').paddingTop,
  recentGap:box(recent).y-box(related).bottom,recentPadding:c('.pdp-recent').paddingTop,
  footerGap:box(q('footer.footer')).y-box(recent).bottom,
  selectedVisible:[...document.querySelectorAll('.pdp-purchase > [class*="selectionSummary"],.pdp-selected-detail:not(.sr-only)')].some(e=>e.getBoundingClientRect().height>1),
  prices:q('[data-pdp-summary]')?.textContent||q('.pdp-price').textContent,
  photos:[...document.querySelectorAll('[class*="galleryLayout"] img')].map(e=>({src:e.getAttribute('src'),srcset:e.getAttribute('srcset')})),
  overflow:document.documentElement.scrollWidth-innerWidth,
  sizeLabels:[...document.querySelectorAll('.pdp-info .sizes button')].map(e=>({text:e.textContent,disabled:e.disabled})),
  header:[c('.site-header').height,c('.site-header').backgroundColor],
  footer:[c('footer.footer').paddingBottom,c('footer.footer').backgroundColor]};
 }
 const after=read();
 if(!after||!compare)return after;
 const style=document.querySelector('style[data-hidi-storefront-layer-fix]'),original=style.textContent;
 if(!original.includes(css))throw Error('Exact candidate CSS required for paired measurement');
 try{style.textContent=original.replace(css,'');const before=read();return before?{before,after}:false;}
 finally{style.textContent=original;}
 }finally{noTransition.remove();}
},{css,compare});try{return await handle.jsonValue();}finally{await handle.dispose();}}
function validate(before,after,width){
 for(const key of ['prices','photos','sizeLabels','header','footer','natural','fit','galleryTopOffset','scrollY'])assert.deepEqual(after[key],before[key],key+' unchanged');
 assert(after.overflow<=1,'No horizontal overflow');assert.equal(after.selectedVisible,false);
 assert(after.reviewGap<=33&&after.reviewGap<before.reviewGap,'Compact reviews boundary');
 assert(after.recentGap<=33&&after.recentGap<before.recentGap,'Compact history boundary');
 assert(after.footerGap<=41&&after.footerGap<before.footerGap,'Compact footer boundary');
 if(width>1000){assert(after.image.width>=before.image.width-1,'Desktop photo never shrinks');assert(Math.abs(after.image.width-(after.gallery.width-78))<2,'Image uses all available gallery width');assert(after.image.right<after.info.x,'No collision with purchase panel');}
 else {assert.equal(after.image.width,before.image.width,'Mobile/tablet image width retained');assert.equal(after.image.height,before.image.height,'Mobile/tablet image height retained');}
 if(width>=761&&width<=1000){
  for(const state of [before,after])assert(Math.abs(state.image.height-Math.min(820,state.viewportHeight-state.galleryTopOffset-40))<0.1,'Tablet height follows its current header offset');
 }
}
async function capture(page,name){
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,name+'-top.png')});
 await page.screenshot({path:join(out,name+'-full.png'),fullPage:true});
 for(const [label,selector] of [['reviews','.pdp-related'],['recent','.pdp-recent'],['footer','footer.footer']]){
  await page.locator(selector).evaluate(e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-300));
  await page.screenshot({path:join(out,name+'-'+label+'.png')});
 }
}
async function functional(page,engine,width){
 const purchase=page.locator('.pdp-info .pdp-purchase');
 const size=purchase.locator('.sizes button:enabled').first();
 const add=purchase.getByRole('button',{name:'Add to Cart',exact:true});
 const buy=purchase.getByRole('button',{name:'Buy Now',exact:true});
 assert.equal(await size.getAttribute('aria-pressed'),'false');
 const initialAdds=isolatedCartAdds;
 await add.click();
 await page.getByRole('dialog').filter({has:page.getByRole('group',{name:'Available sizes'})}).waitFor();
 assert.equal(isolatedCartAdds,initialAdds,'Unselected action opens size picker without cart mutation');
 await page.keyboard.press('Escape');
 await size.click();assert.equal(await size.getAttribute('aria-pressed'),'true');
 assert(await add.isEnabled());assert(await buy.isEnabled());
 await size.click();assert.equal(await size.getAttribute('aria-pressed'),'false');
 const guide=purchase.getByRole('button',{name:'Size & fit guide',exact:true});
 await guide.click();assert.equal(await guide.getAttribute('aria-expanded'),'true');await guide.click();
 const thumbs=page.getByRole('button',{name:/^View product image /});
 for(let i=0;i<await thumbs.count();i++){
  const source=await thumbs.nth(i).locator('img').evaluate(img=>{const u=new URL(img.currentSrc||img.src,location.href);return u.searchParams.get('url')||u.pathname;});
  await thumbs.nth(i).click();assert.equal(await thumbs.nth(i).getAttribute('aria-pressed'),'true');
  await decoded(page,'[class*="activeImage"] img',source);
 }
 await thumbs.first().click();
 await page.locator('.pdp-image[class*="activeImage"]').click();
 const dialog=page.getByRole('dialog').filter({has:page.getByRole('button',{name:'Close image viewer'})});
 await dialog.waitFor();await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 await page.getByRole('button',{name:'Next product image',exact:true}).click();
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 const review=page.locator('#reviews summary');await review.click();assert(await review.evaluate(e=>e.parentElement.open));await review.click();
 await size.click();const before=isolatedCartAdds;
 const added=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.startsWith('/api/store/carts/'));
 await add.click();assert((await added).ok(),'Isolated cart request succeeds');
 assert.equal(isolatedCartAdds,before+1,'One isolated cart request');
 assert.equal(await page.locator('.pdp-purchase > [class*="selectionSummary"]:visible').count(),0);
 interactions.push({engine,width,thumbnails:true,zoom:true,keyboardAndEscape:true,sizeToggle:true,sizeGuide:true,reviews:true,cart:true,buyNowEnabledAfterSize:true});
}
try{
 for(const engine of engines){
  const browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&process.platform==='win32'?{channel:'chrome'}:{})});
  try{for(const [width,height] of viewports){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',hasTouch:width<=760});
   await context.addInitScript(history=>localStorage.setItem('hidi_recently_viewed_products_v1',JSON.stringify(history.map(p=>({slug:p.slug,viewedAt:Date.now()})))),history);
   const page=await context.newPage();page.setDefaultTimeout(30000);
   const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
   const pending=new Map(),networkErrors=[];
   const safeUrl=req=>{const u=new URL(req.url());return u.origin+u.pathname;};
   page.on('request',req=>pending.set(req,safeUrl(req)));
   page.on('requestfinished',req=>pending.delete(req));
   page.on('requestfailed',req=>{networkErrors.push({url:safeUrl(req),error:req.failure()?.errorText});pending.delete(req);});
   page.on('response',res=>{if(res.status()>=400)networkErrors.push({url:safeUrl(res.request()),status:res.status()});});
   const cart={items:[],itemCount:0,subtotalPaise:0,shippingPaise:0,totalPaise:0};
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.startsWith('/api/store/carts/')){
     if(req.method()==='POST'){assert.equal(req.postDataJSON().quantity,1);assert.equal(typeof req.postDataJSON().variantId,'string');isolatedCartAdds++;}
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cart)});
    }
    if(!['GET','HEAD'].includes(req.method())||/googletagmanager|google-analytics|facebook\.net|razorpay/.test(url.hostname)||req.resourceType()==='media')return route.abort();
    if(process.env.HIDI_MEDIA_READONLY_ORIGIN&&url.origin===base&&(url.pathname.startsWith('/media/')||url.pathname==='/_next/image')){
     const r=await snapshot.pull(process.env.HIDI_MEDIA_READONLY_ORIGIN+url.pathname+url.search);return route.fulfill({status:r.status,contentType:r.contentType,body:r.body});
    }
    if(url.origin!==base){const r=await snapshot.pull(url.href);return route.fulfill({status:r.status,contentType:r.contentType,body:r.body});}
    return route.continue();
   });
   try{
    snapshot.setCandidate(true);
    assert((await page.goto(base+'/products/'+slug,{waitUntil:'domcontentloaded'})).ok());await ready(page);
    await requireApprovedStyle(page);
    const {before,after}=await measure(page,true),baselineErrors=pageErrors.slice();
    validate(before,after,width);
    if(engine==='chromium'&&[390,1536,1920].includes(width)){
     const original=await page.locator('style[data-hidi-storefront-layer-fix]').textContent();
     try{
      await page.evaluate(css=>{const s=document.querySelector('style[data-hidi-storefront-layer-fix]');s.textContent=s.textContent.replace(css,'');},css);
      await capture(page,'before-'+width);
     }finally{await page.evaluate(original=>document.querySelector('style[data-hidi-storefront-layer-fix]').textContent=original,original);}
    }
    console.log(JSON.stringify({engine,width,beforeGap:before.reviewGap,afterGap:after.reviewGap,beforeRecent:before.recentGap,afterRecent:after.recentGap,beforeFooter:before.footerGap,afterFooter:after.footerGap}));
    await page.reload({waitUntil:'domcontentloaded'});await ready(page);await requireApprovedStyle(page);
    const reloaded=await measure(page,true);validate(reloaded.before,reloaded.after,width);
    assert(Math.abs(reloaded.after.image.width-after.image.width)<1);
    const tabletStates=[];
    if(width>=761&&width<=1000){
     for(const top of [100,0]){
      await page.evaluate(async top=>{scrollTo(0,top);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},top);
      const state=await measure(page,true);validate(state.before,state.after,width);tabletStates.push(state);
     }
    }
    if(engine==='chromium'&&[390,1536,1920].includes(width))await capture(page,'after-'+width);
    if([390,1536].includes(width))await functional(page,engine,width);
    assert.deepEqual(pageErrors.filter(e=>!baselineErrors.includes(e)),[],'No new browser exceptions');
    results.push({engine,width,height,before,after,reloaded,tabletStates,pairedHeaderState:true,passed:true});
    console.log('PASS '+engine+' '+width+'x'+height+' image '+before.image.width.toFixed(0)+'→'+after.image.width.toFixed(0));
   }catch(e){
    await writeFile(join(out,engine+'-'+width+'-network.json'),JSON.stringify({pageErrors,pending:[...pending.values()],networkErrors},null,2));
    await page.screenshot({path:join(out,engine+'-'+width+'-failure.png'),fullPage:true}).catch(()=>{});throw e;
   }
   finally{await context.close();}
  }}finally{await browser.close();}
 }
 await writeFile(join(out,'report.json'),JSON.stringify({passed:true,actualRuntime:!!actual,publicMediaFixture:!!process.env.HIDI_MEDIA_READONLY_ORIGIN,cssSha256:createHash('sha256').update(css).digest('hex'),results,interactions,unchanged,isolatedCartAdds,upstreamWrites:0,deploymentPerformed:false},null,2));
}catch(e){await writeFile(join(out,'failure.json'),JSON.stringify({passed:false,error:e.stack,results,interactions},null,2));throw e;}
finally{await snapshot.save();await snapshot.close();}
