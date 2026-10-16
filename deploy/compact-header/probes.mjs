import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {navigate} from '../collection-cleanup/navigation.mjs';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
const engines=['chromium','firefox','webkit'];
export async function probe(base,output,{baseline,landing}={}){
 const proof=JSON.parse(await readFile('evidence/compact-header/candidate/baseline-private.json','utf8'));
 assert(proof.passed&&proof.unchangedBaseline&&proof.liveWrites===0);
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
 await mkdir(output,{recursive:true});
 const errors=[],writes=[],gatewayRetries=[],results=[];
 landing ||= await (await fetch('https://hidiindia.com/api/hidi/landing-media-config')).json();
 const offers=await (await fetch('https://hidiindia.com/api/hidi/offers')).json();
 const metadata=p=>p.locator('head title,head meta,head link[rel=canonical]').evaluateAll(nodes=>nodes.map(n=>n.outerHTML).sort());
 const footer=p=>p.locator('footer').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,images:[...n.querySelectorAll('img')].map(i=>({src:new URL(i.src).pathname,width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height}))})));
 for(const engine of engines){
  const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
  try{for(const width of [320,390,768,1001,1440]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',hasTouch:width<700,extraHTTPHeaders:{'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}});
   await context.route('**/*',async route=>{
    const r=route.request(),u=new URL(r.url());
    if(!['GET','HEAD'].includes(r.method())){
     if(r.method()==='PUT'&&u.pathname==='/api/admin/session'&&!r.postData())return route.abort();
     if(isBlockedTelemetry(r.method(),r.url(),base)||/google-analytics\.com|analytics\.google\.com|cloudflareinsights\.com/.test(u.hostname))return route.fulfill({status:204,body:''});
     writes.push({method:r.method(),path:u.pathname});return route.abort();
    }
    if(r.resourceType()==='script'&&/googletagmanager\.com|google-analytics\.com|cloudflareinsights\.com/.test(u.hostname))return route.fulfill({status:200,contentType:'application/javascript',body:'/* tracking isolated */'});
    if(r.resourceType()==='media'||/razorpay\.com$/.test(u.hostname))return route.abort();
    if(u.pathname==='/api/hidi/landing-media-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(landing)});
    if(u.pathname==='/api/hidi/offers')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(offers)});
    return route.continue();
   });
   let page,stage='';
   const pending=new Map();
   const fresh=async(path,observed=true)=>{const p=await context.newPage();p.setDefaultTimeout(45000);const reads=new Set();pending.set(p,reads);p.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))reads.add(r);});for(const event of ['requestfinished','requestfailed'])p.on(event,r=>reads.delete(r));if(observed)p.on('pageerror',e=>errors.push({engine,width,stage:path,message:e.message}));await navigate(p,(observed?base:baseline)+path,gatewayRetries);return p;};
   const finish=async p=>{let quiet=0;for(let elapsed=0;elapsed<30000;elapsed+=50){await new Promise(r=>setTimeout(r,50));quiet=pending.get(p).size?0:quiet+50;if(quiet>=300){p.removeAllListeners('pageerror');await p.close();return;}}assert.fail('API reads did not settle before teardown');};
   const measure=async(p,path)=>{
    await p.locator('.site-header').waitFor();
    await p.waitForFunction(()=>{const img=document.querySelector('#site-header .campaign-brand img,.site-header[data-editorial-header] .wordmark img');return img?.complete&&img.naturalWidth>0;});
    const home=path==='/',checkout=path==='/checkout';
    const shape=await p.evaluate(()=>{const h=document.querySelector('.site-header'),logo=h.querySelector('.campaign-brand,.wordmark'),r=h.getBoundingClientRect(),lr=logo.getBoundingClientRect();const controls=[...h.querySelectorAll('a,button')].map(e=>({label:e.getAttribute('aria-label')||e.textContent,rect:e.getBoundingClientRect()})).filter(e=>e.rect.width&&e.rect.height);return{height:r.height,bottom:r.bottom,y:r.y,logoWidth:lr.width,logoHeight:lr.height,art:new URL(logo.querySelector('img').src).pathname,overflow:document.documentElement.scrollWidth>innerWidth,controls:controls.map(({label,rect:q})=>({label,x:q.x,y:q.y,width:q.width,height:q.height}))};});
    const expected=home?(width<=700?58:72):checkout?(width<=720?64:88)+1:(width<=1000?57:85);
    assert(Math.abs(shape.height-expected)<2,'Unexpected header height '+JSON.stringify({path,width,shape,expected}));
    const logo=home?(width<=360?68:width<=700?74:width<=1000?92:102):(width<=389?80:width<=1000?86:136);
    assert(Math.abs(shape.logoWidth-logo)<1,'Logo width mismatch');assert(!shape.overflow,'Horizontal overflow '+path);
    for(const c of shape.controls)assert(c.x>=-1&&c.x+c.width<=width+1,'Header control outside viewport '+JSON.stringify(c));
    for(let i=0;i<shape.controls.length;i++)for(let j=i+1;j<shape.controls.length;j++){const a=shape.controls[i],b=shape.controls[j];assert(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<2||Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<2,'Header controls overlap '+JSON.stringify([a,b]));}
    return shape;
   };
   try{
    const shapes={};let productPath;
    for(const path of ['/','/collections/all']){
     stage=path;page=await fresh(path);if(path==='/')await page.locator('#site-header:not([data-hidi-first-header])').waitFor();shapes[path]=await measure(page,path);
     if(path==='/'){
      await page.locator('#site-header:not([data-hidi-first-header])').waitFor();
      await page.getByRole('button',{name:'Open HIDI menu',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
      await page.getByRole('button',{name:'Search HIDI products',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
     }
     if(path==='/collections/all'){
      await page.locator('main article').first().waitFor();await page.locator('[data-hidi-collection-hydrated="true"]').waitFor({state:'attached'});assert.equal(await page.locator('.hidi-collection-intro').count(),0);assert.equal(await page.locator('.collection-header h1').textContent(),'All Products');
      productPath=new URL(await page.locator('main article h3 a').first().getAttribute('href'),base).pathname;
      if(baseline){const prior=await fresh(path,false);await prior.locator('main article').first().waitFor();assert.deepEqual(await metadata(page),await metadata(prior));assert.deepEqual(await footer(page),await footer(prior),'Footer changed');const old=await prior.locator('.wordmark').boundingBox();const ratio=shapes[path].logoWidth/old.width;assert(ratio>=.75&&ratio<=.8,'Logo reduction outside20–25%');await prior.close();}
      if(width<=1000){
       const menu=page.getByRole('button',{name:'Open menu',exact:true});await menu.click();const dialog=page.getByRole('dialog',{name:'Mobile navigation'});await dialog.waitFor();
       await page.waitForFunction(()=>{const h=document.querySelector('.site-header').getBoundingClientRect(),d=document.querySelector('#mobile-navigation').getBoundingClientRect();return Math.abs(h.bottom-d.top)<=2;});
       await page.screenshot({path:`${output}/${engine}-${width}-menu.png`});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert(await menu.evaluate(e=>document.activeElement===e),'Menu focus not restored');
      }
      const search=page.getByRole('button',{name:'Search',exact:true});await search.click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
     }
     await page.screenshot({path:`${output}/${engine}-${width}-${path==='/'?'home':'collection'}.png`});await finish(page);
    }
    for(const path of [productPath,'/cart','/checkout']){
     stage=path;page=await fresh(path);shapes[path]=await measure(page,path);
     if(path===productPath){await page.locator('h1').waitFor();assert(await page.locator('script[type="application/ld+json"]').count());}
     else assert.match(await page.locator('meta[name="robots"]').first().getAttribute('content'),/noindex/);
     if(path==='/checkout'){const h=await page.locator('.site-header').boundingBox();assert(Math.abs(h.y)<1);assert(await page.locator('#main-content').evaluate((e,height)=>parseFloat(getComputedStyle(e).paddingTop)>=height-2,h.height),'Checkout content under header');}
     await finish(page);
    }
    results.push({engine,width,passed:true,shapes,mobileMenu:width<=1000,search:true,footerPreserved:Boolean(baseline)});await writeFile(output+'/progress.json',JSON.stringify({results,errors,gatewayRetries,writes},null,2));console.log(`PASS compact header ${engine} ${width}`);
   }catch(e){if(page&&!page.isClosed()){await page.screenshot({path:`${output}/${engine}-${width}-failure.png`}).catch(()=>{});await writeFile(`${output}/${engine}-${width}-failure.html`,await page.content()).catch(()=>{});}await writeFile(output+'/failure.json',JSON.stringify({error:String(e),stage,engine,width,errors,writes,gatewayRetries},null,2));throw e;}
   finally{await context.close();}
  }}finally{await browser.close();}
 }
 const existingPrivateErrors=errors.filter(e=>proof.issues.some(i=>i.path===e.stage&&i.message===e.message)),newRuntimeErrors=errors.filter(e=>!existingPrivateErrors.includes(e));
 await writeFile(output+'/runtime-errors.json',JSON.stringify({errors,writes},null,2));assert.deepEqual(newRuntimeErrors,[]);assert.deepEqual(writes,[]);
 const report={passed:true,engines,results,baselineCompared:Boolean(baseline),baselinePrivateProofVerified:true,newRuntimeErrors,existingPrivateErrors,gatewayRetries,liveWrites:0};await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await probe(process.argv[2],process.argv[3]);
