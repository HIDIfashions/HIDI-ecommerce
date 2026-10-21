import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isBlockedTelemetry } from '../button-states/request-policy.mjs';
import publishedImages from './published-product-images.json' with {type:'json'};
const verifiedBrandProfiles=['https://www.instagram.com/hidiindia/','https://www.facebook.com/profile.php?id=61594615364935','https://x.com/Hidiindia','https://www.youtube.com/@Hidiindia'];
const brandDescription='HIDI is an Indian women’s wear brand offering kurta sets for work, everyday dressing and occasions.';
import { productImageUrls } from './sitemap.mjs';
import { priorCollectionTitle, assertPriorCollectionBody } from './collection-body-delta.mjs';

const crawlerDocumentTimeoutMs = 30000;
const crawlerDocumentLimit = 4 * 1024 * 1024;
async function captureScreenshot(page, options) {
  const previous = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
  process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
  try { return await page.screenshot(options); }
  finally {
    if (previous === undefined) delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
    else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = previous;
  }
}
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
export const PRESENTATION_MATRIX=Object.freeze(['chromium','firefox','webkit'].flatMap(engine=>
  [[390,844],[1440,900],...(engine==='webkit'?[[320,568],[620,844],[621,844],[568,320],[844,390],[768,1024]]:[])]
    .map(([width,height])=>Object.freeze({engine,width,height}))));
const presentationPages=width=>width===390||width===1440?['home','catalogue','product','bag','checkout']:['catalogue','product'];
const presentationRoute=(key,product)=>({home:'/',catalogue:'/collections/all',product,bag:'/cart',checkout:'/checkout'}[key]);
const rectangleFields=['x','y','right','bottom','width','height'];

function assertRectanglePreserved(prior,candidate,label) {
  assert.equal(candidate===null,prior===null,label+' presence is preserved');
  if(prior===null)return;
  for(const field of rectangleFields) {
    assert(Number.isFinite(prior[field])&&Number.isFinite(candidate[field]),label+' '+field+' is finite');
    assert(Math.abs(candidate[field]-prior[field])<=1,label+' '+field+' is preserved within one CSS pixel');
  }
}

export function assertCollectionPresentationPreserved(prior,candidate) {
  assert(prior&&candidate,'Independent prior and candidate Shop All presentation evidence is required');
  for(const value of [prior,candidate]) {
    assert.equal(value.headerCount,1,'Shop All retains one collection header');
    assert.equal(value.headingCount,1,'Shop All retains one H1');
    assert.equal(value.heading,priorCollectionTitle,'Shop All H1 retains the current renderer copy');
    assert.equal(value.introCount,0,'Technical SEO must not add a collection intro');
    assert.equal(value.intro,null,'Technical SEO retains the absent collection intro');
    assert.equal(value.breadcrumbLabel,priorCollectionTitle,'Shop All breadcrumb label remains exact');
    assert.equal(value.headerDisplay,'','Technical SEO must not force header visibility');
    assert.equal(value.collectionNavigationCount,0,'No duplicate collection navigation is introduced');
  }
  const geometry=['header','headingBox','introBox','firstProduct'];
  const omitGeometry=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!geometry.includes(key)));
  assert.deepEqual(omitGeometry(candidate),omitGeometry(prior),'Shop All copy, visibility, styling and catalogue counts match the independent baseline');
  for(const key of geometry)assertRectanglePreserved(prior[key],candidate[key],'Shop All '+key);
  return {passed:true,prior,candidate};
}

async function readCollectionPresentation(page) {
  return page.evaluate(()=>{
    const headers=[...document.querySelectorAll('main .collection-header')];
    const headings=[...document.querySelectorAll('main .collection-header h1')];
    const intros=[...document.querySelectorAll('main .hidi-collection-intro')];
    const header=headers[0],heading=headings[0],intro=intros[0],firstProduct=document.querySelector('main article');
    const box=node=>{const value=node?.getBoundingClientRect();return value?{x:value.x,y:value.y,right:value.right,bottom:value.bottom,width:value.width,height:value.height}:null;};
    const style=node=>node?Object.fromEntries(['display','visibility','position','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','marginTop','marginBottom','paddingTop','paddingRight','paddingBottom','paddingLeft'].map(key=>[key,getComputedStyle(node)[key]])):null;
    const visible=node=>!!node&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&box(node).width>0&&box(node).height>0;
    const values=[...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(node=>{try{const value=JSON.parse(node.textContent);return Array.isArray(value)?value:(value['@graph']||[value]);}catch{return [];}});
    const breadcrumb=values.find(value=>value?.['@type']==='BreadcrumbList');
    return {headerCount:headers.length,headingCount:headings.length,introCount:intros.length,
      heading:heading?.textContent?.trim()||null,intro:intro?.textContent?.trim()||null,
      breadcrumbLabel:breadcrumb?.itemListElement?.find(value=>value?.position===2)?.name||null,
      headerVisible:visible(header),headingVisible:visible(heading),introVisible:visible(intro),
      headerDisplay:header?.style.display??null,introDisplay:intro?.style.display??null,
      collectionNavigationCount:document.querySelectorAll('nav[aria-label="Explore HIDI collections"]').length,
      header:box(header),headingBox:box(heading),introBox:box(intro),firstProduct:box(firstProduct),
      styles:{header:style(header),heading:style(heading),intro:style(intro)},
      productArticleCount:document.querySelectorAll('main article').length};
  });
}

export function assertFooterLayoutPreserved(prior,candidate) {
  assert(prior&&candidate,'Independent prior and candidate footer evidence is required');
  const nonGeometric=value=>({padding:value.padding,styles:value.styles,markup:value.markup,
    pageHasPurchaseBar:value.pageHasPurchaseBar,documentWidth:value.documentWidth,viewportWidth:value.viewportWidth,
    links:value.links.map(({rect,...link})=>link)});
  assert.deepEqual(nonGeometric(candidate),nonGeometric(prior),'Footer markup, styling, links and tappability match the independent baseline');
  assertRectanglePreserved(prior.footer,candidate.footer,'Footer');
  assertRectanglePreserved(prior.bar,candidate.bar,'Mobile purchase bar');
  assert.equal(candidate.links.length,prior.links.length,'Footer policy link count is preserved');
  for(let i=0;i<prior.links.length;i++)assertRectanglePreserved(prior.links[i].rect,candidate.links[i].rect,'Footer link '+prior.links[i].text);
  return {passed:true,prior,candidate};
}

async function settlePresentation(page) {
  await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:30000});
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);});
  await page.waitForTimeout(300);
}

async function measureFooter(page) {
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForFunction(()=>Math.abs(document.documentElement.scrollHeight-innerHeight-scrollY)<2);
  const measurement=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const footer=document.querySelector('footer.site-footer,footer.footer');
    const bar=document.querySelector('[aria-label="Mobile purchase actions"]');
    const visibleBar=bar&&getComputedStyle(bar).display!=='none'?bar:null;
    const styles=['display','visibility','position','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderTopWidth','marginTop','marginBottom','paddingTop','paddingRight','paddingBottom','paddingLeft'];
    const links=Array.from(footer.querySelectorAll('.footer-bottom a')).map(e=>{
      const r=rect(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {text:e.textContent.trim(),href:e.getAttribute('href'),rect:r,tappable:hit===e||e.contains(hit),cover:hit?.className??null};
    });
    return {footer:rect(footer),bar:visibleBar?rect(visibleBar):null,links,markup:footer.outerHTML,
      padding:getComputedStyle(footer).paddingBottom,styles:Object.fromEntries(styles.map(key=>[key,getComputedStyle(footer)[key]])),
      pageHasPurchaseBar:!!bar,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
  });
  assert(measurement.documentWidth<=measurement.viewportWidth+1,'No horizontal overflow');
  return measurement;
}

function collectionBodyEvidence(rawHtml) {
  assert.equal((rawHtml.match(/<\/head>/g)||[]).length,1,'Shop All crawler HTML has exactly one head boundary');
  const body=rawHtml.slice(rawHtml.indexOf('</head>')+7);
  const raw=assertPriorCollectionBody(body);
  assert.equal(raw.productArticleCount,54,'Shop All retains the complete reviewed product catalogue');
  return {raw,body:{length:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')}};
}

export function validatePresentationBaseline(report,expectedBase) {
  assert(report&&report.schemaVersion===1&&report.kind==='hidi-seo-presentation-baseline','A versioned independent presentation baseline is required');
  assert.equal(report.passed,true,'Presentation baseline capture must have passed');
  assert.equal(report.readOnly,true,'Presentation baseline must be read-only');
  assert.equal(report.liveWrites,0,'Presentation baseline must not contain commerce writes');
  assert.equal(report.base,expectedBase,'Presentation baseline origin must match the reviewed origin');
  assert(Number.isFinite(Date.parse(report.capturedAt)),'Presentation baseline capture timestamp is required');
  assert.equal(report.results?.length,PRESENTATION_MATRIX.length,'Presentation baseline must include every engine and viewport exactly once');
  const seen=new Set();
  for(const row of report.results) {
    const key=`${row.engine}-${row.width}-${row.height}`;
    assert(!seen.has(key),'Presentation baseline must not repeat an engine/viewport');seen.add(key);
    assert(PRESENTATION_MATRIX.some(value=>value.engine===row.engine&&value.width===row.width&&value.height===row.height),'Unexpected presentation baseline engine/viewport');
    assert.equal(row.passed,true,'Presentation baseline viewport must have passed');
    const expectedPages=presentationPages(row.width);
    assert.deepEqual(row.checks?.map(value=>value.page),expectedPages,'Presentation baseline must retain every required route in order');
    const product=row.checks.find(value=>value.page==='product')?.path;
    assert(/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product),'Presentation baseline must identify its exact product route');
    for(const check of row.checks) {
      assert.equal(check.path,presentationRoute(check.page,product),'Presentation baseline route identity must remain exact');
      assert.equal(check.passed,true,'Presentation baseline route must have passed');
      assert(check.footer&&typeof check.footer.markup==='string'&&check.footer.markup.startsWith('<footer'),'Presentation baseline footer markup is required');
      assert(check.footer.styles&&typeof check.footer.styles.paddingBottom==='string','Presentation baseline computed footer styles are required');
      assert(Array.isArray(check.footer.links)&&check.footer.links.length===4,'Presentation baseline must contain all four policy/support links');
      assertFooterLayoutPreserved(check.footer,check.footer);
      if(check.page==='catalogue') {
        assert(check.collectionAll?.body&&/^[a-f0-9]{64}$/.test(check.collectionAll.body.sha256)&&check.collectionAll.body.length>0,'Presentation baseline needs its complete streamed Shop All body digest');
        assert.equal(check.collectionAll.raw?.heading,priorCollectionTitle,'Presentation baseline retains crawler H1');
        assert.equal(check.collectionAll.raw?.breadcrumbLabel,priorCollectionTitle,'Presentation baseline retains crawler breadcrumb');
        assert.equal(check.collectionAll.raw?.introCount,0,'Presentation baseline retains absent crawler intro');
        assert.equal(check.collectionAll.raw?.productArticleCount,54,'Presentation baseline retains all 54 crawler product cards');
        assertCollectionPresentationPreserved(check.collectionAll.rendered,check.collectionAll.rendered);
        assert.equal(check.collectionAll.rendered.productArticleCount,54,'Presentation baseline retains all 54 rendered product cards');
      } else assert.equal(check.collectionAll,null,'Only the Shop All route has collection presentation evidence');
    }
  }
  return report;
}

export async function capturePresentationBaseline(base,output) {
  await mkdir(output,{recursive:true});
  const rawResponse=await crawlerDocument(base,'/collections/all');
  assert.equal(rawResponse.status,200,'Prior Shop All crawler document must load');
  assert.match(rawResponse.headers.get('content-type')||'',/^text\/html\b/i,'Prior Shop All crawler document must be HTML');
  const collectionRaw=collectionBodyEvidence(rawResponse.text);
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  const results=[],writes=[];
  const capturedAt=new Date().toISOString();
  for(const engine of ['chromium','firefox','webkit']) {
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try {
      for(const {width,height} of PRESENTATION_MATRIX.filter(value=>value.engine===engine)) {
        const context=await createReadOnlyContext(browser,engine,width,height,base,writes);
        const page=await context.newPage();page.setDefaultTimeout(45000);
        const checks=[];
        let product=null;
        try {
          for(const key of presentationPages(width)) {
            const path=presentationRoute(key,product);
            assert(path,'Prior route must be resolved before it is visited');
            assert((await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:45000}))?.ok(),'Prior presentation document must load');
            await page.locator('footer.site-footer, footer.footer').first().waitFor();
            if(key==='catalogue') {
              const link=page.locator('main article h3 a').first();await link.waitFor();
              product=await link.getAttribute('href');assert(product?.startsWith('/products/'));
            }
            if(key==='product'&&width<=620)await page.locator('[aria-label="Mobile purchase actions"]').waitFor({state:'visible'});
            await settlePresentation(page);
            const collectionAll=key==='catalogue'?{...collectionRaw,rendered:await readCollectionPresentation(page)}:null;
            const footer=await measureFooter(page);
            await captureScreenshot(page,{path:`${output}/${engine}-${width}-${height}-${key}.png`});
            checks.push({page:key,path,passed:true,collectionAll,footer});
          }
          results.push({engine,width,height,passed:true,checks});
        } catch(error) {
          await captureScreenshot(page,{path:`${output}/${engine}-${width}-${height}-failure.png`}).catch(()=>{});
          throw error;
        } finally {await context.close();}
      }
    } finally {await browser.close();}
  }
  assert.deepEqual(writes,[],'Presentation baseline must not emit commerce writes');
  const report={schemaVersion:1,kind:'hidi-seo-presentation-baseline',passed:true,readOnly:true,liveWrites:0,base,capturedAt,results};
  validatePresentationBaseline(report,base);
  await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
  return report;
}

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

export const CLIENT_NAVIGATION_CASES=Object.freeze([
  Object.freeze({name:'fresh-immediate-pointer',settled:false,history:false,freshContext:true}),
  Object.freeze({name:'fresh-settled-pointer',settled:true,history:true,freshContext:true}),
]);
const retainedNavigationCase=Object.freeze({name:'retained-context-pointer',settled:false,history:true,freshContext:false});

export function isFixtureProductImageRequest(base,resourceType,rawUrl) {
  if(!base.startsWith('http://127.0.0.1')||resourceType!=='image')return false;
  const url=new URL(rawUrl);
  const sourcePath=url.pathname==='/_next/image'?url.searchParams.get('url'):url.pathname;
  return sourcePath?.startsWith('/media/products/')??false;
}

async function createReadOnlyContext(browser,engine,width,height,base,writes) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,
    isMobile:engine==='webkit'&&width<1000,reducedMotion:'reduce',extraHTTPHeaders:{'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    // Synthetic verification must not emit external analytics or commerce writes.
    if(url.hostname==='static.cloudflareinsights.com')return route.abort();
    if(!['GET','HEAD'].includes(req.method())) {
      if(!isBlockedTelemetry(req.method(),req.url(),base))writes.push({method:req.method(),path:url.pathname});
      return route.abort();
    }
    // Product media is covered by the exact reviewed image allowlist and the
    // independent live-image audit. Do not let the isolated fixture's fake
    // Azure media backend occupy browser connections needed by Next scripts.
    if(isFixtureProductImageRequest(base,req.resourceType(),req.url()))return route.abort();
    if(req.resourceType()==='media'||/google-analytics|googletagmanager|facebook\.net/.test(url.hostname))return route.abort();
    return route.continue();
  });
  return context;
}

function observeFrameworkHeadErrors(page,headErrors) {
  page.on('pageerror',error=>{if(/NotFoundError|removeChild|HierarchyRequestError|Rendered fewer hooks/i.test(String(error)))headErrors.push(String(error));});
}

async function probeClientNavigation(page,base,scenario,output,filePrefix) {
  try {
    const response=await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded',timeout:45000});
    assert(response?.ok(),'Client-navigation collection document must load');
    if(scenario.settled) {
      await assertSearchMetadata(page,'/collections/all');
      await page.waitForLoadState('load',{timeout:45000});
      await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:30000});
      await page.waitForTimeout(1000);
    } else if(!scenario.freshContext) {
      await assertSearchMetadata(page,'/collections/all');
    }
    const productHeading=page.locator('main article h3').first();
    const nextProduct=productHeading.locator('a[href^="/products/"]').first();
    await productHeading.waitFor({state:'visible',timeout:45000});
    await productHeading.scrollIntoViewIfNeeded({timeout:45000});
    const nextPath=await nextProduct.getAttribute('href');
    assert(nextPath?.startsWith('/products/'),'Client-navigation target must be a product route');
    const activation=await productHeading.evaluate((heading,path)=>{
      const anchor=heading.querySelector('a[href^="/products/"]');
      if(!anchor||anchor.getAttribute('href')!==path)return null;
      // The product name is a long inline anchor clipped by a nowrap heading.
      // Target the visible heading box so the browser cannot horizontally
      // centre the oversized anchor outside the card before dispatching it.
      heading.scrollLeft=0;
      const rect=heading.getBoundingClientRect(),y=rect.top+rect.height/2;
      const offsets=[Math.min(8,rect.width/2),rect.width*.25,rect.width*.5,rect.width*.75];
      const offset=offsets.find(x=>{
        const hit=document.elementFromPoint(rect.left+x,y);
        return hit===anchor||anchor.contains(hit);
      });
      if(offset===undefined)return null;
      const key='hidi-seo-navigation-activation';
      const documentMarker='hidi-seo-'+Date.now()+'-'+Math.random();
      globalThis.__hidiSeoDocumentMarker=documentMarker;
      sessionStorage.removeItem(key);
      const record=event=>{
        const clicked=event.target instanceof Element?event.target.closest('a'):null;
        if(clicked!==anchor)return;
        sessionStorage.setItem(key,JSON.stringify({href:clicked.getAttribute('href'),trusted:event.isTrusted,
          button:event.button,documentMarker,defaultPrevented:event.defaultPrevented}));
        window.removeEventListener('click',record);
      };
      // Window bubbling runs after the React/anchor handler, so the recorded
      // defaultPrevented value proves Next handled the same-document route.
      window.addEventListener('click',record);
      return {key,x:offset,y:rect.height/2,hitHref:anchor.getAttribute('href'),headingScrollLeft:heading.scrollLeft,documentMarker};
    },nextPath);
    assert(activation,'A visible point in the product heading must hit its exact link');
    assert.equal(activation.hitHref,nextPath,'The reviewed pointer point belongs to the selected product link');
    assert.equal(activation.headingScrollLeft,0,'The clipped product heading starts at its visible leading edge');
    await Promise.all([
      page.waitForURL(url=>url.pathname===nextPath,{waitUntil:'commit',timeout:45000}),
      productHeading.click({position:{x:activation.x,y:activation.y},noWaitAfter:true,timeout:45000}),
    ]);
    const activationEvidence=await page.evaluate(key=>{
      try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}
    },activation.key);
    assert(activationEvidence,'The product route must retain exact pointer-activation evidence');
    assert.equal(activationEvidence.href,nextPath,'The trusted pointer activated the selected product link');
    assert.equal(activationEvidence.trusted,true,'Client navigation must come from one trusted physical pointer action');
    assert.equal(activationEvidence.button,0,'Client navigation uses the primary pointer button');
    assert.equal(activationEvidence.defaultPrevented,true,'The Next link must retain client-side navigation handling');
    assert.equal(await page.evaluate(()=>globalThis.__hidiSeoDocumentMarker),activation.documentMarker,
      'Client navigation must retain the same document instead of masking metadata with a hard reload');
    await page.waitForFunction(({path,canonical})=>{
      const values=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap(node=>{
        try {const value=JSON.parse(node.textContent);return Array.isArray(value)?value:(value['@graph']||[value]);}catch{return [];}
      });
      const product=values.find(value=>value['@type']==='Product');
      const robots=document.querySelector('meta[name="robots"]')?.content;
      return location.pathname===path && document.querySelector('link[rel="canonical"]')?.href===canonical &&
        !robots?.includes('noindex') && product?.name && document.title===product.name+' | HIDI';
    },{path:nextPath,canonical:'https://hidiindia.com'+nextPath},{timeout:45000});
    const navigationSeo=await page.evaluate(()=>({canonical:document.querySelector('link[rel=canonical]')?.href,robots:document.querySelector('meta[name=robots]')?.content}));
    assert.equal(navigationSeo.canonical,'https://hidiindia.com'+nextPath,'Canonical survives client navigation');
    assert(!navigationSeo.robots?.includes('noindex'),'Public product remains indexable after client navigation');
    await assertCrawlerDirectives(page,false);
    const productIdentity=await page.evaluate(()=>{
      const values=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap(node=>{
        try {const value=JSON.parse(node.textContent);return Array.isArray(value)?value:(value['@graph']||[value]);}catch{return [];}
      });
      const product=values.find(value=>value['@type']==='Product');
      return {title:document.title,name:product?.name,description:product?.description};
    });
    assert(productIdentity.name,'Destination product schema remains present');
    assert.equal(productIdentity.title,productIdentity.name+' | HIDI','Product title belongs to the destination, not the prior collection');
    const checks=[{page:'client-navigation',path:nextPath,scenario:scenario.name,settled:scenario.settled,
      freshContext:scenario.freshContext,passed:true,...navigationSeo}];
    await captureScreenshot(page,{path:`${output}/${filePrefix}-${scenario.name}.png`});
    if(scenario.history) {
      await page.goBack({waitUntil:'domcontentloaded',timeout:45000});
      await assertSearchMetadata(page,'/collections/all');
      await page.goForward({waitUntil:'domcontentloaded',timeout:45000});
      if(base.startsWith('http://127.0.0.1')) {
        // Reproduce the slow live-router case where cached product head nodes
        // still contain the preceding collection's metadata.
        await page.evaluate(()=>{document.title='Previous collection';document.head.querySelector('meta[name="description"]').content='Previous collection description';});
      }
      await page.waitForFunction(({path,canonical,name})=>{
        const values=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap(node=>{
          try {const value=JSON.parse(node.textContent);return Array.isArray(value)?value:(value['@graph']||[value]);}catch{return [];}
        });
        const product=values.find(value=>value['@type']==='Product');
        const robots=document.querySelector('meta[name="robots"]')?.content;
        return location.pathname===path && document.querySelector('link[rel="canonical"]')?.href===canonical &&
          !robots?.includes('noindex') && product?.name===name && document.title===name+' | HIDI';
      },{path:nextPath,canonical:'https://hidiindia.com'+nextPath,name:productIdentity.name},{timeout:45000});
      const restoredProduct=await page.evaluate(()=>{
        const values=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap(node=>{
          try {const value=JSON.parse(node.textContent);return Array.isArray(value)?value:(value['@graph']||[value]);}catch{return [];}
        });
        const product=values.find(value=>value['@type']==='Product');
        return {canonical:document.querySelector('link[rel="canonical"]')?.href,name:product?.name,description:product?.description};
      });
      assert.equal(restoredProduct.canonical,'https://hidiindia.com'+nextPath,'Product canonical survives forward history');
      assert.equal(restoredProduct.name,productIdentity.name,'Product schema identity survives forward history');
      assert.equal(restoredProduct.description,productIdentity.description,'Product schema description survives forward history');
      const restoredDescriptions=await page.locator('meta[name="description"]').evaluateAll(nodes=>nodes.map(node=>node.content));
      assert(restoredDescriptions.length>0 && restoredDescriptions.every(value=>value===productIdentity.description),'Every retained product description survives cached forward navigation');
      await assertCrawlerDirectives(page,false);
      await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('footer').first().waitFor({timeout:45000});
      await assertSearchMetadata(page,'/');
      await page.reload({waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('footer').first().waitFor({timeout:45000});
      await assertSearchMetadata(page,'/');
      checks.push({page:'back-forward-reload-metadata',scenario:scenario.name,freshContext:scenario.freshContext,passed:true});
    }
    return checks;
  } catch(error) {
    await captureScreenshot(page,{path:`${output}/${filePrefix}-${scenario.name}-failure.png`}).catch(()=>{});
    await writeFile(`${output}/${filePrefix}-${scenario.name}-failure.txt`,page.url()+'\n'+await page.locator('body').innerText().catch(()=>''));
    throw error;
  }
}

export async function probe(base, output, {baseline,baselineReport}={}) {
  assert(Boolean(baseline)!==Boolean(baselineReport),'Provide exactly one independent presentation baseline: prior runtime or pre-deployment report');
  if(baseline) {
    assert(base.startsWith('http://127.0.0.1:')&&baseline.startsWith('http://127.0.0.1:'),'An isolated prior runtime is required for a local baseline');
    assert.notEqual(new URL(baseline).origin,new URL(base).origin,'Candidate cannot serve as its own presentation baseline');
  }
  const presentationBaseline=baseline
    ?await capturePresentationBaseline(baseline,output+'/prior')
    :validatePresentationBaseline(JSON.parse(await readFile(baselineReport,'utf8')),base);
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
  const catalogueProductCount=catalogue.filter(product=>!product.status||product.status==='ACTIVE').length;
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
      const sizes = PRESENTATION_MATRIX.filter(value=>value.engine===engine);
      for (const {width,height} of sizes) {
        const priorResult=presentationBaseline.results.find(value=>value.engine===engine&&value.width===width&&value.height===height);
        assert(priorResult,'An independent baseline is required for every engine/viewport');
        const context = await createReadOnlyContext(browser,engine,width,height,base,writes);
        const page=await context.newPage();page.setDefaultTimeout(45000);
        const headErrors=[];
        observeFrameworkHeadErrors(page,headErrors);
        const checks=[];
        try {
          const pages=presentationPages(width);
          for(const key of pages) {
            const path=presentationRoute(key,product);
            const priorCheck=priorResult.checks.find(value=>value.page===key);
            assert.equal(path,priorCheck?.path,'Candidate and baseline must visit the same route');
            let collectionAll=null;
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
              if(key==='catalogue') {
                const raw=collectionBodyEvidence(rawHtml);
                assert.deepEqual(raw, {raw:priorCheck.collectionAll.raw,body:priorCheck.collectionAll.body},'Crawler Shop All body remains byte-exact with unchanged H1, intro and breadcrumb');
                collectionAll=raw;
              }
              for(const match of rawHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))assert(!/https?:\/\/(?:thehidi\.com|thidigk\.thehidi\.com|localhost(?::\d+)?)[/]/.test(match[1]),'Initial HTML structured-data identities use the production origin');
              const graphs=await page.locator('script[type="application/ld+json"]').allTextContents();
              for(const graph of graphs)assert(!/https?:\/\/(?:thehidi\.com|thidigk\.thehidi\.com|localhost(?::\d+)?)[/]/.test(graph),'Structured-data identities use the production origin');
            }
            await settlePresentation(page);
            if(key==='catalogue') {
              const rendered=await readCollectionPresentation(page);
              assertCollectionPresentationPreserved(priorCheck.collectionAll.rendered,rendered);
              collectionAll={...collectionAll,rendered,preserved:true};
            }
            const measurement=await measureFooter(page);
            assertFooterLayoutPreserved(priorCheck.footer,measurement);
            if(key==='product'&&width<=620)assert(measurement.bar,'Existing mobile purchase bar remains visible');
            else if(key==='product')assert.equal(measurement.bar,null,'Desktop/tablet purchase layout remains unchanged');
            else assert.equal(measurement.pageHasPurchaseBar,false,'Purchase bar remains limited to product pages');
            await captureScreenshot(page,{path:`${output}/${engine}-${width}-${height}-${key}.png`});
            checks.push({page:key,path,passed:true,collectionAll,footerLayoutPreserved:true,footer:measurement});
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
            if(engine==='firefox') {
              for(const scenario of CLIENT_NAVIGATION_CASES) {
                const navigationContext=await createReadOnlyContext(browser,engine,width,height,base,writes);
                try {
                  const navigationPage=await navigationContext.newPage();navigationPage.setDefaultTimeout(45000);
                  observeFrameworkHeadErrors(navigationPage,headErrors);
                  checks.push(...await probeClientNavigation(navigationPage,base,scenario,output,`${engine}-${width}-${height}`));
                }
                finally {await navigationContext.close();}
              }
            } else {
              checks.push(...await probeClientNavigation(page,base,retainedNavigationCase,output,`${engine}-${width}-${height}`));
            }
          }
          assert.deepEqual(headErrors,[],'Metadata reconciliation must not break framework DOM ownership');
          results.push({engine,width,height,passed:true,checks});
          console.log(`PASS: ${engine} ${width}x${height}: retained collection and footer presentation match the independent baseline`);
        } catch(error) {
          await captureScreenshot(page,{path:`${output}/${engine}-${width}-${height}-failure.png`}).catch(()=>{});
          await writeFile(`${output}/${engine}-${width}-${height}-failure.txt`,page.url()+'\n'+await page.locator('body').innerText());
          throw error;
        } finally {await context.close();}
      }
    } finally {await browser.close();}
  }
  assert.deepEqual(writes,[],'No commerce writes permitted');
  const missing=await fetch(base+'/products/hidi-seo-missing-8f29017',{method:'HEAD',headers:seoHeaders});
  assert.equal(missing.status,404,'Missing product status remains accurate');
  const allChecks=results.flatMap(result=>result.checks);
  const clientNavigationChecks=allChecks.filter(check=>check.page==='client-navigation');
  const historyChecks=allChecks.filter(check=>check.page==='back-forward-reload-metadata');
  const freshFirefoxChecks=results.filter(result=>result.engine==='firefox').flatMap(result=>result.checks)
    .filter(check=>check.page==='client-navigation'&&check.freshContext);
  const report={passed:true,engines,results,liveWrites:0,footerLayoutPreserved:true,presentationBaselineVerified:true,
    presentationBaseline:{source:baseline?'isolated-prior-runtime':'pre-deployment-report',base:presentationBaseline.base,
      capturedAt:presentationBaseline.capturedAt,matrixCases:presentationBaseline.results.length},
    catalogueProductCount,catalogueImageAssociations:imageAssociations,
    clientNavigationCases:clientNavigationChecks.length,freshFirefoxClientNavigationCases:freshFirefoxChecks.length,
    immediateFirefoxClientNavigationCases:freshFirefoxChecks.filter(check=>check.scenario==='fresh-immediate-pointer').length,
    settledFirefoxClientNavigationCases:freshFirefoxChecks.filter(check=>check.scenario==='fresh-settled-pointer').length,
    backForwardReloadCases:historyChecks.length,
    collectionAllBodyPreserved:true,collectionAllPresentationPreserved:true,collectionAllBreadcrumbPreserved:true,collectionAllMatrixCases:results.length,
    reviewedCollectionBodyDelta:'none'};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));
  return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname) {
  const [base,output,mode,baselineReport,...extra]=process.argv.slice(2);
  assert(base&&output&&extra.length===0,'Provide a base URL, output directory and explicit baseline mode');
  if(mode==='--capture-presentation-baseline') {
    assert.equal(baselineReport,undefined,'Capture mode does not accept a baseline report');
    await capturePresentationBaseline(base,output);
  } else {
    assert.equal(mode,'--baseline-report','Live verification requires a pre-deployment presentation baseline');
    assert(baselineReport,'A pre-deployment baseline report path is required');
    await probe(base,output,{baselineReport});
  }
}
