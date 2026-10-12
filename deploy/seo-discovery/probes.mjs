import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';
import publishedImages from './published-product-images.json' with {type:'json'};

const expectedTitles = {
  '/':'HIDI India | Women’s Indian Wear and Kurta Sets',
  '/collections/all':'Women’s Kurta Sets & Indian Wear | HIDI India',
  '/collections/work-wear':'Work Wear Kurta Sets for Women | HIDI India',
  '/collections/casual-wear':'Casual Wear Kurta Sets for Women | HIDI India',
  '/collections/occasional-wear':'Occasion Wear Kurta Sets for Women | HIDI India',
  '/collections/ananyas-pick':'Ananya’s Pick: Women’s Indian Wear | HIDI India',
  '/about':'About HIDI | HIDI',
  '/shipping':'Shipping Policy | HIDI',
  '/returns':'Returns & Exchanges | HIDI',
  '/contact':'Contact & Help | HIDI',
  '/offers':'HIDI Privileges | HIDI',
};
async function assertSearchMetadata(page,path,rawHtml) {
  if (!expectedTitles[path]) return;
  await page.waitForFunction(title=>document.title===title,expectedTitles[path]);
  try {
    await page.waitForFunction(()=>document.head.querySelectorAll('title').length===1 && document.head.querySelectorAll('meta[name="description"]').length===1,null,{timeout:5000});
  } catch(error) {
    console.error('SEO_HEAD_DIAGNOSTIC',JSON.stringify({path,...await page.evaluate(()=>({title:document.title,descriptions:Array.from(document.head.querySelectorAll('meta[name="description"]')).map(n=>n.outerHTML)}))}));
    throw error;
  }
  const fields=await page.evaluate(()=>({title:document.title,
    descriptions:Array.from(document.head.querySelectorAll('meta[name="description"]')).map(n=>n.content),
    socialTitles:Array.from(document.head.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]')).map(n=>n.content),
    socialDescriptions:Array.from(document.head.querySelectorAll('meta[property="og:description"],meta[name="twitter:description"]')).map(n=>n.content),
    titleCount:document.head.querySelectorAll('title').length}));
  assert.equal(fields.title,expectedTitles[path],path+' title survives rendering');
  assert.equal(fields.titleCount,1,'One title owner');
  assert.equal(fields.descriptions.length,1,'One description owner');
  assert(fields.descriptions[0].length>100,'Descriptive existing-page summary');
  assert(fields.socialTitles.length>0 && fields.socialDescriptions.length>0,'Social metadata is present');
  for(const title of fields.socialTitles)assert.equal(title,fields.title,'Search and social titles agree');
  for(const description of fields.socialDescriptions)assert.equal(description,fields.descriptions[0],'Search and social descriptions agree');
  if(rawHtml) {
    const raw=await page.evaluate(html=>{
      const doc=new DOMParser().parseFromString(html,'text/html');
      return {title:doc.title,description:doc.head.querySelector('meta[name="description"]')?.content};
    },rawHtml);
    assert.equal(raw.title,fields.title,'Raw HTML and hydrated title agree');
    assert.equal(raw.description,fields.descriptions[0],'Raw HTML and hydrated description agree');
  }
  return fields;
}

export async function probe(base, output) {
  const seoHeaders={'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'};
  const robots=await fetch(base+'/robots.txt',{headers:seoHeaders});
  assert.equal(robots.status,200);
  const policy=await robots.text();
  assert(policy.includes('Sitemap: https://hidiindia.com/sitemap.xml'));
  assert(!/^Disallow: \/$/m.test(policy),'Public host must be crawlable');
  const sitemap=await fetch(base+'/sitemap.xml',{headers:seoHeaders});
  assert.equal(sitemap.status,200,'Conventional sitemap endpoint must work');
  const xml=await sitemap.text();
  assert(xml.includes('/products/'),'Sitemap includes the read-only public catalogue');
  assert(!xml.includes('thehidi.com')&&!xml.includes('/cart'));
  if(base.startsWith('https://hidiindia.com')) {
    for(const path of [publishedImages[0],publishedImages[Math.floor(publishedImages.length/2)],publishedImages.at(-1),'/brand/hidi-logo-header.svg']) {
      const res=await fetch(base+path,{method:'HEAD',headers:seoHeaders});
      assert.equal(res.status,200,'Published product image remains accessible');
      assert(res.headers.get('content-type')?.startsWith('image/'),'Existing image MIME type is preserved');
      assert(!res.headers.get('x-robots-tag')?.includes('noindex'),'Published image is eligible for image search');
    }
  }
  const preview=await fetch(base+'/robots.txt',{headers:{'x-forwarded-host':'thidigk.thehidi.com'}});
  assert((await preview.text()).includes('Disallow: /'),'Preview remains restricted');
  const pw = await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output, {recursive:true});
  const engines = ['chromium','firefox','webkit'], results = [], writes = [];
  let product = '/products/white-printed-sleeveless-kurti-with-palazzo-set';
  for (const engine of engines) {
    const browser = await pw[engine].launch({headless:true,
      ...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try {
      const sizes = [[390,844],[1440,900],...(engine==='webkit'?[[320,568],[620,844],[621,844],[568,320],[844,390],[768,1024]]:[])];
      for (const [width,height] of sizes) {
        const context = await browser.newContext({viewport:{width,height},hasTouch:width<1000,
          isMobile:engine==='webkit'&&width<1000,reducedMotion:'reduce',extraHTTPHeaders:{'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}});
        await context.route('**/*',async route=>{
          const req=route.request(),url=new URL(req.url());
          if(!['GET','HEAD'].includes(req.method())) {
            if(!isBlockedTelemetry(req.method(),req.url(),base))writes.push({method:req.method(),path:url.pathname});
            return route.abort();
          }
          if(req.resourceType()==='media'||/google-analytics|googletagmanager|facebook\.net/.test(url.hostname))return route.abort();
          return route.continue();
        });
        const page=await context.newPage();page.setDefaultTimeout(45000);
        const headErrors=[];
        page.on('pageerror',error=>{if(/NotFoundError|removeChild|HierarchyRequestError|Rendered fewer hooks/i.test(String(error)))headErrors.push(String(error));});
        const checks=[];
        try {
          const pages=width===390||width===1440?['home','catalogue','product','bag','checkout']:['catalogue','product'];
          for(const key of pages) {
            const path={home:'/',catalogue:'/collections/all',product,bag:'/cart',checkout:'/checkout'}[key];
            assert((await page.goto(base+path,{waitUntil:'domcontentloaded'})).ok());
            const footer=page.locator('footer.site-footer, footer.footer').first();await footer.waitFor();
            if(key==='catalogue') {
              const link=page.locator('main article h3 a').first();await link.waitFor();
              product=await link.getAttribute('href');assert(product.startsWith('/products/'));
            }
            if(key==='product'&&width<=620)await page.locator('[class*="add-to-cart_mobileBar__"]').waitFor({state:'visible'});
            const expectedPrivate=['bag','checkout'].includes(key);
            const headerResponse=await fetch(base+path,{method:'HEAD',headers:seoHeaders});
            assert.equal(headerResponse.status,200);
            assert.equal(headerResponse.headers.get('x-robots-tag')?.includes('noindex')??false,expectedPrivate,'HEAD and GET indexing policies agree');
            const seo=await page.evaluate(()=>({canonical:document.querySelector('link[rel=canonical]')?.href,robots:document.querySelector('meta[name=robots]')?.content}));
            assert.equal(seo.canonical,'https://hidiindia.com'+path,'Canonical must match the current route after hydration');
            assert.equal(seo.robots?.includes('noindex'),expectedPrivate,'Public pages index; utility pages retain noindex');
            if(!expectedPrivate) {
              const rawResponse=await fetch(base+path,{headers:seoHeaders});
              assert.equal(rawResponse.status,200);
              assert(!rawResponse.headers.get('x-robots-tag')?.includes('noindex'),'Public HTTP response is indexable');
              const rawHtml=await rawResponse.text();
              await assertSearchMetadata(page,path,rawHtml);
              for(const match of rawHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))assert(!/https?:\/\/(?:thehidi\.com|thidigk\.thehidi\.com|localhost(?::\d+)?)[/]/.test(match[1]),'Initial HTML structured-data identities use the production origin');
              const graphs=await page.locator('script[type="application/ld+json"]').allTextContents();
              for(const graph of graphs)assert(!/https?:\/\/(?:thehidi\.com|thidigk\.thehidi\.com|localhost(?::\d+)?)[/]/.test(graph),'Structured-data identities use the production origin');
            }
            await page.evaluate(async()=>{
              await document.fonts.ready;
              document.documentElement.style.scrollBehavior='auto';
              scrollTo(0,document.documentElement.scrollHeight);
            });
            await page.waitForTimeout(300);
            await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
            await page.waitForFunction(()=>Math.abs(document.documentElement.scrollHeight-innerHeight-scrollY)<2);
            const measurement=await page.evaluate(()=>{
              const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
              const footer=document.querySelector('footer.site-footer,footer.footer');
              const bar=document.querySelector('[class*="add-to-cart_mobileBar__"]');
              const visibleBar=bar&&getComputedStyle(bar).display!=='none'?bar:null;
              const links=Array.from(footer.querySelectorAll('.footer-bottom a')).map(e=>{
                const r=rect(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                return {text:e.textContent.trim(),href:e.getAttribute('href'),rect:r,
                  tappable:hit===e||e.contains(hit),cover:hit?.className};
              });
              return {footer:rect(footer),bar:visibleBar?rect(visibleBar):null,links,
                padding:getComputedStyle(footer).paddingBottom,
                pageHasPurchaseBar:!!bar,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
            });
            assert(measurement.documentWidth<=measurement.viewportWidth+1,'No horizontal overflow');
            if(key==='product'&&width<=620) {
              assert(measurement.bar,'Mobile purchase bar must still be visible');
              assert.equal(measurement.links.length,4,'All four bottom policy/support links remain');
              for(const link of measurement.links) {
                assert(link.rect.bottom<=measurement.bar.y-8,link.text+' must clear the purchase bar');
                assert(link.tappable,link.text+' must be tappable');
              }
              assert(parseFloat(measurement.padding)>=126,'Footer reserves space for purchase bar and safe area');
            } else if(key==='product') {
              assert.equal(measurement.bar,null,'Desktop/tablet purchase layout remains unchanged');
              assert.equal(parseFloat(measurement.padding),0,'Desktop footer receives no extra clearance');
            } else {
              assert.equal(measurement.pageHasPurchaseBar,false,'Clearance selector applies only to products');
            }
            await page.screenshot({path:`${output}/${engine}-${width}-${height}-${key}.png`});
            checks.push({page:key,path,passed:true,...measurement});
          }
          if(width===390||width===1440) {
            for(const path of ['/collections/work-wear','/collections/casual-wear','/collections/occasional-wear','/collections/ananyas-pick','/about','/shipping','/returns','/contact','/offers']) {
              assert((await page.goto(base+path,{waitUntil:'domcontentloaded'})).ok());
              await page.locator('footer').first().waitFor({state:'attached'});
              const raw=await fetch(base+path,{headers:seoHeaders});assert.equal(raw.status,200);
              await assertSearchMetadata(page,path,await raw.text());
              checks.push({page:'collection-search-metadata',path,passed:true});
            }
            await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});
            await assertSearchMetadata(page,'/collections/all');
            const nextProduct=page.locator('main article h3 a').first();await nextProduct.waitFor();
            const nextPath=await nextProduct.getAttribute('href');
            await nextProduct.click();await page.waitForURL('**'+nextPath);
            await page.waitForTimeout(500);
            const navigationSeo=await page.evaluate(()=>({canonical:document.querySelector('link[rel=canonical]')?.href,robots:document.querySelector('meta[name=robots]')?.content}));
            assert.equal(navigationSeo.canonical,'https://hidiindia.com'+nextPath,'Canonical survives client navigation');
            assert(!navigationSeo.robots?.includes('noindex'),'Public product remains indexable after client navigation');
            const productIdentity=await page.evaluate(()=>{
              const values=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap(n=>{
                try {const v=JSON.parse(n.textContent);return Array.isArray(v)?v:(v['@graph']||[v]);}catch{return [];}
              });
              const product=values.find(v=>v['@type']==='Product');
              return {title:document.title,name:product?.name,description:product?.description};
            });
            assert(productIdentity.name,'Destination product schema remains present');
            assert.equal(productIdentity.title,productIdentity.name+' | HIDI','Product title belongs to the destination, not the prior collection');
            checks.push({page:'client-navigation',path:nextPath,passed:true,...navigationSeo});
            await page.goBack({waitUntil:'domcontentloaded'});
            await assertSearchMetadata(page,'/collections/all');
            await page.goForward({waitUntil:'domcontentloaded'});
            if(base.startsWith('http://127.0.0.1')) {
              // Reproduce the slow live-router case where cached product head
              // nodes still contain the preceding collection's metadata.
              await page.evaluate(()=>{document.title='Previous collection';document.head.querySelector('meta[name="description"]').content='Previous collection description';});
            }
            await page.waitForFunction(name=>document.title===name+' | HIDI',productIdentity.name);
            const restoredDescription=await page.locator('meta[name="description"]').getAttribute('content');
            assert.equal(restoredDescription,productIdentity.description,'Product description survives cached forward navigation');
            await page.goto(base+'/',{waitUntil:'domcontentloaded'});
            await page.locator('footer').first().waitFor();
            await assertSearchMetadata(page,'/');
            await page.reload({waitUntil:'domcontentloaded'});
            await page.locator('footer').first().waitFor();
            await assertSearchMetadata(page,'/');
            checks.push({page:'back-forward-reload-metadata',passed:true});
          }
          assert.deepEqual(headErrors,[],'Metadata reconciliation must not break framework DOM ownership');
          results.push({engine,width,height,passed:true,checks});
          console.log(`PASS: ${engine} ${width}x${height}: footer links clear the purchase bar; other layouts preserved`);
        } catch(error) {
          await page.screenshot({path:`${output}/${engine}-${width}-${height}-failure.png`}).catch(()=>{});
          await writeFile(`${output}/${engine}-${width}-${height}-failure.txt`,page.url()+'\n'+await page.locator('body').innerText());
          throw error;
        } finally {await context.close();}
      }
    } finally {await browser.close();}
  }
  assert.deepEqual(writes,[],'No commerce writes permitted');
  const missing=await fetch(base+'/products/hidi-seo-missing-8f29017',{method:'HEAD',headers:seoHeaders});
  assert.equal(missing.status,404,'Missing product status remains accurate');
  const report={passed:true,engines,results,liveWrites:0,footerLinksAccessible:true};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));
  return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await probe(process.argv[2],process.argv[3]);
