import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import test from 'node:test';
import {CLIENT_NAVIGATION_CASES, PRESENTATION_MATRIX, crawlerDocument, isFixtureProductImageRequest, assertCollectionPresentationPreserved, assertFooterLayoutPreserved, assertRetainedPriceAnnouncement, validatePresentationBaseline} from './probes.mjs';

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('crawler document waits for the complete HTML stream and sends canonical crawler headers', async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.host, 'hidiindia.com');
    assert.equal(request.headers['x-forwarded-host'], 'hidiindia.com');
    assert.equal(request.headers['x-forwarded-proto'], 'https');
    assert.equal(request.headers.accept, 'text/html,application/xhtml+xml');
    assert.equal(request.headers['accept-encoding'], 'identity');
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    response.write('<!doctype html><html><body>first');
    setTimeout(() => response.end(' second</body></html>'), 40);
  }, async base => {
    const started = Date.now();
    const document = await crawlerDocument(base, '/streamed', {timeoutMs: 500, limit: 1024});
    assert.equal(document.status, 200);
    assert.match(document.headers.get('content-type'), /^text\/html\b/i);
    assert.equal(document.text, '<!doctype html><html><body>first second</body></html>');
    assert(Date.now() - started >= 30, 'reader must not resolve before the response end event');
  });
});

test('crawler document enforces the response-size cap', async () => {
  await withServer((_request, response) => {
    response.writeHead(200, {'content-type': 'text/html', 'content-length': '1024'});
    response.end('oversized');
  }, async base => {
    await assert.rejects(
      crawlerDocument(base, '/oversized', {timeoutMs: 500, limit: 64}),
      /Crawler document \/oversized rejected after \d+ms: declared body exceeds 64 bytes/,
    );
  });
});

test('crawler document has an absolute deadline even when the server keeps sending bytes', async () => {
  await withServer((_request, response) => {
    response.writeHead(200, {'content-type': 'text/html'});
    const interval = setInterval(() => response.write('x'), 10);
    response.once('close', () => clearInterval(interval));
  }, async base => {
    await assert.rejects(
      crawlerDocument(base, '/never-ending', {timeoutMs: 80, limit: 1024}),
      /Crawler document \/never-ending timed out after \d+ms: request exceeded 80ms/,
    );
  });
});

test('Firefox client navigation has fixed immediate and settled fresh-context cases', () => {
  assert.deepEqual(CLIENT_NAVIGATION_CASES, [
    {name:'fresh-immediate-pointer',settled:false,history:false,freshContext:true},
    {name:'fresh-settled-pointer',settled:true,history:true,freshContext:true},
  ]);
  const source=readFileSync(new URL('./probes.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function probeClientNavigation');
  const end=source.indexOf('\nexport async function probe',start);
  assert(start>=0&&end>start,'Client-navigation helper remains independently reviewable');
  const helper=source.slice(start,end);
  assert.match(source,/const navigationContext=await createReadOnlyContext\(browser,engine,width,height,base,writes\)/);
  assert.match(source,/finally \{await navigationContext\.close\(\);\}/);
  assert.match(helper,/const productHeading=page\.locator\('main article h3'\)\.first\(\);/);
  assert.match(helper,/document\.elementFromPoint\(rect\.left\+x,y\)/,
    'The physical activation point must be verified inside the visible clipped heading');
  assert.match(helper,/productHeading\.click\(\{position:\{x:activation\.x,y:activation\.y\},noWaitAfter:true,timeout:45000\}\)/,
    'The bounded heading receives one physical pointer action at the verified product-link point');
  assert.doesNotMatch(helper,/nextProduct\.click\(/,
    'The oversized inline product anchor must not be auto-centred outside its clipped mobile card');
  assert.match(helper,/window\.addEventListener\('click',record\)/,
    'The trusted click recorder must run after the Next/React bubble handler');
  assert.doesNotMatch(helper,/queueMicrotask/,
    'The recorder must not sample defaultPrevented before the link bubble handler runs');
  assert.match(helper,/activationEvidence\.trusted,true/);
  assert.match(helper,/activationEvidence\.defaultPrevented,true/);
  assert.match(helper,/__hidiSeoDocumentMarker/,
    'The gate must prove the pointer kept a same-document Next client transition');
  assert.doesNotMatch(helper,/\b(?:chromium|firefox|webkit)\b/i,
    'The exact trusted activation must be identical in every browser engine');
  assert.match(helper,/waitForLoadState\('load',\{timeout:45000\}\)/);
  assert.match(helper,/document\.fonts\.status==='loaded'.*timeout:30000/s);
  assert.doesNotMatch(helper,/\bretr(?:y|ies|ied)\b/i,'Navigation gate must not mask failures with retries');
  for(const match of helper.matchAll(/timeout:(\d+)/g))assert(Number(match[1])<=45000,'Navigation operation timeout must not exceed 45 seconds');
});

test('read-only browser probe isolates reviewed SEO checks from the fake Azure media backend', () => {
  const optimized='http://127.0.0.1:4100/_next/image?url=%2Fmedia%2Fproducts%2F_display_v2%2Fitem.jpg&w=1080&q=75';
  const direct='http://127.0.0.1:4100/media/products/_display_v2/item.jpg';
  assert.equal(isFixtureProductImageRequest('http://127.0.0.1:4100','image',optimized),true);
  assert.equal(isFixtureProductImageRequest('http://127.0.0.1:4100','image',direct),true);
  assert.equal(isFixtureProductImageRequest('http://127.0.0.1:4100','image','http://127.0.0.1:4100/brand/hidi-logo-header.svg'),false);
  assert.equal(isFixtureProductImageRequest('https://hidiindia.com','image','https://hidiindia.com/media/products/item.jpg'),false);
  assert.equal(isFixtureProductImageRequest('http://127.0.0.1:4100','script',optimized),false);
  const source=readFileSync(new URL('./probes.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function createReadOnlyContext');
  const end=source.indexOf('\nfunction observeFrameworkHeadErrors',start);
  assert(start>=0&&end>start,'Read-only BrowserContext factory remains independently reviewable');
  const helper=source.slice(start,end);
  assert.match(helper,/if\(isFixtureProductImageRequest\(base,req\.resourceType\(\),req\.url\(\)\)\)return route\.abort\(\);/,
    'Synthetic image fetches must not reach the intentionally unavailable fixture media backend');
  assert.match(helper,/return route\.continue\(\);/,'Documents, scripts and styles still use the candidate runtime');
  const foundation=readFileSync(new URL('../seo-foundation/browser.mjs',import.meta.url),'utf8');
  assert.match(foundation,/import \{isFixtureProductImageRequest\} from '\.\.\/seo-discovery\/probes\.mjs';/,
    'The independent foundation context must use the same exact fixture-media classifier');
  assert.match(foundation,/if\(isFixtureProductImageRequest\(base,request\.resourceType\(\),request\.url\(\)\)\)return route\.abort\(\);/,
    'Retaining the 54-product collection must not starve the foundation About document');
});

test('candidate catalogue and guarded product-fact release retain reviewed boundaries', () => {
  const map=JSON.parse(readFileSync(new URL('./reviewed-product-image-map.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(map).length,54,'Candidate catalogue covers every reviewed live product');
  assert.equal(new Set(Object.values(map).flatMap(product=>product.paths)).size,238,
    'Candidate catalogue covers every reviewed live image association');
  const workflow=readFileSync(new URL('../../.github/workflows/seo-product-facts-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/if: github\.event_name == 'workflow_dispatch' \|\| contains\(github\.event\.head_commit\.message, '\[deploy-seo-product-facts\]'\)/,
    'Product-fact production release must require an explicit deploy token or manual dispatch');
});

const rectangle={x:0,y:0,right:100,bottom:20,width:100,height:20};
const collection=()=>({headerCount:1,headingCount:1,introCount:0,heading:'All Products',intro:null,breadcrumbLabel:'All Products',
  headerVisible:false,headingVisible:false,introVisible:false,headerDisplay:'',introDisplay:null,collectionNavigationCount:0,
  header:{...rectangle},headingBox:{...rectangle},introBox:null,firstProduct:{...rectangle},
  styles:{header:{display:'none'},heading:{display:'block'},intro:null},productArticleCount:54});
const footer=(page='catalogue')=>{
  const landing=page==='home';
  const controls=landing
    ?[['a',null,'Shipping','/shipping'],['a',null,'Returns & exchanges','/returns'],['a',null,'Privacy policy','/privacy'],
      ['button','button','Terms of use',null],['a',null,'Contact HIDI','/contact']]
    :[['a',null,'Delivery','/shipping'],['a',null,'Returns & exchanges','/returns'],['a',null,'Order support','/contact'],['a',null,'Privacy policy','/privacy']];
  return {variant:landing?'landing':'storefront',selector:landing?'footer.site-footer#footer':'footer.footer',
    linkSelector:landing?'.footer-grid > .footer-column:nth-child(4) > :is(a, button):not([hidden])':'.footer-bottom a',
    footer:{...rectangle},bar:null,padding:'0px',styles:{paddingBottom:'0px',backgroundColor:'rgb(240, 233, 220)'},
    markup:landing?'<footer class="site-footer" id="footer">Retained footer</footer>':'<footer class="footer">Retained footer</footer>',
    pageHasPurchaseBar:false,documentWidth:390,viewportWidth:390,
    links:controls.map(([tag,type,text,href])=>({tag,type,text,href,rect:{...rectangle},tappable:true,cover:''}))};
};
const priceAnnouncement=page=>({
  selector:'body > aside.hidi-price-announcement[data-hidi-price-announcement="true"][aria-label="HIDI price offer"]',
  count:1,text:['bag','checkout'].includes(page)
    ?'Your product prices already include 15% off. No additional percentage discount is applied at checkout.'
    :'15% off across HIDI · Prices already reduced · No code needed',
  privateNote:['bag','checkout'].includes(page),visible:true,
});
const baseline=()=>({schemaVersion:1,kind:'hidi-seo-presentation-baseline',passed:true,readOnly:true,liveWrites:0,
  base:'https://hidiindia.com',capturedAt:'2026-10-21T12:00:00.000Z',
  results:PRESENTATION_MATRIX.map(({engine,width,height})=>({engine,width,height,passed:true,
    checks:(width===390||width===1440?['home','catalogue','product','bag','checkout']:['catalogue','product']).map(page=>({page,
      path:{home:'/',catalogue:'/collections/all',product:'/products/retained-product',bag:'/cart',checkout:'/checkout'}[page],
      passed:true,priceAnnouncement:priceAnnouncement(page),footer:footer(page),collectionAll:page==='catalogue'?{raw:{heading:'All Products',introCount:0,breadcrumbLabel:'All Products',productArticleCount:54},
        body:{length:2048,sha256:'a'.repeat(64)},rendered:collection()}:null}))}))});

test('presentation readiness requires the exact visible public or private retained pricing notice',()=>{
  for(const page of ['home','catalogue','product','bag','checkout']) {
    const valid=priceAnnouncement(page);
    assert.equal(assertRetainedPriceAnnouncement(valid,page),valid);
    for(const mutate of [
      value=>{value.count=0;},value=>{value.count=2;},value=>{value.count=true;},
      value=>{value.selector='aside';},value=>{value.text='Changed offer';},
      value=>{value.text=priceAnnouncement(page==='checkout'?'home':'checkout').text;value.privateNote=!value.privateNote;},
      value=>{value.privateNote=!value.privateNote;},value=>{value.privateNote=Number(value.privateNote);},
      value=>{value.visible=false;},value=>{value.visible=1;},
    ]) {
      const changed=priceAnnouncement(page);mutate(changed);
      assert.throws(()=>assertRetainedPriceAnnouncement(changed,page),/Retained price announcement/);
    }
    for(const value of [null,undefined])assert.throws(()=>assertRetainedPriceAnnouncement(value,page));
  }
  const premature=baseline();
  delete premature.results[0].checks.find(check=>check.page==='checkout').priceAnnouncement;
  assert.throws(()=>validatePresentationBaseline(premature,premature.base),/Retained price announcement/,
    'The old checkout capture must fail before release even when its footer is present');
  const hidden=baseline();
  hidden.results[0].checks.find(check=>check.page==='checkout').priceAnnouncement.visible=false;
  assert.throws(()=>validatePresentationBaseline(hidden,hidden.base),/Retained price announcement/);
});

test('preservation accepts unchanged hidden collection header and absent intro',()=>{
  const prior=collection();
  assert.equal(assertCollectionPresentationPreserved(prior,structuredClone(prior)).passed,true);
  assert.equal(assertFooterLayoutPreserved(footer(),footer()).passed,true);
});

test('collection copy, visibility, styles, breadcrumb and layout drift fail',()=>{
  for(const mutate of [
    value=>{value.heading='New heading';},
    value=>{value.introCount=1;value.intro='New intro';},
    value=>{value.headerVisible=true;},
    value=>{value.headerDisplay='block';},
    value=>{value.breadcrumbLabel='New label';},
    value=>{value.styles.heading.fontWeight='700';},
    value=>{value.firstProduct.y+=2;},
  ]) {
    const changed=collection();mutate(changed);
    assert.throws(()=>assertCollectionPresentationPreserved(collection(),changed));
  }
});

test('footer improvements and regressions both require a separately reviewed change',()=>{
  for(const mutate of [
    value=>{value.padding='126px';},
    value=>{value.styles.paddingBottom='126px';},
    value=>{value.markup=value.markup.replace('Retained','Changed');},
    value=>{value.links[0].href='/different';},
    value=>{value.links[0].tappable=false;},
    value=>{value.links[0].rect.y+=2;},
    value=>{value.bar={...rectangle};},
  ]) {
    const changed=footer();mutate(changed);
    assert.throws(()=>assertFooterLayoutPreserved(footer(),changed));
  }
  const existingOverlap=footer();existingOverlap.links[0].tappable=false;
  assert.equal(assertFooterLayoutPreserved(existingOverlap,structuredClone(existingOverlap)).passed,true,
    'Preservation evidence does not invent an accessibility fix for a retained limitation');
});

test('presentation baseline requires exact independent origin and complete 12-viewport route matrix',()=>{
  const valid=baseline();
  assert.equal(validatePresentationBaseline(valid,'https://hidiindia.com'),valid);
  assert.equal(PRESENTATION_MATRIX.length,12);
  assert.equal(valid.results.reduce((count,row)=>count+row.checks.length,0),42);
  assert.throws(()=>validatePresentationBaseline(valid,'http://127.0.0.1:4100'),/origin/);
  for(const mutate of [
    value=>{value.results.pop();},
    value=>{value.results[1]=structuredClone(value.results[0]);},
    value=>{value.results[0].checks.pop();},
    value=>{value.results[0].checks[0].path='/different';},
    value=>{value.results[0].checks[1].collectionAll=null;},
    value=>{value.results[0].checks[0].footer=null;},
    value=>{value.liveWrites=1;},
    value=>{value.passed=false;},
  ]) {
    const changed=baseline();mutate(changed);
    assert.throws(()=>validatePresentationBaseline(changed,'https://hidiindia.com'));
  }
});

test('presentation baseline retains each route-specific footer and every policy/support control',()=>{
  const valid=baseline();
  const home=valid.results[0].checks.find(check=>check.page==='home').footer;
  const catalogue=valid.results[0].checks.find(check=>check.page==='catalogue').footer;
  assert.equal(home.links.length,5,'Landing help column includes the retained Terms button');
  assert.deepEqual(home.links[3],{tag:'button',type:'button',text:'Terms of use',href:null,rect:{...rectangle},tappable:true,cover:''});
  assert.equal(catalogue.links.length,4,'Storefront bottom row retains its four anchors');
  assert.equal(validatePresentationBaseline(valid,valid.base),valid);
  for(const page of ['home','catalogue']) {
    for(const mutate of [
      value=>{value.variant=page==='home'?'storefront':'landing';},
      value=>{value.selector='footer';},
      value=>{value.linkSelector='a';},
      value=>{value.links.pop();},
      value=>{value.links.push(structuredClone(value.links[0]));},
      value=>{[value.links[0],value.links[1]]=[value.links[1],value.links[0]];},
      value=>{value.links[0].tag='button';},
      value=>{value.links[0].type='button';},
      value=>{value.links[0].text='Different policy';},
      value=>{value.links[0].href='/different-policy';},
    ]) {
      const changed=baseline();
      mutate(changed.results[0].checks.find(check=>check.page===page).footer);
      assert.throws(()=>validatePresentationBaseline(changed,changed.base));
    }
  }
  const onlyBackToTop=baseline();
  onlyBackToTop.results[0].checks[0].footer.links=[{tag:'a',type:null,text:'Back to top',href:'#top',rect:{...rectangle},tappable:true,cover:''}];
  assert.throws(()=>validatePresentationBaseline(onlyBackToTop,onlyBackToTop.base),/every reviewed policy\/support control/);
  const changedTerms=baseline();
  Object.assign(changedTerms.results[0].checks[0].footer.links[3],{tag:'a',type:null,href:'/terms'});
  assert.throws(()=>validatePresentationBaseline(changedTerms,changedTerms.base),/every reviewed policy\/support control/);
});

test('presentation evidence cannot hide a changed collection behind a matching baseline',()=>{
  const changed=collection();changed.heading='New heading';
  assert.throws(()=>assertCollectionPresentationPreserved(changed,structuredClone(changed)),/current renderer copy/);
  const incomplete=baseline();delete incomplete.results[0].checks[1].collectionAll.body;
  assert.throws(()=>validatePresentationBaseline(incomplete,'https://hidiindia.com'),/streamed Shop All body digest/);
});

