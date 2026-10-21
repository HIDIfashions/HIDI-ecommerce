import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';
import publishedImages from './published-product-images.json' with {type:'json'};
const verifiedBrandProfiles=['https://www.instagram.com/hidiindia/','https://www.facebook.com/profile.php?id=61594615364935','https://x.com/Hidiindia','https://www.youtube.com/@Hidiindia'];
const brandDescription='HIDI is an Indian women’s wear brand offering kurta sets for work, everyday dressing and occasions.';
import { productImageUrls } from './sitemap.mjs';

const crawlerDocumentTimeoutMs = 30000;
const crawlerDocumentLimit = 4 * 1024 * 1024;
export const crawlerDocument = (base, path, {timeoutMs = crawlerDocumentTimeoutMs, limit = crawlerDocumentLimit} = {}) => new Promise((resolveDocument, rejectDocument) => {
  const target = new URL(path, base);
  const started = Date.now();
  const requestDocument = target.protocol === 'https:' ? httpsRequest : httpRequest;
  let settled = false;
  const elapsed = () => Date.now() - started;
  const fail = (phase, error) => {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    rejectDocument(new Error(`Crawler document ${path} ${phase} after ${elapsed()}ms: ${error.message}`));
  };
  const req = requestDocument({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    method: 'GET',
    path: target.pathname + target.search,
    agent: false,
    headers: {
      host: 'hidiindia.com',
      'x-forwarded-host': 'hidiindia.com',
      'x-forwarded-proto': 'https',
      accept: 'text/html,application/xhtml+xml',
      'accept-encoding': 'identity',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'HIDI-SEO-Crawler-Document/1.0',
      connection: 'close',
    },
  }, response => {
    const chunks = [];
    let size = 0;
    const declared = Number(response.headers['content-length'] || 0);
    if (declared > limit) {
      const error = new Error(`declared body exceeds ${limit} bytes`);
      fail('rejected', error); response.destroy(error); return;
    }
    response.on('data', chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) {
        const error = new Error(`body exceeds ${limit} bytes`);
        fail('rejected', error); response.destroy(error); req.destroy(error); return;
      }
      chunks.push(bytes);
    });
    response.once('aborted', () => fail('aborted', new Error('response ended before the end event')));
    response.once('error', error => fail('response failed', error));
    response.once('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) headers.append(name, item);
      }
      const durationMs = elapsed();
      console.log(`CRAWLER_DOCUMENT ${path} ${response.statusCode} ${size}B ${durationMs}ms`);
      resolveDocument({ status: response.statusCode, headers, text: Buffer.concat(chunks).toString('utf8'), durationMs });
    });
  });
  const deadline = setTimeout(() => {
    const error = new Error(`request exceeded ${timeoutMs}ms`);
    fail('timed out', error); req.destroy(error);
  }, timeoutMs);
  req.setTimeout(timeoutMs, () => {
    const error = new Error(`socket was inactive for ${timeoutMs}ms`);
    fail('socket timed out', error); req.destroy(error);
  });
  req.once('error', error => fail('request failed', error));
  req.end();
});

const expectedTitles = {
  '/':'HIDI India | Women’s Indian Wear and Kurta Sets',
  '/collections/all':'Women’s Kurta Sets & Indian Wear | HIDI India',
  '/collections/work-wear':'Work Wear Kurta Sets for Women | HIDI India',
  '/collections/casual-wear':'Casual Wear Kurta Sets for Women | HIDI India',
  '/collections/occasional-wear':'Occasion Wear Kurta Sets for Women | HIDI India',
  '/collections/ananyas-pick':'Ananya’s Pick: Women’s Indian Wear | HIDI India',
  '/about':'About HIDI & Ananya Nagalla | HIDI India',
  '/shipping':'Shipping Policy | HIDI',
  '/returns':'Returns & Exchanges | HIDI',
  '/contact':'Contact & Help | HIDI',
  '/offers':'HIDI Privileges | HIDI',
};
async function assertCrawlerDirectives(page, privatePage = false, rawHtml) {
  await page.waitForFunction(expected=>{
    const nodes=[...document.querySelectorAll('meta[name="robots"],meta[name="googlebot"]')];
    return nodes.some(node=>node.name==='robots') && nodes.every(node=>
      /\bnoindex\b/i.test(node.content)===expected && (expected || !/\bnofollow\b/i.test(node.content)));
  },privatePage,{timeout:5000});
  const rendered = await page.evaluate(() => [...document.querySelectorAll('meta[name="robots"],meta[name="googlebot"]')]
    .map(node => ({name:node.name,content:node.content})));
  assert(rendered.some(node=>node.name==='robots'),'General indexing directive remains present');
  for(const node of rendered) {
    assert.equal(/\bnoindex\b/i.test(node.content),privatePage,node.name+' rendered directive matches page eligibility');
    if(!privatePage)assert(!/\bnofollow\b/i.test(node.content),node.name+' public links are crawlable');
  }
  if(rawHtml) {
    const raw=await page.evaluate(html=>[...new DOMParser().parseFromString(html,'text/html').querySelectorAll('meta[name="robots"],meta[name="googlebot"]')]
      .map(node=>({name:node.name,content:node.content})),rawHtml);
    assert(raw.some(node=>node.name==='robots'),'Raw general indexing directive remains present');
    for(const node of raw) {
      assert.equal(/\bnoindex\b/i.test(node.content),privatePage,node.name+' initial HTML directive matches page eligibility');
      if(!privatePage)assert(!/\bnofollow\b/i.test(node.content),node.name+' raw public links are crawlable');
    }
  }
}
async function assertSearchMetadata(page,path,rawHtml) {
  if (!expectedTitles[path]) return;
  if (path === '/' || path === '/about') await assertBrandIdentity(page,rawHtml);
  await page.waitForFunction(title=>document.title===title,expectedTitles[path]);
  try {
    await page.waitForFunction(()=>{
      const titles=[...document.head.querySelectorAll('title')],descriptions=[...document.head.querySelectorAll('meta[name="description"]')];
      return titles.length>0 && descriptions.length>0 && titles.every(n=>n.textContent===document.title) && descriptions.every(n=>n.content===descriptions[0].content);
    },null,{timeout:5000});
  } catch(error) {
    console.error('SEO_HEAD_DIAGNOSTIC',JSON.stringify({path,...await page.evaluate(()=>({title:document.title,descriptions:Array.from(document.head.querySelectorAll('meta[name="description"]')).map(n=>n.outerHTML)}))}));
    throw error;
  }
  const fields=await page.evaluate(()=>({title:document.title,
    descriptions:Array.from(document.head.querySelectorAll('meta[name="description"]')).map(n=>n.content),
    socialTitles:Array.from(document.head.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]')).map(n=>n.content),
    socialDescriptions:Array.from(document.head.querySelectorAll('meta[property="og:description"],meta[name="twitter:description"]')).map(n=>n.content),
    titles:Array.from(document.head.querySelectorAll('title')).map(n=>n.textContent)}));
  assert.equal(fields.title,expectedTitles[path],path+' title survives rendering');
  assert(fields.titles.length>0 && fields.titles.every(value=>value===fields.title),'One route definition reconciles all framework-owned titles');
  assert(fields.descriptions.length>0 && fields.descriptions.every(value=>value===fields.descriptions[0]),'All framework-owned descriptions agree');
  assert(fields.descriptions[0].length>100,'Descriptive existing-page summary');
  assert(fields.socialTitles.length>0 && fields.socialDescriptions.length>0,'Social metadata is present');
  for(const title of fields.socialTitles)assert.equal(title,fields.title,'Search and social titles agree');
  for(const description of fields.socialDescriptions)assert.equal(description,fields.descriptions[0],'Search and social descriptions agree');
  await assertCrawlerDirectives(page,false,rawHtml);
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
async function assertBrandIdentity(page,rawHtml) {
  await page.waitForFunction(({profiles,description})=>{
    const values=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap(node=>{
      try {const value=JSON.parse(node.textContent);return Array.isArray(value)?value:(value['@graph']||[value]);}catch{return [];}
    });
    const brand=values.filter(value=>value.name==='HIDI' && value.url==='https://hidiindia.com/');
    return brand.some(value=>value['@type']==='Organization') && brand.some(value=>value['@type']==='WebSite') &&
      brand.filter(value=>value['@type']==='Organization').every(value=>value.logo==='https://hidiindia.com/brand/hidi-logo-header.svg' && profiles.every(profile=>[value.sameAs].flat().includes(profile)) && [value.alternateName].flat().includes('HIDI India') && value.description===description) &&
      brand.filter(value=>value['@type']==='WebSite').every(value=>[value.alternateName].flat().includes('HIDI India'));
  },{profiles:verifiedBrandProfiles,description:brandDescription},{timeout:5000});
  if (rawHtml) {
    const values=[...rawHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match=>{
      const value=JSON.parse(match[1]);return Array.isArray(value)?value:(value['@graph']||[value]);
    }).filter(value=>value.name==='HIDI' && value.url==='https://hidiindia.com/');
    assert(values.some(value=>value['@type']==='Organization'),'Raw HIDI organization remains present');
    assert(values.some(value=>value['@type']==='WebSite'),'Raw HIDI website remains present');
    for(const value of values) {
      if(value['@type']==='Organization') {
        assert.equal(value.logo,'https://hidiindia.com/brand/hidi-logo-header.svg','Raw brand logo is consistent');
        for(const profile of verifiedBrandProfiles)assert([value.sameAs].flat().includes(profile),'Raw verified official brand profile remains associated');
        assert([value.alternateName].flat().includes('HIDI India'),'Raw organization alias remains present');
        assert.equal(value.description,brandDescription,'Raw organization description remains factual and consistent');
      }
      if(value['@type']==='WebSite')assert([value.alternateName].flat().includes('HIDI India'),'Raw alternate brand name remains present');
    }
  }
}

export async function probe(base, output) {
  const seoHeaders={'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'};
  const aliasLive=base.startsWith('https://hidiindia.com');
  const alias=await fetch((aliasLive?'https://www.hidiindia.com':base)+'/collections/all?source=canonical-check',{
    redirect:'manual',headers:aliasLive?{}:{'x-forwarded-host':'www.hidiindia.com','x-forwarded-proto':'https'}
  });
  assert.equal(alias.status,308,'Public www host must permanently redirect to the canonical apex');
  assert.equal(alias.headers.get('location'),'https://hidiindia.com/collections/all?source=canonical-check','Canonical redirect preserves path and query');
  if(!aliasLive) {
    for(const path of ['/api/store/products','/v1/products','/admin','/account','/cart','/checkout','/order-confirmed','/wishlist','/search','/review/example']) {
      const retained=await fetch(base+path,{method:'HEAD',redirect:'manual',headers:{'x-forwarded-host':'www.hidiindia.com','x-forwarded-proto':'https'}});
      assert.notEqual(retained.status,308,'API and private shopping routes must stay on their current origin: '+path);
      assert.notEqual(retained.headers.get('location'),'https://hidiindia.com'+path,'Private route must not lose origin-scoped state: '+path);
    }
  }
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
  assert(xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'),'Google image sitemap namespace is present');
  assert.equal((xml.match(/https:\/\/hidiindia\.com\/privacy<\/loc>/g)||[]).length,1,'Published privacy policy appears exactly once');
  assert(!xml.includes('/lookbook'),'Unready Lookbook is not in the sitemap');
  const catalogueResponse=await fetch(base+'/api/store/products',{headers:seoHeaders});
  assert.equal(catalogueResponse.status,200);
  const catalogue=await catalogueResponse.json();
  const entries=[...xml.matchAll(/<url><loc>(.*?)<\/loc>(.*?)<\/url>/gs)];
  const actual=new Map(entries.map(([,url,body])=>[url,[...body.matchAll(/<image:loc>(.*?)<\/image:loc>/g)].map(m=>m[1])]));
  let imageAssociations=0;
  for(const product of catalogue) {
    if(product.status&&product.status!=='ACTIVE')continue;
    const expected=productImageUrls(product),url='https://hidiindia.com/products/'+product.slug;
    assert.deepEqual(actual.get(url),expected,'Sitemap photos match the current published product: '+product.slug);
    imageAssociations+=expected.length;
  }
  assert(imageAssociations>0,'Published photos are discoverable without customer interaction');
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
          // Synthetic verification must not emit the newly installed external beacon.
          // Keep the independent deny-and-record policy for every commerce mutation.
          if(url.hostname==='static.cloudflareinsights.com')return route.abort();
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
            if(key==='home') {
              const offer=page.locator('body > aside[data-hidi-price-announcement="true"][aria-label="HIDI price offer"]');
              await offer.waitFor({state:'visible'});
              assert.equal(await offer.count(),1,'Hydrated homepage must contain one exact price announcement');
              assert.equal((await offer.textContent()).trim(),'15% off across HIDI · Prices already reduced · No code needed','Retained offer text must stay exact');
            }
            if(key==='catalogue') {
              const link=page.locator('main article h3 a').first();await link.waitFor();
              product=await link.getAttribute('href');assert(product.startsWith('/products/'));
            }
            if(key==='product'&&width<=620)await page.locator('[aria-label="Mobile purchase actions"]').waitFor({state:'visible'});
            const expectedPrivate=['bag','checkout'].includes(key);
            const headerResponse=await fetch(base+path,{method:'HEAD',headers:seoHeaders,signal:AbortSignal.timeout(30000)});
            assert.equal(headerResponse.status,200);
            assert.equal(headerResponse.headers.get('x-robots-tag')?.includes('noindex')??false,expectedPrivate,'HEAD and GET indexing policies agree');
            const seo=await page.evaluate(()=>({canonical:document.querySelector('link[rel=canonical]')?.href,robots:document.querySelector('meta[name=robots]')?.content}));
            assert.equal(seo.canonical,'https://hidiindia.com'+path,'Canonical must match the current route after hydration');
            assert.equal(seo.robots?.includes('noindex'),expectedPrivate,'Public pages index; utility pages retain noindex');
            await assertCrawlerDirectives(page,expectedPrivate);
            if(!expectedPrivate) {
              const rawResponse=await crawlerDocument(base,path);
              assert.equal(rawResponse.status,200);
              assert(!rawResponse.headers.get('x-robots-tag')?.includes('noindex'),'Public HTTP response is indexable');
              assert.match(rawResponse.headers.get('content-type')||'',/^text\/html\b/i,'Public crawler response is HTML');
              const rawHtml=rawResponse.text;
              await assertSearchMetadata(page,path,rawHtml);
              for(const match of rawHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))assert(!/https?:\/\/(?:thehidi\.com|thidigk\.thehidi\.com|localhost(?::\d+)?)[/]/.test(match[1]),'Initial HTML structured-data identities use the production origin');
              const graphs=await page.locator('script[type="application/ld+json"]').allTextContents();
              for(const graph of graphs)assert(!/https?:\/\/(?:thehidi\.com|thidigk\.thehidi\.com|localhost(?::\d+)?)[/]/.test(graph),'Structured-data identities use the production origin');
            }
            await page.waitForFunction(()=>document.fonts.status==='loaded',{}, {timeout:30000});
            await page.evaluate(()=>{
              document.documentElement.style.scrollBehavior='auto';
              scrollTo(0,document.documentElement.scrollHeight);
            });
            await page.waitForTimeout(300);
            await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
            await page.waitForFunction(()=>Math.abs(document.documentElement.scrollHeight-innerHeight-scrollY)<2);
            const measurement=await page.evaluate(()=>{
              const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
              const footer=document.querySelector('footer.site-footer,footer.footer');
              const bar=document.querySelector('[aria-label="Mobile purchase actions"]');
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
            if(process.env.HIDI_SEO_LOOKBOOK_RETIRED==='1') {
              for(const path of ['/lookbook','/lookbook/'])for(const method of ['GET','HEAD']) {
                const res=await fetch(base+path,{method,headers:seoHeaders,redirect:'manual'});
                assert.equal(res.status,301,'Approved retired editorial route remains redirected');
                assert.equal(res.headers.get('location'),'/collections/all','Retired route keeps its exact destination');
                assert.equal((await res.arrayBuffer()).byteLength,0,'Retired response remains empty');
              }
              checks.push({page:'lookbook-retired',passed:true,status:301,destination:'/collections/all'});
            } else {
            await page.goto(base+'/lookbook',{waitUntil:'domcontentloaded'});
            await page.locator('footer').first().waitFor({state:'attached'});
            await page.waitForFunction(()=>document.head.querySelector('meta[name="robots"]')?.content==='noindex, follow');
            const deferredDirectives=await page.locator('meta[name="robots"],meta[name="googlebot"]').evaluateAll(nodes=>nodes.map(node=>node.content));
            assert(deferredDirectives.every(value=>value==='noindex, follow'),'Both deferred-page directives preserve follow');
            const lookbookTitle=await page.title();assert(!/^404/i.test(lookbookTitle),'Existing editorial page still serves normally');
            for(const method of ['GET','HEAD']){
              const res=await fetch(base+'/lookbook',{method,headers:seoHeaders});
              assert.equal(res.status,200,'Lookbook remains publicly usable');
              assert.equal(res.headers.get('x-robots-tag'),'noindex, follow','GET and HEAD retain consistent deferred indexing');
            }
            checks.push({page:'lookbook-indexing',passed:true,status:200,robots:'noindex, follow'});
            }
            if(base.startsWith('https://hidiindia.com')) {
              for(const method of ['GET','HEAD']){
                const res=method==='GET'?await crawlerDocument(base,'/privacy'):await fetch(base+'/privacy',{method,headers:seoHeaders});assert.equal(res.status,200);
                assert(!res.headers.get('x-robots-tag')?.includes('noindex'),'Published policy remains indexable');
                if(method==='GET'){
                  assert.match(res.headers.get('content-type')||'',/^text\/html\b/i,'Published policy crawler response is HTML');
                  const html=res.text;
                  assert.equal((html.match(/rel="canonical" href="https:\/\/hidiindia\.com\/privacy"/g)||[]).length,1);
                }
              }
              checks.push({page:'published-privacy-canonical',passed:true});
            }
            for(const path of ['/collections/work-wear','/collections/casual-wear','/collections/occasional-wear','/collections/ananyas-pick','/about','/shipping','/returns','/contact','/offers']) {
              assert((await page.goto(base+path,{waitUntil:'domcontentloaded'})).ok());
              await page.locator('footer').first().waitFor({state:'attached'});
              const raw=await crawlerDocument(base,path);assert.equal(raw.status,200);
              assert.match(raw.headers.get('content-type')||'',/^text\/html\b/i,'Public crawler response is HTML');
              await assertSearchMetadata(page,path,raw.text);
              checks.push({page:'collection-search-metadata',path,passed:true});
            }
            await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});
            await assertSearchMetadata(page,'/collections/all');
            const nextProduct=page.locator('main article h3 a').first();await nextProduct.waitFor();
            const nextPath=await nextProduct.getAttribute('href');
            await Promise.all([
              page.waitForURL(url=>url.pathname===nextPath,{waitUntil:'commit'}),
              nextProduct.click({noWaitAfter:true}),
            ]);
            await page.waitForTimeout(500);
            const navigationSeo=await page.evaluate(()=>({canonical:document.querySelector('link[rel=canonical]')?.href,robots:document.querySelector('meta[name=robots]')?.content}));
            assert.equal(navigationSeo.canonical,'https://hidiindia.com'+nextPath,'Canonical survives client navigation');
            assert(!navigationSeo.robots?.includes('noindex'),'Public product remains indexable after client navigation');
            await assertCrawlerDirectives(page,false);
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
            const restoredDescriptions=await page.locator('meta[name="description"]').evaluateAll(nodes=>nodes.map(node=>node.content));
            assert(restoredDescriptions.length>0 && restoredDescriptions.every(value=>value===productIdentity.description),'Every retained product description survives cached forward navigation');
            await assertCrawlerDirectives(page,false);
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
