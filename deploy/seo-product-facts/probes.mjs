import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
import {imageProbe} from './image-probe.mjs';
export async function probe(base,output,options={}){
 await mkdir(output,{recursive:true});
 const images=await imageProbe(base,output+'/image-discovery.json');
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),results=[],errors=[],writes=[];
 const headers={'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'};
 const path='/products/cream-floral-embroidered-kurta-pant-set';
 const raw=await (await fetch(base+path,{headers})).text();
 assert(raw.includes('Included pieces</dt>'),'Explicit contents must be server-rendered');
 assert(!raw.includes('Included pieces are not specified for this style yet. Photography alone does not confirm the contents.</p>'),'Server text contradicts catalogue description');
 for(const engine of ['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
  try{for(const width of [320,390,1440]){
   const c=await browser.newContext({viewport:{width,height:900},extraHTTPHeaders:headers,reducedMotion:'reduce'});
   await c.route('**/*',r=>{const req=r.request(),u=new URL(req.url());if(/google-analytics|googletagmanager|cloudflareinsights|facebook\.net/.test(u.hostname)||u.pathname==='/hidi-analytics.js')return r.abort();if(!['GET','HEAD'].includes(req.method())){if(u.pathname!=='/api/admin/session'&&!isBlockedTelemetry(req.method(),req.url(),base))writes.push(req.url());return r.abort();}if(['image','media'].includes(req.resourceType()))return r.abort();return r.continue();});
   let p;const resources=[],localErrors=[],observed=new Map();
   const fresh=async stage=>{
    const page=await c.newPage(),pending=new Set();
    const handler=e=>{const item={engine,width,stage,message:e.message};errors.push(item);localErrors.push(item);};
    page.on('pageerror',handler);
    page.on('response',r=>{if(r.status()>=400)resources.push({stage,url:r.url(),status:r.status()});});
    page.on('requestfailed',r=>{if(['script','document'].includes(r.resourceType()))resources.push({stage,url:r.url(),failure:r.failure()});});
    page.on('request',r=>{const u=new URL(r.url());if(r.method()==='GET'&&u.origin===new URL(base).origin&&(u.pathname.startsWith('/api/store/')||u.pathname==='/api/hidi/offers'||u.pathname==='/api/admin/session'))pending.add(r);});
    for(const event of ['requestfinished','requestfailed'])page.on(event,r=>pending.delete(r));
    observed.set(page,{handler,pending});return page;
   };
   const finish=async page=>{
    const {handler,pending}=observed.get(page);let quiet=0;
    for(let elapsed=0;elapsed<45000;elapsed+=50){await new Promise(done=>setTimeout(done,50));quiet=pending.size?0:quiet+50;if(quiet>=500)break;}
    assert.equal(pending.size,0,'Application reads did not settle: '+[...pending].map(r=>r.url()).join(', '));
    // Separate completed cases use separate documents. Speculative Next RSC
    // streams may be canceled at teardown, outside the observed interaction.
    page.off('pageerror',handler);await page.close();
   };
   const summary=()=>p.getByRole('region',{name:'Product quality and fit summary'});
   try{
    p=await fresh('direct counted set');
    await p.goto(base+path,{waitUntil:'domcontentloaded'});
    await summary().getByText('Included pieces',{exact:true}).waitFor();
    assert((await summary().innerText()).includes('2-Piece Set Kurta Set with Straight-Fit Pants, Embroidered Kurta and Matching Pants'));
    await p.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true',null,{timeout:60000});
    assert(!((await summary().innerText()).includes('not specified')),'Client hydration must not restore contradiction');
    const medium=p.locator('.pdp-info .sizes').getByRole('button',{name:'M',exact:true});await medium.click();assert.equal(await medium.getAttribute('aria-pressed'),'true');
    const normalizeText=value=>value.replace(/\s+/g,' ').trim();
    const before=normalizeText(await summary().innerText());
    await summary().evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
    await summary().screenshot({path:`${output}/${engine}-${width}-included-pieces.png`});
    await finish(p);
    // Navigate through the real collection and its product link to test RSC/client assets.
    p=await fresh('native collection-to-product navigation');
    await p.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});await p.locator('main article').first().waitFor();
    await p.waitForFunction(()=>document.querySelector('.collection-page')?.dataset.hidiCollectionHydrated==='true',null,{timeout:60000});
    const productLink=p.locator('main article h3 a[href="'+path+'"]').first();
    // The inline title can be wider than its ellipsis-clipped card in WebKit.
    // Click the visible heading box so the real pointer lands on its link.
    const visibleTitle=productLink.locator('..');
    await visibleTitle.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
    await visibleTitle.click();
    await p.waitForURL('**'+path,{waitUntil:'domcontentloaded'});await summary().getByText('Included pieces',{exact:true}).waitFor();
    await p.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true',null,{timeout:60000});
    assert.equal(normalizeText(await summary().innerText()),before);
    await finish(p);
    for(const [slug,statement] of [
     ['navy-blue-embroidered-kurta-set-with-dupatta','Embroidered Kurta Set with Bottom and Dupatta'],
     ['hidi-060-purple-embroidered-kurta-set-with-dupatta','Kurta Set With Bottom And Dupatta']
    ]){
     p=await fresh(slug);
     await p.goto(base+'/products/'+slug,{waitUntil:'domcontentloaded'});
     await p.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true',null,{timeout:60000});
     await summary().getByText('Included pieces',{exact:true}).waitFor();assert((await summary().innerText()).includes(statement));
     await finish(p);
    }
    p=await fresh('unknown set contents');
    await p.goto(base+'/products/women-s-black-embroidered-kurta-set-with-dupatta',{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true',null,{timeout:60000});
    assert.match(normalizeText(await summary().innerText()),/(?:Included pieces|Set contents) are not specified/,'Incomplete set descriptions must remain unresolved');
    assert.equal(await summary().getByText('Included pieces',{exact:true}).count(),0);
    await finish(p);
    results.push({engine,width,serverContents:true,hydratedContents:true,nativeProductNavigation:true,namedComponents:true,bulletLabel:true,unknownContentsPreserved:true,passed:true});
    await writeFile(output+'/progress.json',JSON.stringify({results,errors,writes},null,2));
    console.log('PDP_FACT_CASE',JSON.stringify(results.at(-1)));
   }catch(error){
    const stem=`${output}/${engine}-${width}-failure`;
    const details={error:String(error),url:p?.url(),localErrors,resources};
    if(p&&!p.isClosed()){details.shell=await p.locator('[data-hidi-react-pdp]').count();details.scripts=await p.locator('script[src]').evaluateAll(ns=>ns.map(n=>n.getAttribute('src')));await writeFile(stem+'.html',await p.content());await p.screenshot({path:stem+'.png'}).catch(()=>{});}
    await writeFile(stem+'.json',JSON.stringify(details,null,2));throw error;
   }finally{for(const [page,{handler}] of observed)page.off('pageerror',handler);await c.close();}
  }}finally{await browser.close();}
 }
 await writeFile(output+'/runtime-checks.json',JSON.stringify({results,errors,writes},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 const combined={passed:true,navigationImagesIsolated:true,engines:['chromium','firefox','webkit'],results,liveWrites:0,baselineCompared:Boolean(options.baseline),productFactsPassed:true,productFactResults:results,productErrors:errors,imageDiscovery:images,scope:'Published-image indexing and focused product-summary hydration, size selection and native navigation; unrelated files preserved by exact-image verification'};
 await mkdir(output,{recursive:true});await writeFile(output+'/report.json',JSON.stringify(combined,null,2));return combined;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await probe(process.argv[2],process.argv[3]);

