import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const base=process.env.HIDI_LIVE_BASE||'https://hidiindia.com',approved=process.argv.includes('--approved'),overlay=process.argv.includes('--overlay'),out=process.env.HIDI_TERMS_EVIDENCE||'evidence/offer-terms/live';
await mkdir(out,{recursive:true});
const copy=JSON.parse(await readFile(new URL('./approved.json',import.meta.url),'utf8'));
const fixture={entries:Object.entries(copy).map(([code,v])=>({code,...v,endsAt:null}))};
const disclosures=overlay?fixture:await(await fetch(base+'/api/hidi/offers/details?placement=landing')).json();
const checkout=overlay?fixture:await(await fetch(base+'/api/hidi/offers/details?placement=checkout')).json();
const policy=await(await fetch(base+'/api/hidi/offers/checkout-policy')).json();
assert(policy.welcomeEnabled&&policy.dressEnabled);assert.equal(policy.eligibleProductIds.length,11);assert.equal(checkout.entries.length,2);
if(approved||overlay){assert.equal(disclosures.entries.length,2);for(const entries of [disclosures.entries,checkout.entries])for(const o of entries){assert.equal(o.title,copy[o.code].title);assert.equal(o.terms,copy[o.code].terms);}}
const script=overlay?await readFile(new URL('./client.js',import.meta.url),'utf8'):null;
const css=overlay?await readFile(new URL('./style.css',import.meta.url),'utf8'):null;
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),browser=await pw.chromium.launch({headless:true}),results=[],blockedRequests=[];
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(45000);
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(!['GET','HEAD'].includes(req.method())){blockedRequests.push({method:req.method(),origin:u.origin,path:u.pathname});return route.abort();}
   // Browser-local candidate substitutions only; never sent to the live server.
   if(overlay&&u.origin===base){
    if(req.resourceType()==='document'&&u.pathname==='/'){const r=await route.fetch();return route.fulfill({response:r,body:(await r.text()).replace('</head>','<style>'+css+'</style></head>')});}
    if(u.pathname==='/api/hidi/offers/details')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)});
    if(u.pathname==='/offers-assets/storefront.js')return route.fulfill({status:200,contentType:'text/javascript',body:script});
    if(u.pathname==='/offers-assets/offers.css'){const r=await route.fetch();return route.fulfill({response:r,body:await r.text()+'\n'+css});}
   }
   return route.continue();
  });
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-offer-terms]').first().waitFor();
  assert.equal(await page.locator('[data-offer-terms]').count(),disclosures.entries.length);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.hidi-promotion-grid')).display==='grid');
  const cards=await page.locator('.hidi-promotion-card').evaluateAll(nodes=>nodes.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,font:getComputedStyle(e.querySelector('h2')).fontSize};}));
  assert.equal(cards[0].font,width<=700?'25px':'28px');
  if(cards.length===2)assert(width<=700?cards[1].y>cards[0].y:cards[1].x>cards[0].x);
  for(const o of disclosures.entries){
   await page.getByRole('button',{name:o.code+' terms and conditions',exact:true}).click();
   const modal=page.locator('.hidi-promotion-dialog[open]');await modal.waitFor();
   assert((await modal.innerText()).includes(o.terms.split('\n')[0]));
   await page.getByRole('button',{name:'Got it',exact:true}).click();await modal.waitFor({state:'detached'});
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // React may replace a node during hero hydration. Reacquire the visible strip
  // and capture the viewport rather than binding a screenshot to that node.
  await page.locator('[data-hidi-offer-strip]').scrollIntoViewIfNeeded();
  await page.locator('[data-offer-terms]').first().waitFor();
  await page.screenshot({path:out+'/'+width+'-offers.png'});
  await page.waitForFunction(count=>document.querySelectorAll('[data-offer-terms]').length===count,disclosures.entries.length);
  assert.equal(await page.locator('[data-offer-terms]').count(),disclosures.entries.length);
  results.push({width,terms:true,noOverflow:true});await page.close();
 }
}finally{await browser.close();}
const telemetry=new Set([base+'/api/hidi/performance','https://www.google-analytics.com/g/collect','https://www.google.com/g/collect','https://cloudflareinsights.com/cdn-cgi/rum']);
assert.deepEqual(blockedRequests.filter(r=>!telemetry.has(r.origin+r.path)),[],'Unexpected attempted mutation');
await writeFile(out+'/report.json',JSON.stringify({passed:true,approved,overlay,productionWrites:0,blockedRequests,results},null,2));
console.log('Live offer disclosures passed');
