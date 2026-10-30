import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startPreview} from './preview.mjs';
const out=resolve(process.argv[2]);await mkdir(out,{recursive:true});
const baseline=await startPreview({cacheDir:join(out,'cache'),changed:false});
const candidate=await startPreview({cacheDir:join(out,'cache')});
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const results=[],errors=[];const routes=['/','/collections/all',candidate.productPath,'/cart','/checkout','/account','/wishlist','/about','/contact','/shipping','/returns','/privacy','/guides','/guides/kurta-set-buying-guide','/guides/choosing-kurta-set-size','/lookbook'];
const snapshot=p=>p.evaluate(()=>{const h=document.querySelector('.site-header'),s=getComputedStyle(h),b=getComputedStyle(h,'::before'),r=h.getBoundingClientRect();return{background:s.backgroundColor,before:b.backgroundColor,image:b.backgroundImage,opacity:b.opacity,header:{width:r.width,height:r.height},logo:h.querySelector('img')?.getAttribute('src'),controls:[...h.querySelectorAll('a,button')].map(e=>({label:e.getAttribute('aria-label')||e.textContent,color:getComputedStyle(e).color,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth+1,footer:document.querySelector('footer')?.textContent,bodyBg:getComputedStyle(document.body).backgroundColor};});
try{for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,webkit').split(',')){
 const browser=await pw[engine].launch();try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
 await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(!['GET','HEAD'].includes(r.method())||r.resourceType()==='media'||/razorpay|google-analytics|googletagmanager|cloudflareinsights/.test(u.hostname))return route.abort();return route.continue();});
 let page=await context.newPage();
 const open=async url=>{page.removeAllListeners('pageerror');await page.close();page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push({engine,width,message:e.message}));await page.goto(url,{waitUntil:'domcontentloaded'});};
 for(const path of routes){
  if(path.startsWith('/guides')){
   const measure=()=>page.locator('body > header').evaluate(e=>({background:getComputedStyle(e).backgroundColor,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width,text:e.textContent,logo:e.querySelector('img').getAttribute('src'),main:document.querySelector('main').textContent,footer:document.querySelector('footer').textContent}));
   await open(baseline.base+path);await page.locator('body > header img').waitFor();const before=await measure();
   await open(candidate.base+path);await page.locator('body > header img').waitFor();const after=await measure();assert.equal(after.background,'rgb(89, 30, 34)');delete before.background;delete after.background;assert.deepEqual(after,before);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   results.push({engine,width,path,passed:true,headerColor:'#591E22',layoutAndContentPreserved:true});console.log('PASS '+engine+' '+width+' '+path);continue;
  }
  if(path==='/privacy'){
   await open(baseline.base+path);const priorText=await page.locator('main').innerText();
   await open(candidate.base+path);assert.equal(await page.locator('.site-header').count(),0);assert.equal(await page.locator('main').innerText(),priorText);
   results.push({engine,width,path,passed:true,standalonePolicyPreserved:true});console.log('PASS '+engine+' '+width+' standalone privacy');continue;
  }
  const go=async base=>{await open(base+path);await page.locator('.site-header').waitFor();await page.waitForFunction(()=>{const h=document.querySelector('.site-header');return h?.querySelector('img')?.complete&&(h.id==='site-header'?!h.hasAttribute('data-hidi-first-header'):!!document.documentElement.style.getPropertyValue('--hidi-header-height'));});await page.evaluate(()=>document.fonts.ready);if(path!=='/'&&path!=='/checkout')await page.waitForFunction(()=>!document.querySelector('.site-header a[aria-label^="Bag with"]')||document.querySelector('.site-header a[aria-label="Bag with 1 item"]'));};
  await go(baseline.base);const prior=await snapshot(page);await go(candidate.base);await page.waitForTimeout(150);const next=await snapshot(page);
  assert.equal(next.background,'rgb(89, 30, 34)',path+' base');assert.equal(next.before,'rgb(89, 30, 34)',path+' surface');assert.equal(next.image,'none');assert.equal(next.opacity,'1');assert(!next.overflow,path+' overflow');
  for(const key of ['header','logo','controls','footer','bodyBg'])assert.deepEqual(next[key],prior[key],path+' changed '+key);
  await page.evaluate(()=>scrollTo(0,650));await page.waitForTimeout(300);assert.equal((await snapshot(page)).before,'rgb(89, 30, 34)');await page.evaluate(()=>scrollTo(0,0));
  if(path==='/checkout'){await page.locator('#hidi-coupon-code').waitFor();assert.equal(await page.locator('#hidi-coupon-code').inputValue(),'');assert.equal(await page.locator('.hidi-coupon-hint').getByText('GET1',{exact:true}).count(),0);await page.locator('.hidi-coupon-hint').getByRole('button',{name:'WELCOME250',exact:true}).waitFor();}
  if(path==='/'||path==='/collections/all'){
   const menu=page.getByRole('button',{name:path==='/'?'Open HIDI menu':'Open menu',exact:true});
   if(await menu.isVisible()){await menu.click();await page.getByRole('dialog').first().waitFor();assert.equal((await snapshot(page)).before,'rgb(89, 30, 34)');await page.keyboard.press('Escape');await page.getByRole('dialog').first().waitFor({state:'hidden'});}
   const search=page.getByRole('button',{name:path==='/'?'Search HIDI products':'Search',exact:true});await search.click();await page.getByRole('dialog').first().waitFor();await page.keyboard.press('Escape');
  }
  const label=path==='/'?'home':path==='/collections/all'?'collection':path.startsWith('/products/')?'product':path.slice(1);
  if(['home','collection','product','cart','checkout'].includes(label)){await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(0,999);await page.screenshot({path:join(out,engine+'-'+width+'-'+label+'.png')});}
  results.push({engine,width,path,passed:true,headerColor:'#591E22',layoutAndControlsPreserved:true});console.log('PASS '+engine+' '+width+' '+path);
 }
 await context.close();
 }}finally{await browser.close();}
}
assert.deepEqual(errors,[]);await writeFile(join(out,'regression.json'),JSON.stringify({passed:true,results,errors,liveWrites:0,deployed:false,scope:'public pages; isolated sample cart; payment execution not performed'},null,2));
}catch(e){await writeFile(join(out,'failure.json'),JSON.stringify({error:String(e),results,errors},null,2));throw e;}finally{await baseline.close();await candidate.close();}
