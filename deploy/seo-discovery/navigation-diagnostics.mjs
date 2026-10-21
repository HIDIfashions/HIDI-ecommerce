import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {appendFile, mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Observation only: this never changes a release gate or a production asset.
// The restored image has its prior SEO metadata. Warm-up therefore waits for
// existing head fields to agree, rather than asserting the candidate's titles.
const VIEWPORT={width:390,height:844};
const TIMEOUT=45000,MAX_EVENTS=2500,KEY='hidi-seo-navigation-activation';
const HISTORY=['/','/collections/all','$product','/cart','/checkout',
  '/collections/work-wear','/collections/casual-wear','/collections/occasional-wear',
  '/collections/ananyas-pick','/about','/shipping','/returns','/contact','/offers'];
const now=()=>new Date().toISOString();
const errorValue=error=>({name:error.name,message:error.message,stack:error.stack});
const push=(array,value)=>{if(array.length<MAX_EVENTS)array.push(value);};
const json=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const seoHeaders={'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'};

// Same abort policy as probes.mjs; this classification never allows a POST.
function blockedTelemetry(method,rawUrl,base){
  if(method!=='POST')return false;
  const url=new URL(rawUrl),origin=new URL(base).origin;
  return (url.origin===origin&&url.pathname==='/api/hidi/performance')||
    (['https://www.google-analytics.com','https://region1.google-analytics.com'].includes(url.origin)&&['/g/collect','/collect'].includes(url.pathname))||
    (url.origin==='https://www.google.com'&&url.pathname==='/g/collect')||
    (url.origin==='https://www.googletagmanager.com'&&url.pathname==='/td')||
    (url.origin==='https://lumberjack.razorpay.com'&&url.pathname==='/v2/logz');
}

async function instrument(context,state,base,journal){
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),entry={at:now(),method:request.method(),url:request.url(),type:request.resourceType()};
    if(url.hostname==='static.cloudflareinsights.com'){
      push(state.blockedTelemetryAndMedia,entry);return route.abort();
    }
    if(!['GET','HEAD'].includes(request.method())){
      push(blockedTelemetry(request.method(),request.url(),base)?state.blockedTelemetryAndMedia:state.blockedCommerceRequests,entry);
      return route.abort();
    }
    if(request.resourceType()==='media'||/google-analytics|googletagmanager|facebook\.net/.test(url.hostname)){
      push(state.blockedTelemetryAndMedia,entry);return route.abort();
    }
    if(base.startsWith('http://127.0.0.1')&&url.origin!==base){
      push(state.unexpectedFixtureRequests,entry);return route.abort();
    }
    return route.continue();
  });
  await context.exposeBinding('__hidiNavigationDiagnosticSink',(_source,value)=>{
    const entry={...value,receivedAt:now()};
    if(state.domEvents.length<MAX_EVENTS){push(state.domEvents,entry);journal({channel:'dom',...entry});}
  });
  await context.addInitScript(({key})=>{
    const id='diag-'+Date.now()+'-'+Math.random();
    globalThis.__hidiDiagnosticDocumentId=id;
    const describe=node=>node instanceof Element?{tag:node.tagName,href:node.closest('a')?.getAttribute('href')??null,
      text:node.textContent?.trim().slice(0,160),connected:node.isConnected}:null;
    const storage=()=>{try{return {raw:sessionStorage.getItem(key),error:null};}catch(error){return {raw:null,error:String(error)};}};
    const snapshot=()=>{
      const original=globalThis.__hidiDiagnosticOriginalAnchor,current=document.querySelector('main article h3 a[href^="/products/"]');
      return {at:Date.now(),performanceNow:performance.now(),timeOrigin:performance.timeOrigin,documentId:id,
        documentMarker:globalThis.__hidiSeoDocumentMarker??null,url:location.href,readyState:document.readyState,
        originalAnchor:describe(original),currentAnchor:describe(current),currentIsOriginal:!!original&&current===original,
        collectionHydrated:document.querySelector('[data-hidi-collection-hydrated]')?.getAttribute('data-hidi-collection-hydrated')??null,
        storage:storage()};
    };
    globalThis.__hidiNavigationDiagnosticSnapshot=snapshot;
    const record=(kind,detail={})=>{
      const value={kind,...snapshot(),...detail};
      try{void globalThis.__hidiNavigationDiagnosticSink(value).catch(()=>{});}catch{}
    };
    globalThis.__hidiNavigationDiagnosticRecord=record;
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','click']){
      for(const capture of [true,false])addEventListener(type,event=>{
        const clicked=event.target instanceof Element?event.target.closest('a'):null;
        const original=globalThis.__hidiDiagnosticOriginalAnchor;
        const current=document.querySelector('main article h3 a[href^="/products/"]');
        const detail={phase:event.eventPhase,trusted:event.isTrusted,button:event.button,defaultPrevented:event.defaultPrevented,
          target:describe(event.target),clicked:describe(clicked),clickedIsOriginal:!!original&&clicked===original,
          clickedIsCurrent:!!current&&clicked===current,path:event.composedPath().filter(node=>node instanceof Element).slice(0,8).map(describe)};
        record('dom:'+type+':'+(capture?'capture':'bubble'),detail);
        if(type==='click'&&capture)setTimeout(()=>record('dom:click:after-task',{...detail,defaultPrevented:event.defaultPrevented}),0);
      },capture);
    }
    for(const type of ['beforeunload','pagehide','pageshow','popstate','hashchange']){
      addEventListener(type,event=>record('window:'+type,{persisted:event.persisted??null}));
    }
    record('document:init');
  },{key:KEY});
}

function instrumentPage(page,state,journal){
  const relevant=request=>['document','fetch','xhr'].includes(request.resourceType());
  page.on('request',request=>{if(relevant(request))push(state.networkEvents,{kind:'request',at:now(),url:request.url(),method:request.method(),type:request.resourceType(),navigation:request.isNavigationRequest()});});
  page.on('requestfailed',request=>push(state.networkEvents,{kind:'requestfailed',at:now(),url:request.url(),type:request.resourceType(),failure:request.failure()}));
  page.on('response',response=>{if(relevant(response.request()))push(state.networkEvents,{kind:'response',at:now(),url:response.url(),status:response.status(),type:response.request().resourceType()});});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame()){
    const entry={kind:'main-frame-navigated',at:now(),url:frame.url()};push(state.pageEvents,entry);journal({channel:'page',...entry});
  }});
  for(const type of ['domcontentloaded','load'])page.on(type,()=>push(state.pageEvents,{kind:type,at:now(),url:page.url()}));
  page.on('console',message=>{if(['warning','error'].includes(message.type()))push(state.consoleEvents,{at:now(),type:message.type(),text:message.text()});});
  page.on('pageerror',error=>push(state.pageErrors,{at:now(),...errorValue(error)}));
}

async function snapshot(page){
  return page.evaluate(()=>({
    ...globalThis.__hidiNavigationDiagnosticSnapshot?.(),
    title:document.title,canonical:document.querySelector('link[rel="canonical"]')?.href??null,
    h1:document.querySelector('main h1')?.textContent?.trim()??null,
    bodyText:document.body?.innerText.slice(0,12000)??'',
  })).catch(error=>({error:errorValue(error),url:page.url()}));
}

async function screenshot(page,path){
  const prior=process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
  process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
  try{await page.screenshot({path,timeout:15000});}
  finally{if(prior===undefined)delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY=prior;}
}

async function coherentHead(page){
  await page.waitForFunction(()=>{
    const titles=[...document.head.querySelectorAll('title')],descriptions=[...document.head.querySelectorAll('meta[name="description"]')];
    return titles.length>0&&document.title.trim()&&titles.every(node=>node.textContent===document.title)&&
      descriptions.length>0&&descriptions.every(node=>node.content===descriptions[0].content);
  },null,{timeout:5000});
}

async function readPublic(base,path,method='GET'){
  const response=await fetch(base+path,{method,headers:seoHeaders,redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(method==='GET')await response.arrayBuffer();
  return response.status;
}

async function waitForPriceNotice(page,path){
  await page.waitForFunction(privateNote=>{
    const all=document.querySelectorAll('[data-hidi-price-announcement]');
    const node=document.querySelector('body > aside.hidi-price-announcement[data-hidi-price-announcement="true"][aria-label="HIDI price offer"]');
    const text=privateNote?'Your product prices already include 15% off. No additional percentage discount is applied at checkout.':'15% off across HIDI · Prices already reduced · No code needed';
    return all.length===1&&node&&node.textContent.trim()===text&&node.hasAttribute('data-hidi-price-note')===privateNote&&
      getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&node.getBoundingClientRect().height>0;
  },['/cart','/checkout'].includes(path),{timeout:TIMEOUT});
}

async function warmHistory(page,base,directory,attempt){
  let product;
  for(let index=0;index<HISTORY.length;index++){
    const path=HISTORY[index]==='$product'?product:HISTORY[index];
    assert(path,'Warm collection resolves its product before visiting it');
    const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:TIMEOUT});
    assert(response?.ok(),'Warm document loads: '+path);
    await page.locator('footer.site-footer, footer.footer').first().waitFor({state:index<5?'visible':'attached'});
    if(path==='/collections/all'){
      const link=page.locator('main article h3 a').first();await link.waitFor();product=await link.getAttribute('href');
      assert(/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product),'Warm product route is canonical');
    }
    if(index<5){
      if(index===2)await page.locator('[aria-label="Mobile purchase actions"]').waitFor({state:'visible'});
      assert.equal(await readPublic(base,path,'HEAD'),200);
      if(index<3)assert.equal(await readPublic(base,path),200);
      await coherentHead(page);
      await waitForPriceNotice(page,path);
      await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:30000});
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);});
      await page.waitForTimeout(300);
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      await page.waitForFunction(()=>Math.abs(document.documentElement.scrollHeight-innerHeight-scrollY)<2);
      await screenshot(page,directory+'/warm-'+index+'.png');
      if(index===4){
        for(const route of ['/lookbook','/lookbook/'])for(const method of ['GET','HEAD'])await readPublic(base,route,method);
        for(const method of ['GET','HEAD'])await readPublic(base,'/privacy',method);
      }
    }else{
      assert.equal(await readPublic(base,path),200);
      await coherentHead(page);
    }
    attempt.warmHistory.push({path,at:now(),title:await page.title()});
  }
}

async function activateOriginalPointer(page,attempt,{replaceAnchor=false,checkpoint=async()=>{}}={}){
  const productHeading=page.locator('main article h3').first();
  const nextProduct=productHeading.locator('a[href^="/products/"]').first();
  await productHeading.waitFor({state:'visible',timeout:TIMEOUT});
  await productHeading.scrollIntoViewIfNeeded({timeout:TIMEOUT});
  const nextPath=await nextProduct.getAttribute('href');
  assert(nextPath?.startsWith('/products/'),'Client-navigation target must be a product route');
  const activation=await productHeading.evaluate((heading,path)=>{
    const anchor=heading.querySelector('a[href^="/products/"]');
    if(!anchor||anchor.getAttribute('href')!==path)return null;
    heading.scrollLeft=0;
    const rect=heading.getBoundingClientRect(),y=rect.top+rect.height/2;
    const offsets=[Math.min(8,rect.width/2),rect.width*.25,rect.width*.5,rect.width*.75];
    const offset=offsets.find(x=>{const hit=document.elementFromPoint(rect.left+x,y);return hit===anchor||anchor.contains(hit);});
    if(offset===undefined)return null;
    const key='hidi-seo-navigation-activation';
    const documentMarker='hidi-seo-'+Date.now()+'-'+Math.random();
    globalThis.__hidiSeoDocumentMarker=documentMarker;
    sessionStorage.removeItem(key);
    globalThis.__hidiDiagnosticOriginalAnchor=anchor;
    const record=event=>{
      const clicked=event.target instanceof Element?event.target.closest('a'):null;
      if(clicked!==anchor){
        globalThis.__hidiNavigationDiagnosticRecord?.('recorder:ignored',{clickedHref:clicked?.getAttribute('href')??null,clickedIsOriginal:false,originalConnected:anchor.isConnected});
        return;
      }
      sessionStorage.setItem(key,JSON.stringify({href:clicked.getAttribute('href'),trusted:event.isTrusted,
        button:event.button,documentMarker,defaultPrevented:event.defaultPrevented}));
      globalThis.__hidiNavigationDiagnosticRecord?.('recorder:wrote',{raw:sessionStorage.getItem(key),originalConnected:anchor.isConnected});
      window.removeEventListener('click',record);
    };
    window.addEventListener('click',record);
    return {key,x:offset,y:rect.height/2,hitHref:anchor.getAttribute('href'),headingScrollLeft:heading.scrollLeft,documentMarker,
      diagnosticAtArm:globalThis.__hidiNavigationDiagnosticSnapshot?.()};
  },nextPath);
  assert(activation,'A visible point in the product heading must hit its exact link');
  assert.equal(activation.hitHref,nextPath);
  assert.equal(activation.headingScrollLeft,0);
  attempt.activation=activation;attempt.destination=nextPath;
  if(replaceAnchor){
    await productHeading.evaluate(heading=>heading.replaceWith(heading.cloneNode(true)));
    attempt.fixtureAfterReplacement=await snapshot(page);
  }
  try{
    await Promise.all([
      page.waitForURL(url=>url.pathname===nextPath,{waitUntil:'commit',timeout:45000}),
      productHeading.click({position:{x:activation.x,y:activation.y},noWaitAfter:true,timeout:45000}),
    ]);
    attempt.pointerActionCompleted=true;
  }catch(error){attempt.pointerActionError=errorValue(error);}
  attempt.immediate=await snapshot(page);
  let evidence=null;
  try{evidence=JSON.parse(attempt.immediate.storage?.raw||'null');}catch{}
  let targetPathMatches=false;
  try{targetPathMatches=new URL(attempt.immediate.url).pathname===nextPath;}catch{}
  attempt.originalGuard={evidence,pointerActionCompleted:attempt.pointerActionCompleted===true,targetPathMatches,
    recordPresent:!!evidence,hrefMatches:evidence?.href===nextPath,
    trusted:evidence?.trusted===true,primaryButton:evidence?.button===0,defaultPrevented:evidence?.defaultPrevented===true,
    sameDocumentMarker:attempt.immediate.documentMarker===activation.documentMarker,
    sameTimeOrigin:attempt.immediate.timeOrigin===activation.diagnosticAtArm?.timeOrigin};
  attempt.originalGuard.passed=['pointerActionCompleted','targetPathMatches','recordPresent','hrefMatches','trusted','primaryButton','defaultPrevented','sameDocumentMarker']
    .every(key=>attempt.originalGuard[key]===true);
  await checkpoint(attempt);
  try{
    await page.waitForFunction(path=>location.pathname===path&&!!document.querySelector('main h1')?.textContent.trim(),nextPath,{timeout:30000});
    attempt.destinationContentReady=true;
  }catch(error){attempt.destinationContentError=errorValue(error);}
  attempt.settled=await snapshot(page);
  await checkpoint(attempt);
}

async function runCase(browser,base,output,specification){
  const directory=output+'/'+specification.name;await mkdir(directory,{recursive:true});
  const state={domEvents:[],pageEvents:[],networkEvents:[],consoleEvents:[],pageErrors:[],blockedCommerceRequests:[],blockedTelemetryAndMedia:[],unexpectedFixtureRequests:[],journalErrors:[]};
  const attempt={...specification,startedAt:now(),browser:'chromium',viewport:VIEWPORT,warmHistory:[],readOnly:true,liveWrites:0};
  let context,page,deadline,expired=false,journalWrites=Promise.resolve();
  const journal=entry=>{
    journalWrites=journalWrites.then(()=>appendFile(directory+'/events.jsonl',JSON.stringify(entry)+'\n'))
      .catch(error=>push(state.journalErrors,errorValue(error)));
  };
  try{
    context=await browser.newContext({viewport:VIEWPORT,hasTouch:true,reducedMotion:'reduce',extraHTTPHeaders:seoHeaders,serviceWorkers:'block'});
    deadline=setTimeout(()=>{expired=true;void context.close().catch(()=>{});},specification.warm?120000:90000);
    await instrument(context,state,base,journal);
    page=await context.newPage();page.setDefaultTimeout(TIMEOUT);instrumentPage(page,state,journal);
    if(specification.warm)await warmHistory(page,base,directory,attempt);
    const response=await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded',timeout:TIMEOUT});
    assert(response?.ok(),'Client-navigation collection document must load');
    await coherentHead(page);
    if(specification.settled){
      await page.waitForLoadState('load',{timeout:TIMEOUT});
      await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:30000});
      await page.waitForTimeout(1000);
    }
    await activateOriginalPointer(page,attempt,{replaceAnchor:!!specification.fixture,
      checkpoint:value=>json(directory+'/checkpoint.json',{...value,events:state})});
  }catch(error){attempt.infrastructureError=errorValue(error);}
  finally{
    if(page){
      attempt.final=await snapshot(page);
      await screenshot(page,directory+'/final.png').catch(error=>{attempt.screenshotError=errorValue(error);});
      await writeFile(directory+'/final-body.txt',page.url()+'\n'+await page.locator('body').innerText().catch(()=>''));
    }
    if(context)await context.close().catch(()=>{});if(deadline)clearTimeout(deadline);
    await journalWrites;
    attempt.deadlineExceeded=expired;
    attempt.completedAt=now();attempt.events=state;
    await json(directory+'/attempt.json',attempt);
  }
  console.log('NAVIGATION_DIAGNOSTIC_CASE',JSON.stringify({name:attempt.name,guard:attempt.originalGuard?.passed,
    destinationReady:attempt.destinationContentReady,deadlineExceeded:attempt.deadlineExceeded,
    error:attempt.infrastructureError?.message,blockedCommerceRequests:state.blockedCommerceRequests.length}));
  return attempt;
}

async function replacementFixture(browser,output){
  const server=createServer((request,response)=>{
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
    response.writeHead(200,{'content-type':'text/html'});
    response.end(`<!doctype html><html><head><title>Fixture collection</title><meta name="description" content="Local recorder lifetime fixture">
    <style>body{margin:16px;font:16px sans-serif}h3{width:350px;overflow:hidden;white-space:nowrap}</style></head>
    <body><main><article><h3><a href="/products/diagnostic-product">Equivalent retained product link</a></h3></article></main>
    <script>document.addEventListener('click',event=>{const anchor=event.target.closest('main article h3 a');if(!anchor)return;
    event.preventDefault();history.pushState({},'',anchor.getAttribute('href'));document.querySelector('main').innerHTML='<h1>Fixture product</h1>';});</script></body></html>`);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
    const attempt=await runCase(browser,'http://127.0.0.1:'+server.address().port,output,{name:'local-equivalent-anchor-replacement',warm:false,settled:false,fixture:true});
    const events=attempt.events.domEvents;
    attempt.fixtureReproduced=attempt.destinationContentReady===true&&attempt.originalGuard?.recordPresent===false&&
      attempt.originalGuard.sameDocumentMarker===true&&attempt.originalGuard.sameTimeOrigin===true&&
      events.some(event=>event.kind==='recorder:ignored'&&event.originalConnected===false)&&
      events.some(event=>event.kind==='dom:click:capture'&&event.trusted===true&&event.clicked?.href===attempt.destination&&
        event.originalAnchor?.connected===false&&event.currentAnchor?.connected===true&&event.clickedIsCurrent===true&&event.currentIsOriginal===false)&&
      events.some(event=>event.kind==='dom:click:bubble'&&event.defaultPrevented===true);
    await json(output+'/'+attempt.name+'/attempt.json',attempt);
    return attempt;
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

export async function diagnoseNavigation(base,output){
  const target=new URL(base);
  assert.equal(target.href,'https://hidiindia.com/','Live diagnostic is pinned to the HIDI production origin');
  assert(process.env.HIDI_PLAYWRIGHT_MODULE,'HIDI_PLAYWRIGHT_MODULE is required');
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output,{recursive:true});
  const report={diagnostic:'Original Chromium390 pointer-recorder lifetime',base:target.origin,sourceSha:process.env.GITHUB_SHA??null,
    startedAt:now(),readOnly:true,liveWrites:0,unsafeRequestsAllowed:0,liveMetadataDifference:'Warm-up checks existing head coherence; it does not assert candidate SEO titles on the restored runtime.',attempts:[]};
  report.passedMeaning='All diagnostic cases completed, the local recorder control reproduced, and no commerce write was emitted; this does not mean the natural navigation guards all passed.';
  report.serviceWorkers='Blocked in fresh diagnostic contexts so every browser request is subject to the read-only routing policy.';
  let browser;
  try{
    browser=await pw.chromium.launch({headless:true});
    for(const specification of [
      {name:'warm-retained-1',warm:true,settled:false},
      {name:'warm-retained-2',warm:true,settled:false},
      {name:'warm-retained-3',warm:true,settled:false},
      {name:'settled-control',warm:false,settled:true},
    ]){
      report.attempts.push(await runCase(browser,target.origin,output,specification));
      await json(output+'/partial-report.json',report);
    }
    report.fixture=await replacementFixture(browser,output);
    const all=[...report.attempts,report.fixture];
    report.blockedCommerceRequests=all.flatMap(attempt=>attempt.events.blockedCommerceRequests);
    report.completedAt=now();
    report.completed=all.every(attempt=>!attempt.infrastructureError&&!attempt.deadlineExceeded);
    report.passed=report.completed&&report.fixture.fixtureReproduced===true&&report.blockedCommerceRequests.length===0;
  }catch(error){report.infrastructureError=errorValue(error);report.passed=false;}
  finally{if(browser)await browser.close();await json(output+'/report.json',report);}
  console.log('NAVIGATION_DIAGNOSTIC',JSON.stringify({passed:report.passed,fixtureReproduced:report.fixture?.fixtureReproduced,
    liveGuards:report.attempts.map(attempt=>({name:attempt.name,passed:attempt.originalGuard?.passed})),liveWrites:0}));
  assert(report.passed,'Read-only diagnostic must complete all cases, reproduce its local control, and emit no commerce writes');
  return report;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  await diagnoseNavigation(process.argv[2]||'https://hidiindia.com',process.argv[3]||'evidence/seo-navigation-diagnostics');
}
