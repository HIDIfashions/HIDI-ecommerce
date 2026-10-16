import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadProducts,buildFeed} from './feed.mjs';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';

export async function probe(base,out,{products,preview=false}={}) {
  await mkdir(out,{recursive:true});
  products ||= await loadProducts(base+'/api/store/products');
  const expected=buildFeed(products), results=[],errors=[],writes=[];
  const headers=preview?{'X-Forwarded-Host':'hidiindia.com','X-Forwarded-Proto':'https'}:{};
  const r=await fetch(base+'/google-products.xml',{headers});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/xml/);
  const text=await r.text();assert.equal(text,expected.xml,'Feed differs from frozen live catalogue');
  await writeFile(out+'/google-products.xml',text);
  const imageChecks=[];
  for(const url of [...new Set([...text.matchAll(/<g:image_link>(.*?)<\/g:image_link>/g)].map(m=>m[1].replaceAll('&amp;','&')))]) {
    let image;
    for(let attempt=0;attempt<3;attempt++) {
      image=await fetch(base+new URL(url).pathname+new URL(url).search,{headers,signal:AbortSignal.timeout(90000)});
      if(image.status!==503||attempt===2)break;
      await image.arrayBuffer();await new Promise(done=>setTimeout(done,5000));
    }
    assert.equal(image.status,200,'Feed image unavailable '+url);assert.match(image.headers.get('content-type'),/^image\//);assert(!String(image.headers.get('x-robots-tag')).includes('noindex'),'Image blocked from indexing '+url);
    assert((await image.arrayBuffer()).byteLength>1000);imageChecks.push(url);
  }
  const head=await fetch(base+'/google-products.xml',{method:'HEAD',headers});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(Number(head.headers.get('content-length')),Buffer.byteLength(text));
  const pw=await import(process.env.HIDI_PLAYWRIGHT_MODULE);
  // Include the price-changing size, a second size and a second product.
  const mixed=products.find(p=>new Set(p.variants.map(v=>v.pricePaise)).size>1)||products[0];
  const included=new Set([...expected.xml.matchAll(/<g:id>(.*?)<\/g:id>/g)].map(m=>m[1]));
  const offers=[...mixed.variants.filter(v=>included.has(v.id)).slice(0,1).map(v=>({p:mixed,v})),
    ...mixed.variants.filter(v=>included.has(v.id)).slice(-1).map(v=>({p:mixed,v})),
    {p:products[0],v:products[0].variants.find(v=>v.available>0)}];
  for (const engine of ['chromium','firefox','webkit']) {
    const browser=await pw[engine].launch({headless:true});
    try {for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},extraHTTPHeaders:headers});
      await context.route('**/*',route=>{
        const q=route.request(),url=new URL(q.url());
        if(q.resourceType()==='script'&&/(googletagmanager|google-analytics|cloudflareinsights)/.test(url.hostname))return route.fulfill({status:200,contentType:'application/javascript',body:''});
        if(!['GET','HEAD'].includes(q.method())) {
          if(!isBlockedTelemetry(q.method(),q.url(),base)&&!/(google-analytics|analytics.google|cloudflareinsights)/.test(url.hostname)&&url.pathname!='/api/admin/session')writes.push({method:q.method(),path:url.pathname});
          return route.abort();
        }
        if(q.resourceType()==='media')return route.abort();
        return route.continue();
      });
      for(const {p,v} of offers) {
        const page=await context.newPage();page.on('pageerror',e=>errors.push({engine,width,message:e.message}));
        await page.goto(base+'/products/'+p.slug+'?variant='+v.id,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(sku=>document.querySelector('[data-pdp-summary]')?.textContent.includes(sku),v.sku,{timeout:45000});
        const summary=await page.locator('[data-pdp-summary]').innerText();
        assert(summary.includes(v.color)&&summary.includes(v.size));
        const shown=(await page.locator('[data-pdp-summary] .pdp-price').innerText()).match(/₹\s*([\d,]+(?:\.\d{1,2})?)/);
        assert(shown&&Number(shown[1].replaceAll(',',''))===v.pricePaise/100,'Selected price mismatch '+summary);
        assert.equal(await page.locator('link[rel="canonical"]').first().getAttribute('href'),'https://hidiindia.com/products/'+p.slug);
        assert.equal(await page.getByRole('button',{name:v.size,exact:true}).getAttribute('aria-pressed'),'true');
        const others=p.variants.filter(o=>o.available>0&&o.color===v.color&&o.id!==v.id);
        if(others.length){await page.getByRole('button',{name:others[0].size,exact:true}).click();await page.waitForFunction(sku=>document.querySelector('[data-pdp-summary]')?.textContent.includes(sku),others[0].sku);}
        results.push({engine,width,slug:p.slug,variant:v.id,passed:true});
        if(results.length===1||results.length===18)await page.screenshot({path:out+'/'+engine+'-'+width+'.png',fullPage:true});
        await page.close();
      }
      // Feed integration must leave ordinary collection navigation intact.
      const page=await context.newPage();await page.goto(base+'/collections/work-wear',{waitUntil:'domcontentloaded'});assert.match(await page.locator('h1').innerText(),/Work Wear/);await page.close();
      await context.close();
    }} finally {await browser.close();}
  }
  assert.deepEqual(writes,[],'Unexpected commerce mutation');assert.deepEqual(errors,[],'Browser runtime errors');
  const report={passed:true,...expected.audit,results,imageChecks,engines:['chromium','firefox','webkit'],liveWrites:writes.length,runtimeErrors:errors.length,preview};
  await writeFile(out+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await probe(process.argv[2],process.argv[3]);
