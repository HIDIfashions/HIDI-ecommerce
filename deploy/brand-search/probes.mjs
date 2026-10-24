import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';

const title='HIDI India Official Store | Women’s Kurta Sets';
const headers={'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'};
const flatten=value=>Array.isArray(value)?value.flatMap(flatten):value?.['@graph']?flatten(value['@graph']):[value];
function checkGraph(graph){
 const site=graph.find(n=>n?.['@type']==='WebSite'),org=graph.find(n=>n?.['@type']==='Organization');
 assert.equal(site?.name,'HIDI India');assert(site.alternateName.includes('HIDI'));assert(site.alternateName.includes('hidiindia.com'));
 assert.equal(org?.telephone,'+917093709353');assert.equal(org.email,'Contact@hidiindia.com');assert.equal(org.address.addressCountry,'IN');assert.equal(org.contactPoint.url,'https://hidiindia.com/contact');
 assert.equal(org.url,'https://hidiindia.com/');assert.equal(org.sameAs.length,4);
}
export async function probe(base,output,{baseline}={}){
 await mkdir(output,{recursive:true});
 const get=async(path,origin=base)=>{const r=await fetch(origin+path,{headers,signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,path);return r.text();};
 for(const path of ['/','/about']){
  const raw=await get(path);
  await writeFile(output+'/raw-'+(path==='/'?'home':'about')+'.html',raw);
  checkGraph([...raw.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(m=>flatten(JSON.parse(m[1]))));
  assert(raw.includes('property="og:site_name" content="HIDI India"'),path+' raw site-name tag: '+raw.match(/<meta[^>]*og:site_name[^>]*>/g));
  assert(!/name="(?:robots|googlebot)" content="[^"]*noindex/.test(raw));
  assert(raw.includes('href="https://hidiindia.com'+(path==='/'?'/':path)+'"'));
  if(path==='/')assert(raw.includes('<title>'+title+'</title>'));
 }
 const contact=await get('/contact');assert(contact.includes('Contact HIDI India | Official Store Support'));assert(contact.includes('70937'));
 for(const path of ['/robots.txt','/sitemap.xml','/google-products.xml']){
  const raw=await get(path);if(baseline)assert.equal(raw,await get(path,baseline),path+' must remain unchanged');
 }
 const playwright=await import(pathToFileURL(resolve(process.env.HIDI_PLAYWRIGHT_MODULE)).href);
 const results=[],writes=[];
 for(const engine of ['chromium','firefox','webkit']){
  const browser=await playwright[engine].launch({headless:true});
  try {for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport,extraHTTPHeaders:headers});
   await context.route('**/*',route=>{
    const r=route.request();
    if(isBlockedTelemetry(r.url())||r.resourceType()==='media')return route.abort();
    if(!['GET','HEAD','OPTIONS'].includes(r.method())){writes.push(r.method()+' '+new URL(r.url()).pathname);return route.fulfill({status:403,body:'Read-only SEO verification'});}
    return route.continue();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   for(const path of ['/','/about','/contact']){
    await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__hidiSeoIdentityGuard===true);
    await page.locator('[data-hidi-price-announcement]').waitFor({state:'visible'});
    if(path==='/')await page.waitForFunction(expected=>document.title===expected,title);
    const state=await page.evaluate(()=>({title:document.title,site:document.querySelector('meta[property="og:site_name"]')?.content,canonical:document.querySelector('link[rel="canonical"]')?.href,graph:[...document.querySelectorAll('script[type="application/ld+json"]')].map(n=>JSON.parse(n.textContent)),text:document.body.innerText}));
    assert.equal(state.site,'HIDI India');assert.equal(state.canonical,'https://hidiindia.com'+path);
    if(path!=='/contact')checkGraph(state.graph.flatMap(flatten));
    assert(state.text.includes('HIDI'));
    if(path==='/')await page.screenshot({path:output+'/'+engine+'-'+viewport.width+'.png',animations:'disabled'});
    if(baseline){const prior=await context.newPage();await prior.goto(baseline+path,{waitUntil:'domcontentloaded',timeout:60000});await prior.waitForFunction(()=>window.__hidiSeoIdentityGuard===true);await prior.locator('[data-hidi-price-announcement]').waitFor({state:'visible'});const clean=s=>s.replace(/\s+/g,' ').trim();
     // About and contact are server rendered: compare visible copy independently.
     if(path!=='/')assert.equal(clean(await prior.locator('body').innerText()),clean(state.text),'Visible '+path+' copy changed');
     await prior.close();}
   }
   assert.deepEqual(errors,[],'Browser script error');
   results.push({engine,width:viewport.width,passed:true});await context.close();
  }} finally {await browser.close();}
 }
 assert.deepEqual(writes,[]);
 await writeFile(output+'/report.json',JSON.stringify({passed:true,engines:['chromium','firefox','webkit'],results,baselineCompared:Boolean(baseline),liveWrites:0},null,2));
 console.log('PASS: official-store metadata, organization details, hydration, redirects and retained public feeds');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await probe(process.argv[2],process.argv[3]);
