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
   const p=await c.newPage(),resources=[],localErrors=[];p.on('pageerror',e=>{const item={engine,width,message:e.message};errors.push(item);localErrors.push(item);});
   p.on('response',r=>{if(r.status()>=400)resources.push({url:r.url(),status:r.status()});});
   p.on('requestfailed',r=>{if(['script','document'].includes(r.resourceType()))resources.push({url:r.url(),failure:r.failure()});});
   try{
    await p.goto(base+path,{waitUntil:'domcontentloaded'});
    const summary=p.getByRole('region',{name:'Product quality and fit summary'});
    await summary.getByText('Included pieces',{exact:true}).waitFor();
    assert((await summary.innerText()).includes('2-Piece Set Kurta Set with Straight-Fit Pants, Embroidered Kurta and Matching Pants'));
    await p.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true',null,{timeout:60000});
    assert(!((await summary.innerText()).includes('not specified')),'Client hydration must not restore contradiction');
    const medium=p.getByRole('button',{name:'M',exact:true});await medium.click();assert.equal(await medium.getAttribute('aria-pressed'),'true');
    const normalizeText=value=>value.replace(/\s+/g,' ').trim();
    const before=normalizeText(await summary.innerText());
    await p.screenshot({path:`${output}/${engine}-${width}-included-pieces.png`,fullPage:false});
    // Navigate through the real collection and its product link to test RSC/client assets.
    await p.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});await p.locator('main article').first().waitFor();
    const productLink=p.locator('main article h3 a[href="'+path+'"]').first();
    await productLink.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
    await productLink.click({position:{x:8,y:8}});
    await p.waitForURL('**'+path,{waitUntil:'domcontentloaded'});await summary.getByText('Included pieces',{exact:true}).waitFor();
    await p.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true',null,{timeout:60000});
    assert.equal(normalizeText(await summary.innerText()),before);
    for(const [slug,statement] of [
     ['navy-blue-embroidered-kurta-set-with-dupatta','Embroidered Kurta Set with Bottom and Dupatta'],
     ['hidi-060-purple-embroidered-kurta-set-with-dupatta','Kurta Set With Bottom And Dupatta']
    ]){
     await p.goto(base+'/products/'+slug,{waitUntil:'domcontentloaded'});
     await p.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true',null,{timeout:60000});
     await summary.getByText('Included pieces',{exact:true}).waitFor();assert((await summary.innerText()).includes(statement));
    }
    await p.goto(base+'/products/women-s-black-embroidered-kurta-set-with-dupatta',{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true',null,{timeout:60000});
    assert.match(normalizeText(await summary.innerText()),/(?:Included pieces|Set contents) are not specified/,'Incomplete set descriptions must remain unresolved');
    assert.equal(await summary.getByText('Included pieces',{exact:true}).count(),0);
    results.push({engine,width,serverContents:true,hydratedContents:true,nativeProductNavigation:true,namedComponents:true,bulletLabel:true,unknownContentsPreserved:true,passed:true});
   }catch(error){
    const stem=`${output}/${engine}-${width}-failure`;
    await writeFile(stem+'.json',JSON.stringify({error:String(error),url:p.url(),localErrors,resources,shell:await p.locator('[data-hidi-react-pdp]').count(),scripts:await p.locator('script[src]').evaluateAll(ns=>ns.map(n=>n.getAttribute('src')))},null,2));
    await writeFile(stem+'.html',await p.content());await p.screenshot({path:stem+'.png'}).catch(()=>{});throw error;
   }finally{await c.close();}
  }}finally{await browser.close();}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 const combined={passed:true,navigationImagesIsolated:true,engines:['chromium','firefox','webkit'],results,liveWrites:0,baselineCompared:Boolean(options.baseline),productFactsPassed:true,productFactResults:results,productErrors:errors,imageDiscovery:images,scope:'Published-image indexing and focused product-summary hydration, size selection and native navigation; unrelated files preserved by exact-image verification'};
 await mkdir(output,{recursive:true});await writeFile(output+'/report.json',JSON.stringify(combined,null,2));return combined;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await probe(process.argv[2],process.argv[3]);

