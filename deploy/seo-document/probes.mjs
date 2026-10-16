import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
import {guideRoutes,returnPolicy} from './discovery.mjs';
import {probe as collectionProbe} from './shopping-probes.mjs';
export async function discoveryProbe(base,output,{baseline}={}){
 await mkdir(output,{recursive:true});
 const headers={'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'};
 const get=async path=>{const r=await fetch(base+path,{headers,signal:AbortSignal.timeout(60000)});assert(r.ok,path+' '+r.status);return r.text();};
 const raw=await get('/');assert.match(raw,/<main[^>]*data-hidi-home-discovery/);assert.match(raw,/<h1[^>]*>HIDI India/);assert.match(raw,/href="\/collections\/work-wear"/);assert(!raw.includes('This React preview requires JavaScript'));
 const robots=await get('/robots.txt');assert.match(robots,/Allow: \/api\/hidi\/hero-asset\//);assert.match(robots,/Disallow: \/api\//);assert.match(robots,/Disallow: \/admin\//);
 const sitemap=await get('/sitemap.xml');for(const path of guideRoutes)assert(sitemap.includes('<loc>https://hidiindia.com'+path+'</loc>'));
 const policy=await get('/returns');assert.match(policy,/data-hidi-approved-return-policy/);assert.match(policy,/merchantReturnDays":7/);assert(!policy.includes('returnLabelSource'));
 const missing=await fetch(base+'/guides/not-a-real-guide',{headers});assert.equal(missing.status,404);
 const feed=await get('/google-products.xml');assert.match(feed,/<g:id>/);
 if(baseline){const r=await fetch(baseline+'/google-products.xml',{headers});assert.equal(feed,await r.text(),'Merchant XML unchanged');}
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
 const results=[],errors=[],writes=[];
 for(const engine of ['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
  try{for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},extraHTTPHeaders:headers,reducedMotion:'reduce'});
   await context.route('**/*',route=>{
    const req=route.request(),u=new URL(req.url());
    if(/google-analytics|googletagmanager|cloudflareinsights|facebook\.net/.test(u.hostname)||u.pathname==='/hidi-analytics.js')return route.abort();
    if(!['GET','HEAD'].includes(req.method())){if(u.pathname!=='/api/admin/session'&&!isBlockedTelemetry(req.url(),req.method(),base))writes.push({url:req.url(),method:req.method()});return route.abort();}
    if(req.resourceType()==='media')return route.abort();
    return route.continue();
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push({engine,width,message:e.message}));
   try{
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('.hidi-collection-link').first().waitFor({timeout:60000});
    assert.equal(await page.locator('[data-hidi-home-discovery]').count(),0,'React replaces the initial fallback');
    const link=page.locator('footer a[href="/guides"]');await link.waitFor();assert.equal(await link.count(),1);
    await page.screenshot({path:`${output}/${engine}-${width}-home.png`});
    await link.click();await page.waitForURL('**/guides');assert.equal(await page.locator('h1').count(),1);
    for(const path of guideRoutes){
     if(path!=='/guides')await page.goto(base+path,{waitUntil:'domcontentloaded'});
     assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://hidiindia.com'+path);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Guide overflow');
     await page.screenshot({path:`${output}/${engine}-${width}-${path.split('/').at(-1)}.png`,fullPage:true});
    }
    await page.goto(base+'/returns',{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();
    const graph=JSON.parse(await page.locator('script[data-hidi-approved-return-policy]').textContent());assert.deepEqual(graph.hasMerchantReturnPolicy,returnPolicy);
    results.push({engine,width,homeFallbackReplaced:true,guideNavigation:true,guideCount:3,returnPolicy:true,passed:true});
   }finally{await context.close();}
  }}finally{await browser.close();}
 }
 const nojs=await pw.chromium.launch({headless:true});
 try{
  const c=await nojs.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},extraHTTPHeaders:headers});
  // This case tests native navigation with JavaScript disabled. Actual media
  // layout is already captured in the nine regular browser cases above.
  await c.route('**/*',r=>['image','media'].includes(r.request().resourceType())?r.abort():r.continue());
  const p=await c.newPage();await p.goto(base+'/',{waitUntil:'domcontentloaded'});
  await p.locator('[data-hidi-home-discovery]').waitFor();
  await p.getByRole('link',{name:'All kurta sets',exact:true}).click();
  await p.waitForURL('**/collections/all',{waitUntil:'domcontentloaded'});
  assert.equal((await p.locator('h1').innerText()).trim(),'All Products');
  assert(await p.locator('main article').count()>0,'Collection products remain in initial HTML');
  await p.screenshot({path:output+'/no-javascript-collection.png'});await c.close();
 }finally{await nojs.close();}
 assert.deepEqual(errors,[],'Browser runtime errors');assert.deepEqual(writes,[],'Commerce writes');
 const report={passed:true,results,errors,liveWrites:0,initialHtmlVerified:true,jsDisabledNavigation:true,merchantFeedPreserved:Boolean(baseline)};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log('PASS: discovery HTML, guides, return schema and nine browser scenarios');return report;
}
export async function probe(base,output,options={}){
 const discovery=await discoveryProbe(base,output+'/discovery',options);
 const shopping=await collectionProbe(base,output+'/shopping',options);
 const report={passed:true,engines:shopping.engines,results:shopping.results,discoveryResults:discovery.results,liveWrites:0,baselineCompared:Boolean(options.baseline),discoveryPassed:true,shoppingPassed:true};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await probe(process.argv[2],process.argv[3]);
