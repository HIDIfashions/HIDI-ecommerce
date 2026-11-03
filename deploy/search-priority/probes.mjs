import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {navigate} from '../collection-cleanup/navigation.mjs';
const copy=JSON.parse(await readFile(new URL('./copy.json',import.meta.url),'utf8'));
const headers={'X-Forwarded-Host':'hidiindia.com','X-Forwarded-Proto':'https'};
const routes=['/','/collections/all','/collections/work-wear','/collections/casual-wear','/collections/occasional-wear','/collections/ananyas-pick','/about','/guides','/guides/kurta-set-buying-guide','/guides/choosing-kurta-set-size','/shipping','/returns','/cart','/checkout','/account','/admin'];
export async function probe(base,output,{baseline,fixtures={},fixtureAssets={},inventory}={}){
 await mkdir(output,{recursive:true});const engines=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
 const results=[],writes=[],errors=[],baselineErrors=[],gatewayRetries=[];let blockedSessionCalls=0;
 const raw=async(origin,path)=>{const r=await fetch(origin+path,{headers,signal:AbortSignal.timeout(45000)});assert(r.ok,path+' status '+r.status);return r.text();};
 const home=await raw(base,'/');assert(home.includes(copy.heading)&&home.includes(copy.intro));assert(home.includes('data-hidi-first-image="true"'),'Preserve image before JS');
 const all=await raw(base,'/collections/all');const decoded=all.replaceAll('&amp;','&');assert(decoded.includes(copy.collectionHeading)&&decoded.includes(copy.intro)&&decoded.includes(copy.collectionTitle));
 for(const path of ['/robots.txt','/sitemap.xml','/google-products.xml']){const content=await raw(base,path);if(baseline)assert.equal(content,await raw(baseline,path),path+' changed');}
 for(const engine of ['chromium','firefox','webkit']){
  const browser=await engines[engine].launch({...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
  try{for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',extraHTTPHeaders:headers});context.setDefaultTimeout(25000);
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(!['GET','HEAD'].includes(req.method())){
     if(['PUT','DELETE'].includes(req.method())&&url.pathname==='/api/admin/session'&&!req.postData()){blockedSessionCalls++;return route.fulfill(req.method()==='PUT'?{status:401,body:'{}'}:{status:204});}
     if(url.pathname==='/api/hidi/performance'||/(^|\.)(google-analytics\.com|analytics\.google\.com|cloudflareinsights\.com)$/.test(url.hostname))return route.fulfill({status:204});
     writes.push({path:url.pathname,method:req.method()});return route.abort();
    }
    if(req.resourceType()==='script'&&/(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|cloudflareinsights\.com|connect\.facebook\.net)$/.test(url.hostname))return route.fulfill({status:200,contentType:'application/javascript',body:''});
    if(Object.hasOwn(fixtures,url.pathname))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixtures[url.pathname])});
    if(Object.hasOwn(fixtureAssets,url.pathname))return route.fulfill({status:200,...fixtureAssets[url.pathname]});
    if(url.pathname.startsWith('/api/hidi/hero-asset/'))return route.continue();
    if(req.resourceType()==='media'||/razorpay\.com$/.test(url.hostname))return route.abort();
    if(baseline&&(url.pathname.startsWith('/media/products/')||url.pathname.startsWith('/api/hidi/hero-asset/'))){const r=await route.fetch({url:'https://hidiindia.com'+url.pathname});return route.fulfill({response:r});}
    return route.continue();
   });
   const pendingReads=new WeakMap(),errorHandlers=new WeakMap();
   const open=async(origin,path,prior=false)=>{
    const page=await context.newPage(),pending=new Set();pendingReads.set(page,pending);
    page.on('request',r=>{if(['GET','HEAD'].includes(r.method())&&new URL(r.url()).pathname.startsWith('/api/'))pending.add(r);});
    for(const event of ['requestfinished','requestfailed'])page.on(event,r=>pending.delete(r));
    const handler=e=>(prior?baselineErrors:errors).push({engine,width,path,message:e.message});errorHandlers.set(page,handler);page.on('pageerror',handler);
    await navigate(page,origin+path,gatewayRetries);return page;
   };
   const close=async page=>{
    const pending=pendingReads.get(page);let quiet=0;
    for(let elapsed=0;elapsed<45000&&quiet<500;elapsed+=50){await page.waitForTimeout(50);quiet=pending.size?0:quiet+50;}
    assert.equal(pending.size,0,'Background API reads did not settle before teardown');
    // Observe the complete scenario. Intentional page destruction is outside it.
    page.off('pageerror',errorHandlers.get(page));await page.close();
   };
   const settledCatalogue=async page=>{await page.locator('[data-hidi-collection-hydrated="true"]').waitFor({state:'attached'});await page.waitForFunction(()=>[...document.querySelectorAll('main article s,main article del')].every(mrp=>mrp.parentElement.querySelector('[data-hidi-price-badge]')));};
   const facts=page=>page.locator('main article h3 a').evaluateAll(nodes=>nodes.map(n=>({name:n.textContent,path:new URL(n.href).pathname,card:n.closest('article').textContent})).sort((a,b)=>a.path.localeCompare(b.path)));
   try{
    // No-JavaScript visitors see the same useful content and working links.
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width,height:900},extraHTTPHeaders:headers});
    const early=await nojs.newPage();await navigate(early,base+'/',gatewayRetries);
    await early.getByRole('heading',{name:copy.heading,exact:true}).waitFor();
    assert.equal(await early.locator('h1').count(),1);await early.screenshot({path:`${output}/${engine}-${width}-before-js.png`});await nojs.close();
    for(const path of routes){
     const page=await open(base,path);
     try{
      if(path==='/'){
       await page.locator('.hidi-page .site-header').waitFor();
       const discovery=page.locator('[data-hidi-home-discovery]');await discovery.waitFor();assert.equal(await discovery.count(),1);
       assert.equal((await discovery.locator('p').first().innerText()).trim(),copy.intro);
       await page.getByRole('heading',{name:copy.heading,exact:true}).waitFor();
       await page.waitForFunction(()=>{const i=document.querySelector('.hero img.hero-live-media');return i?.complete&&i.naturalWidth>0&&getComputedStyle(i).visibility==='visible';});
       assert.equal(await page.locator('h1').count(),1);await discovery.scrollIntoViewIfNeeded();
       await page.screenshot({path:`${output}/${engine}-${width}-home-copy.png`});
       await discovery.getByRole('link',{name:copy.cta,exact:true}).click();await page.waitForURL('**/collections/all');await page.locator('main article').first().waitFor();
       continue;
      }
      if(path.startsWith('/collections/')){
       await page.locator('main article').first().waitFor();await settledCatalogue(page);const actual=await facts(page);assert(actual.length>0);
       if(path==='/collections/all'){
        await page.getByRole('heading',{level:1,name:copy.collectionHeading,exact:true}).waitFor();
        await page.getByText(copy.intro,{exact:true}).waitFor();assert.equal(await page.title(),copy.collectionTitle);
        await page.screenshot({path:`${output}/${engine}-${width}-collection.png`});
       }
       if(inventory){const slug=path.split('/').at(-1);assert.deepEqual(actual.map(x=>x.path).sort(),inventory[slug].map(p=>'/products/'+p.slug).sort());}
       if(baseline){const prior=await open(baseline,path,true);await prior.locator('main article').first().waitFor();await settledCatalogue(prior);assert.deepEqual(actual,await facts(prior),'Product content or prices changed');await close(prior);}
       if(width>=700)await page.getByLabel('Sort products').selectOption({label:'Price: Low to high'});
       else{const trigger=page.getByRole('button',{name:/Filter.*Sort/i}),dialog=page.getByRole('dialog',{name:'Product filters'});for(let attempt=0;attempt<5&&!await dialog.isVisible();attempt++){if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();try{await dialog.waitFor({state:'visible',timeout:3000});}catch(error){if(attempt===4)throw error;}}await dialog.getByRole('radio',{name:'Price: Low to high',exact:true}).check();await dialog.getByRole('button',{name:'Close filters'}).click();}
       await settledCatalogue(page);assert.deepEqual(await facts(page),actual,'Sorting changed product set');
       if(path==='/collections/all'){
        const product=page.locator('main article h3 a').first(),name=await product.innerText();await product.click({position:{x:8,y:8}});await page.waitForURL('**/products/**');await page.getByRole('heading',{level:1,name,exact:true}).waitFor();assert(await page.locator('script[type="application/ld+json"]').count()>0);
        await page.screenshot({path:`${output}/${engine}-${width}-product.png`});
       }
      }
      if(path==='/about'||path.startsWith('/guides')){
       const links=page.locator('main a[href="/collections/all"]');assert(await links.count()>0);
       if(path==='/about')await page.getByRole('link',{name:copy.cta,exact:true}).waitFor();
      }
      const privatePage=['/cart','/checkout','/account','/admin'].includes(path);
      if(privatePage){
       assert.match(await page.locator('meta[name="robots"]').first().getAttribute('content'),/noindex/);
       if(baseline){const prior=await open(baseline,path,true);await prior.waitForTimeout(800);await close(prior);}
      }else{
       assert(!/noindex/.test(await page.locator('meta[name="robots"]').first().getAttribute('content')));
       const canonical=await page.locator('link[rel="canonical"]').first().getAttribute('href');assert.equal(canonical,'https://hidiindia.com'+new URL(page.url()).pathname);
       assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow '+path);
      }
     }catch(error){await page.screenshot({path:`${output}/${engine}-${width}-failure.png`}).catch(()=>{});await writeFile(output+'/failure.html',await page.content()).catch(()=>{});throw error;}finally{await close(page);}
    }
    results.push({engine,width,routes:routes.length,initialAndRenderedCopy:true,sorting:true,productDetails:true,privateNoindex:true,status:'PASS'});
    await writeFile(output+'/progress.json',JSON.stringify({results,errors,baselineErrors,writes},null,2));console.log('PASS branded search regression',engine,width);
   }catch(error){await writeFile(output+'/failure.json',JSON.stringify({engine,width,message:String(error),errors,baselineErrors,writes},null,2));throw error;}
   finally{await context.close();}
  }}finally{await browser.close();}
 }
 const priorErrors=baseline?baselineErrors:JSON.parse(await readFile('evidence/search-priority/candidate/report.json','utf8')).baselineErrors;
 const existing=errors.filter(e=>['/cart','/checkout'].includes(e.path)&&/Minified React error #418/.test(e.message)&&priorErrors.some(b=>b.path===e.path&&b.message===e.message));
 const newErrors=errors.filter(e=>!existing.includes(e));assert.deepEqual(newErrors,[]);assert.deepEqual(writes,[]);
 const report={passed:true,engines:['chromium','firefox','webkit'],results,baselineCompared:!!baseline,baselineErrors,liveWrites:0,blockedSessionCalls,existingPrivateErrors:existing,newRuntimeErrors:newErrors,gatewayRetries};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await probe(process.argv[2],process.argv[3]);
