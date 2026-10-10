import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base=process.env.HIDI_HOME_BASE_URL||'http://127.0.0.1:3208';
const output=resolve('validation/homepage-launch');await mkdir(output,{recursive:true});
const reports=[];
const server=process.env.HIDI_HOME_BASE_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','3208','--strictPort'],{stdio:'ignore'});
process.on('exit',()=>server?.kill('SIGTERM'));
for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const widths=[[320,740],[360,800],[390,844],[430,932],[700,900],[768,1024],[844,390],[1024,768],[1440,900],[1920,1080]];
const image='/assets/images/hero-landscape.webp',portrait='/assets/images/ananya-top-picks/ananya-green.webp';
const product={id:'fixture',slug:'fixture-kurta',name:'Fixture cotton kurta',minPricePaise:199900,inStock:true,images:[],collections:[],variants:[]};
async function fixture(browser,width,height,shape='landscape',multiple=false){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1100,reducedMotion:'reduce'});
 const calls=[];const errors=[];
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin!==new URL(base).origin)return route.abort();
  const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/api/hidi/hero-config')return send({version:1,active:true,type:'image',url:image,items:multiple?[image,portrait,image+'?second'].map(url=>({type:'image',url})):undefined,autoPlay:false});
  if(u.pathname==='/api/hidi/landing-media-config'){
   const slots=Object.fromEntries(['range-occasion','range-new-arrivals','range-work-edit','range-everyday','range-shop-all','hidi-edit-banner','ananya-green'].map(id=>[id,{active:true,type:'image',url:id==='ananya-green'&&shape==='portrait'?portrait:image,fitMode:'cover',desktopPosition:'50% 50%',mobilePosition:'50% 50%'}]));
   return send({version:1,slots,ananya:multiple?{active:true,autoPlay:false,items:[image,portrait,image+'?third'].map(url=>({type:'image',url,fitMode:'cover'}))}:null});
  }
  if(u.pathname==='/api/store/products')return send([product]);
  if(req.method()!=='GET'&&req.method()!=='HEAD'){calls.push({method:req.method(),path:u.pathname,body:req.postData()});return send({success:true,message:'Fixture subscription accepted.'});}
  if(u.pathname.startsWith('/api/'))return send({items:[],products:[],published:true});
  return route.continue();
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});await page.locator('#hidi-edit').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{const i=document.querySelector('#hidi-edit img');return i?.complete&&i.naturalWidth>0;},{},{timeout:20000});await page.locator('#hidi-edit img').evaluate(i=>i.decode());
 await page.locator('#footer').scrollIntoViewIfNeeded();
 await page.locator('#meet-hidi img').evaluate(i=>i.decode());
 return{page,context,calls,errors};
}
async function geometry(page,width,height){
 const g=await page.evaluate(()=>{
  const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return{x:r.x,y:r.y+scrollY,width:r.width,height:r.height,bottom:r.bottom+scrollY};};
  const ananya=document.querySelector('#meet-hidi img'),banner=document.querySelector('#hidi-edit img');
  return{width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,sections:[...document.querySelectorAll('main>section')].map(e=>({id:e.id,top:e.offsetTop,height:e.offsetHeight})),hasPhotoControls:!!document.querySelector('#meet-hidi .media-sequence-controls'),photo:box('#meet-hidi img'),canvas:box('.meet-cinematic--photo'),ananyaButton:box('.meet-cinematic__content'),banner:box('#hidi-edit img'),bannerButton:box('.edit-campaign__button'),ananyaRatio:ananya.naturalWidth/ananya.naturalHeight,bannerRatio:banner.naturalWidth/banner.naturalHeight,header:box('.campaign-header'),controls:[...document.querySelectorAll('.hidi-collection-dot,.social-link,.footer-column>a,.footer-column>button,.promise .small-link')].map(e=>({text:e.getAttribute('aria-label')||e.innerText,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}))};
 });
 assert(g.overflow<=1,'No page-wide horizontal scroll');
 assert(Math.abs(g.banner.width/g.banner.height-g.bannerRatio)<.02,'Admin banner uses its natural proportions: '+JSON.stringify(g));
 const compact=width<=700||(width<=1000&&height>width);
 if(compact){assert(Math.abs(g.photo.width/g.photo.height-g.ananyaRatio)<.02,'Full photo has its natural height');assert(g.canvas.height-g.photo.height<(g.hasPhotoControls?200:140),'Photo only reserves space for its visible action and optional media controls');assert(g.ananyaButton.y>=g.photo.bottom-1,'Shop now is below the full photo');}
 if(width<=700){assert(g.bannerButton.y>=g.banner.bottom-1,'Banner CTA does not cover the outfit');assert(g.controls.every(c=>c.height>=43.5),'All footer, gallery and promise controls have 44px tap height');}
 for(let i=1;i<g.sections.length;i++)assert(g.sections[i].top>=g.sections[i-1].top+g.sections[i-1].height-2,'Sections remain in normal document order');
 await page.evaluate(()=>{const e=document.querySelector('.hidi-collection-gallery');scrollTo(0,e.offsetTop+document.querySelector('#our-range').offsetTop+100);});
 assert(await page.evaluate(()=>document.elementFromPoint(innerWidth-35,35)?.closest('.campaign-header')!==null),'Gallery layers never cover the fixed header');
 return g;
}
for(const engine of(process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await pw[engine].launch({headless:true});
 try{
  for(const shape of['landscape','portrait'])for(const[width,height]of widths){
   const{page,context,calls,errors}=await fixture(browser,width,height,shape);
   try{const g=await geometry(page,width,height);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
    if(shape==='landscape'&&(width===390||width===1440)){await page.locator('#meet-hidi').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`${engine}-${width}-ananya.png`)});await page.screenshot({path:resolve(output,`${engine}-${width}-full.png`),fullPage:true});}
    reports.push({engine,shape,width,height,status:'PASS',geometry:g});console.log(`PASS ${engine} ${shape} ${width}x${height}: geometry, full images, spacing, layers and tap targets`);
   }catch(e){await page.screenshot({path:resolve(output,`${engine}-${shape}-${width}-failure.png`),fullPage:true});throw e;}finally{await context.close();}
  }
  const{page,context,calls,errors}=await fixture(browser,390,844,'landscape',true);
  try{
   // Each interactive gallery control, both media lists, and reload are exercised.
   await page.locator('#our-range').scrollIntoViewIfNeeded();
   for(const name of['Occasion','New Arrivals','Workwear Edit','Everyday','Shop All']){await page.getByRole('button',{name:'Show '+name,exact:true}).click();assert.equal(await page.getByRole('button',{name:'Show '+name,exact:true}).getAttribute('aria-pressed'),'true');}
   await page.getByRole('button',{name:'Next collection',exact:true}).click();await page.getByRole('button',{name:'Previous collection',exact:true}).click();
   for(const label of['hero media','Ananya photo']){
    const next=page.getByRole('button',{name:'Next '+label,exact:true});
    if(await next.count()){await next.click();await page.getByRole('button',{name:'Previous '+label,exact:true}).click();for(let i=1;i<=3;i++)await page.getByRole('button',{name:`Show ${label} ${i}`,exact:true}).click();}
   }
   await page.getByRole('button',{name:'Open HIDI menu',exact:true}).click();assert(await page.getByRole('dialog').isVisible());assert.equal(await page.locator('.campaign-panel-nav>a').count(),2);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
   await page.getByRole('button',{name:'Search HIDI products',exact:true}).click();await page.getByLabel('Search products',{exact:true}).fill('cotton');await page.getByText('Fixture cotton kurta',{exact:true}).waitFor();await page.keyboard.press('Escape');
   await page.locator('#footer').scrollIntoViewIfNeeded();await page.getByRole('textbox',{name:'Email address',exact:true}).fill('fixture@example.test');await page.getByRole('button',{name:'Subscribe to HIDI updates',exact:true}).click();await page.getByText('Your newsletter subscription has been confirmed.',{exact:true}).waitFor();assert.equal(calls.length,1);assert(calls[0].path.includes('newsletter'));await page.keyboard.press('Escape');
   await page.reload({waitUntil:'networkidle'});await page.locator('#hidi-edit').scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const i=document.querySelector('#hidi-edit img');return i?.complete&&i.naturalWidth>0;},{},{timeout:20000});await page.locator('#hidi-edit img').evaluate(i=>i.decode());await page.locator('#footer').scrollIntoViewIfNeeded();await page.locator('#meet-hidi img').evaluate(i=>i.decode());await geometry(page,390,844);assert.deepEqual(errors,[]);
   if(engine==='chromium')for(const id of['our-range','meet-hidi','hidi-edit','our-promises']){
    await page.locator('#'+id).scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:195,y:650}]});
    for(const y of[580,500,420,340,260,180])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:195,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);assert(await page.evaluate(()=>scrollY)>before+50,'Native touch scroll through '+id);await cdp.detach();
   }
   reports.push({engine,status:'PASS',case:'controls-search-newsletter-reload-native-scroll'});console.log(`PASS ${engine}: gallery selectors, media lists, menu/Escape, search, newsletter, reload and scrolling`);
  }finally{await context.close();}
 }finally{await browser.close();await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));}
}
server?.kill('SIGTERM');
console.log(`PASS: ${reports.length} homepage cases`);
