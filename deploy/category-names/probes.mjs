import assert from 'node:assert/strict';
import {checkCollection,checkProductDetails} from '../../tests/clean-shopping-checks.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {navigate} from '../collection-cleanup/navigation.mjs';
const copy=JSON.parse(await readFile(new URL('../search-priority/copy.json',import.meta.url),'utf8'));
const categoryNames=JSON.parse(await readFile(new URL('./names.json',import.meta.url),'utf8'));
const headers={'X-Forwarded-Host':'hidiindia.com','X-Forwarded-Proto':'https'};
const routes=['/','/collections/all','/collections/work-wear','/collections/casual-wear','/collections/occasional-wear','/collections/ananyas-pick','/about','/guides','/guides/kurta-set-buying-guide','/guides/choosing-kurta-set-size','/shipping','/returns','/cart','/checkout','/account','/admin'];
export async function probe(base,output,{baseline,fixtures={},fixtureAssets={},inventory}={}){
 await mkdir(output,{recursive:true});const engines=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
 const results=[],writes=[],errors=[],baselineErrors=[],gatewayRetries=[];let blockedSessionCalls=0;
 const raw=async(origin,path)=>{const r=await fetch(origin+path,{headers,signal:AbortSignal.timeout(45000)});assert(r.ok,path+' status '+r.status);return r.text();};
 if(!baseline){
   const before=JSON.parse(await readFile('evidence/category-names/product-groups.json','utf8'));
   for(const [slug,ids] of Object.entries(before)){
     const rows=JSON.parse(await raw(base,'/api/store/products'+(slug==='all'?'':'?category='+slug)));
     assert.deepEqual(rows.map(p=>p.id).sort(),ids,'Product membership changed for '+slug);
     for(const product of rows){
       for(const ref of [product.category,...(product.collections||[])].filter(Boolean)){
         const group=categoryNames.find(g=>[g.slug,...g.aliases].includes(ref.slug));
         if(group)assert.equal(ref.name,group.name,'API category label '+ref.slug);
       }
     }
   }
 }
 const home=await raw(base,'/');assert(home.includes(copy.heading)&&home.includes(copy.intro));assert(home.includes('data-hidi-first-image="true"'),'Preserve image before JS');
 const admin=await raw(base,'/admin');assert(/<meta(?=[^>]*name=["']robots)(?=[^>]*content=["'][^"']*noindex)[^>]*>/i.test(admin),'Admin entry must remain noindex');
 const all=await raw(base,'/collections/all');const decoded=all.replaceAll('&amp;','&');assert(decoded.includes('Shop All')&&!decoded.includes('Discover HIDI kurta sets')&&decoded.includes(copy.collectionTitle));
 for(const path of ['/robots.txt','/sitemap.xml','/google-products.xml']){const content=await raw(base,path);if(baseline&&path!='/google-products.xml')assert.equal(content,await raw(baseline,path),path+' changed');}
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
    if(req.method()==='GET'&&url.pathname==='/api/admin/session')return route.fulfill({status:401,contentType:'application/json',body:'{"message":"Admin access required"}'});
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
    page.on('request',r=>{if(['fetch','xhr'].includes(r.resourceType())&&['GET','HEAD'].includes(r.method())&&new URL(r.url()).pathname.startsWith('/api/'))pending.add(r);});
    for(const event of ['requestfinished','requestfailed'])page.on(event,r=>pending.delete(r));
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())pending.clear();});
    const handler=e=>(prior?baselineErrors:errors).push({engine,width,path,message:e.message});errorHandlers.set(page,handler);page.on('pageerror',handler);
    await navigate(page,origin+(path==='/admin'?'/admin/sign-in':path),gatewayRetries);return page;
   };
   const close=async page=>{
    const pending=pendingReads.get(page);let quiet=0;
    for(let elapsed=0;elapsed<45000&&quiet<500;elapsed+=50){await page.waitForTimeout(50);quiet=pending.size?0:quiet+50;}
    assert.equal(pending.size,0,'Background API reads did not settle before teardown: '+[...pending].map(r=>new URL(r.url()).pathname).join(', '));
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
       await page.getByRole('button',{name:'Open HIDI menu',exact:true}).click();
       const menu=page.locator('.campaign-panel-nav');await menu.waitFor();
       for(const group of categoryNames){assert.equal(await menu.locator('a[href="/collections/'+group.slug+'"]').textContent().then(s=>s.trim()),group.name);}
       await page.screenshot({path:`${output}/${engine}-${width}-category-menu.png`});await page.keyboard.press('Escape');
       await page.locator('.hidi-collection-card').first().waitFor();
       assert.equal(await page.locator('.hidi-collection-card').count(),5);
       for(const group of categoryNames)assert(await page.locator('.hidi-collection-card').filter({hasText:group.name}).count()>0,'Missing carousel name '+group.name);
       const discovery=page.locator('[data-hidi-home-discovery]');await discovery.waitFor();assert.equal(await discovery.count(),1);
       assert.equal((await discovery.locator('p').first().innerText()).trim(),copy.intro);
       await page.getByRole('heading',{name:copy.heading,exact:true}).waitFor();
       await page.waitForFunction(()=>{const i=document.querySelector('.hero img.hero-live-media');return i?.complete&&i.naturalWidth>0&&getComputedStyle(i).visibility==='visible';});
       assert.equal(await page.locator('h1').count(),1);await discovery.scrollIntoViewIfNeeded();
       assert(await page.evaluate(async()=>{await document.fonts.ready;const sample=()=>JSON.stringify([document.documentElement.scrollWidth,document.querySelector('.site-header')?.getBoundingClientRect().height,document.querySelector('[data-hidi-home-discovery]')?.getBoundingClientRect().height]);const first=sample();for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,100));if(sample()!==first)return false;}return true;}),'Homepage layout did not settle');
       await page.screenshot({path:`${output}/${engine}-${width}-home-copy.png`});
       await discovery.getByRole('link',{name:copy.cta,exact:true}).click();await page.waitForURL('**/collections/all');await page.locator('main article').first().waitFor();
       continue;
      }
      if(path.startsWith('/collections/')){
       await page.locator('main article').first().waitFor();await settledCatalogue(page);const actual=await facts(page);assert(actual.length>0);
       if(path==='/collections/all'){
        await page.getByRole('heading',{level:1,name:'Shop All',exact:true}).waitFor();
        await checkCollection(page);assert.equal(await page.title(),copy.collectionTitle);
        await page.screenshot({path:`${output}/${engine}-${width}-collection.png`});
       }
       if(inventory){const slug=path.split('/').at(-1);assert.deepEqual(actual.map(x=>x.path).sort(),inventory[slug].map(p=>'/products/'+p.slug).sort());}
       if(baseline){const prior=await open(baseline,path,true);await prior.locator('main article').first().waitFor();await settledCatalogue(prior);assert.deepEqual(actual,await facts(prior),'Product content or prices changed');await close(prior);}
       if(width>=700)await page.getByLabel('Sort products').selectOption({label:'Price: Low to high'});
       else{const trigger=page.getByRole('button',{name:/Filter.*Sort/i}),dialog=page.getByRole('dialog',{name:'Product filters'});for(let attempt=0;attempt<5&&!await dialog.isVisible();attempt++){if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();try{await dialog.waitFor({state:'visible',timeout:3000});}catch(error){if(attempt===4)throw error;}}await dialog.getByRole('radio',{name:'Price: Low to high',exact:true}).check();await dialog.getByRole('button',{name:'Close filters'}).click();}
       await settledCatalogue(page);assert.deepEqual(await facts(page),actual,'Sorting changed product set');
       if(path==='/collections/all'){
        const product=page.locator('main article h3 a').first(),name=await product.innerText();await product.click({position:{x:8,y:8}});await page.waitForURL('**/products/**');await page.getByRole('heading',{level:1,name,exact:true}).waitFor();assert(await page.locator('script[type="application/ld+json"]').count()>0);
        await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor();await checkProductDetails(page);await page.screenshot({path:`${output}/${engine}-${width}-product.png`});
       }
      }
      if(path==='/about'||path.startsWith('/guides')){
       const links=page.locator('main a[href="/collections/all"]');assert(await links.count()>0);
       if(path==='/about')await page.getByRole('link',{name:copy.cta,exact:true}).waitFor();
      }
      const privatePage=['/cart','/checkout','/account','/admin'].includes(path);
      if(privatePage){
       if(path==='/admin')await page.waitForURL('**/admin/sign-in**');
       assert.match(await page.locator('meta[name="robots"]').first().getAttribute('content'),/noindex/);
       if(baseline){const prior=await open(baseline,path,true);if(path==='/admin')await prior.waitForURL('**/admin/sign-in**');await prior.waitForTimeout(800);await close(prior);}
      }else{
       assert(!/noindex/.test(await page.locator('meta[name="robots"]').first().getAttribute('content')));
       const canonical=await page.locator('link[rel="canonical"]').first().getAttribute('href');assert.equal(canonical,'https://hidiindia.com'+new URL(page.url()).pathname);
       assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow '+path);
      }
     }catch(error){await page.screenshot({path:`${output}/${engine}-${width}-failure.png`}).catch(()=>{});await writeFile(output+'/failure.html',await page.content()).catch(()=>{});throw error;}finally{await close(page);}
    }
    results.push({engine,width,routes:routes.length,initialAndRenderedCopy:true,homeLayoutStable:true,adminEntryNoindex:true,signedOutAdminPage:'/admin/sign-in',sorting:true,productDetails:true,privateNoindex:true,status:'PASS'});
    await writeFile(output+'/progress.json',JSON.stringify({results,errors,baselineErrors,writes},null,2));console.log('PASS branded search regression',engine,width);
   }catch(error){await writeFile(output+'/failure.json',JSON.stringify({engine,width,message:String(error),errors,baselineErrors,writes},null,2));throw error;}
   finally{await context.close();}
  }}finally{await browser.close();}
 }
 const priorErrors=baseline?baselineErrors:JSON.parse(await readFile('evidence/category-names/candidate/report.json','utf8')).baselineErrors;
 const normalized=message=>message.replace(/(?:https?:\/)?\/(?:127\.0\.0\.1:\d+|hidiindia\.com)(?=\/api\/)/g,'/<origin>');
 const existing=errors.filter(e=>((['/cart','/checkout'].includes(e.path)&&/Minified React error #418/.test(e.message))||(e.path==='/admin'&&/\/api\/admin\/session due to access control checks\.$/.test(e.message)))&&priorErrors.some(b=>b.path===e.path&&b.engine===e.engine&&normalized(b.message)===normalized(e.message)));
 // A single deferred resize notification is a browser layout warning.
 // Repetition or unstable measured layout still fails; all other errors stay fatal.
 const browserWarnings=errors.filter(e=>e.path==='/'&&e.message==='ResizeObserver loop completed with undelivered notifications.');
 for(const warning of browserWarnings)assert.equal(browserWarnings.filter(e=>e.engine===warning.engine&&e.width===warning.width).length,1,'Repeated ResizeObserver loop');
 const newErrors=errors.filter(e=>!existing.includes(e)&&!browserWarnings.includes(e));assert.deepEqual(newErrors,[]);assert.deepEqual(writes,[]);
 const report={passed:true,engines:['chromium','firefox','webkit'],results,baselineCompared:!!baseline,baselineErrors,liveWrites:0,blockedSessionCalls,existingPrivateErrors:existing,browserWarnings,newRuntimeErrors:newErrors,gatewayRetries};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await probe(process.argv[2],process.argv[3]);
