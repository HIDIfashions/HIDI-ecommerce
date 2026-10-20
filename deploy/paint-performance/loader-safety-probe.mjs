import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port));});
const close=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
const sourceUrl=name=>new URL(name,import.meta.url);
const modulePath='/assets/index-loader-safety.js';
// Only the application's boot-once contract is needed here. Real loader files,
// modulepreload, CORS and SRI execute unchanged in each actual browser engine.
const moduleBytes='window.__LoaderEvaluations.push({url:import.meta.url,at:performance.now()});\nif(!window.__HidiAppStarted){window.__HidiAppStarted=true;window.__LoaderBoots++;if(window.__HidiFullCssReady)await window.__HidiFullCssReady;window.__LoaderHydrated++;}\n';
const integrity='sha256-'+createHash('sha256').update(moduleBytes).digest('base64');
const cases=[
 {name:'mobile-delayed-poster-healthy-primary',posterDelay:1200,primaryReadyAt:1800,expected:'primary'},
 {name:'mobile-streamed-head-healthy-primary',bodyDelay:1700,posterDelay:1200,primaryReadyAt:3500,expected:'primary'},
 {name:'desktop-delayed-preload-healthy-primary',width:1440,posterDelay:0,primaryReadyAt:1800,expected:'primary'},
 {name:'mobile-primary-stall',posterDelay:0,primaryReadyAt:2200,expected:'fallback'},
 {name:'mobile-primary-error',posterDelay:0,primaryError:true,expected:'fallback'},
 {name:'recovery-before-late-queued-start',posterDelay:0,queuedDelay:2100,primaryReadyAt:0,expected:'origin-only'},
 {name:'evaluated-module-waits-for-css',posterDelay:0,primaryReadyAt:50,holdCss:true,expected:'primary'}
];

export async function verifyLoaderSafety(pw,out,mode='candidate',options={}){
 const sources=options.sources||{mirror:await readFile(sourceUrl('asset-mirror-client.js'),'utf8'),start:await readFile(sourceUrl('app-start.js'),'utf8')};
 const results=[],label=options.label||mode;
 await mkdir(out,{recursive:true});
 for(const engine of options.engines||['chromium','firefox','webkit']){
  let browser;
  try{browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});}
  catch(error){for(const scenario of cases)results.push({engine,scenario:scenario.name,passed:false,error:'Browser launch failed: '+String(error)});continue;}
  try{for(const scenario of cases){
   const serverRequests=[],requests=[],errors=[],requestMap=new Map();let startedAt=0,origin,primary,releaseCss;
   const cssGate=new Promise(resolve=>releaseCss=resolve);
   const primaryServer=createServer(async(req,res)=>{
    const row={side:'primary',url:req.url,receivedAt:Date.now()-startedAt};serverRequests.push(row);
    if(req.url!==modulePath){res.writeHead(404);res.end();return;}
    await wait(Math.max(0,(scenario.primaryReadyAt||0)-(Date.now()-startedAt)));
    row.status=scenario.primaryError?503:200;row.respondedAt=Date.now()-startedAt;
    res.writeHead(row.status,{'Content-Type':'text/javascript','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(scenario.primaryError?'Controlled primary failure':moduleBytes);
   });
   const originServer=createServer(async(req,res)=>{
    const row={side:'origin',url:req.url,receivedAt:Date.now()-startedAt};serverRequests.push(row);
    if(req.url===modulePath){row.status=200;row.respondedAt=Date.now()-startedAt;res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(moduleBytes);return;}
    if(req.url==='/full.css'){await cssGate;row.status=200;row.respondedAt=Date.now()-startedAt;res.writeHead(200,{'Content-Type':'text/css','Cache-Control':'no-store'});res.end('body{color:rgb(1,2,3)}');return;}
    if(req.url!=='/'){res.writeHead(404);res.end();return;}
    startedAt=Date.now();row.receivedAt=0;
    const mirror=sources.mirror.replace('__HIDI_ASSET_MIRROR__',JSON.stringify({origin:primary,files:{[modulePath]:true}}));
    const header='<!doctype html><html><head><meta charset="utf-8"><script>window.__LoaderEvaluations=[];window.__LoaderBoots=0;window.__LoaderHydrated=0;</script><script>'+mirror.replaceAll('</script','<\\/script')+';window.__LoaderHeadAt=performance.now();</script><link rel="modulepreload" media="(min-width: 701px)" fetchpriority="low" data-hidi-desktop-preload="true" href="'+primary+modulePath+'" integrity="'+integrity+'" crossorigin="anonymous"></head>';
    const gate=scenario.holdCss?'window.__HidiFullCssReady=new Promise(resolve=>{setTimeout(()=>{const link=document.createElement("link");link.rel="stylesheet";link.href="/full.css";link.onload=()=>{window.__LoaderCssResolvedAt=performance.now();resolve();};document.head.append(link);},0);});':'';
    const setup='window.__LoaderBodyAt=performance.now();'+gate+'window.__HidiAvifSupport=Promise.resolve(true);window.__HidiNativePosterReady=new Promise(resolve=>setTimeout(()=>{window.__LoaderPosterReleasedAt=performance.now();resolve();},'+scenario.posterDelay+'));';
    const start=scenario.queuedDelay?'setTimeout(()=>{const script=document.createElement("script");script.textContent='+JSON.stringify(sources.start)+';document.body.append(script);},'+scenario.queuedDelay+');':sources.start;
    const body='<body><video data-hidi-first-hero="true" poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video><script>'+setup+'</script><script type="application/x-hidi-queued-module" crossorigin="anonymous" integrity="'+integrity+'" data-hidi-queued-src="'+primary+modulePath+'" data-hidi-mirror-app="'+modulePath+'" onerror="window.__HidiAppFallback()"></script><script>'+start.replaceAll('</script','<\\/script')+'</script></body></html>';
    row.status=200;res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.write(header);
    if(scenario.bodyDelay)await wait(scenario.bodyDelay);
    res.end(body);row.respondedAt=Date.now()-startedAt;
   });
   let context,page;
   try{
    primary=await listen(primaryServer);origin=await listen(originServer);
    context=await browser.newContext({viewport:{width:scenario.width||390,height:900}});page=await context.newPage();page.setDefaultTimeout(12000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',req=>{if(new URL(req.url()).pathname!==modulePath)return;const row={url:req.url(),resourceType:req.resourceType(),requestedAt:Date.now()-startedAt,timing:req.timing()};requests.push(row);requestMap.set(req,row);});
    page.on('response',response=>{const row=requestMap.get(response.request());if(row){row.status=response.status();row.responseAt=Date.now()-startedAt;}});
    page.on('requestfinished',req=>{const row=requestMap.get(req);if(row){row.finishedAt=Date.now()-startedAt;row.timing=req.timing();}});
    page.on('requestfailed',req=>{const row=requestMap.get(req);if(row){row.failedAt=Date.now()-startedAt;row.failure=req.failure();row.timing=req.timing();}});
    await page.route('**/*',route=>{const req=route.request(),url=new URL(req.url());return [origin,primary].includes(url.origin)&&req.method()==='GET'?route.continue():route.abort();});
    await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
    if(scenario.bodyDelay)assert(await page.evaluate(()=>window.__LoaderBodyAt-window.__LoaderHeadAt>=1600),'Streamed head must execute long enough before body to expire the original 1500ms head watchdog');
    const preload=await page.locator('link[rel="modulepreload"]').evaluate(link=>({href:link.href,media:link.media,integrity:link.integrity,crossOrigin:link.crossOrigin}));
    assert.equal(preload.href,primary+modulePath);assert.equal(preload.integrity,integrity);assert.equal(preload.crossOrigin,'anonymous');assert.equal(preload.media,'(min-width: 701px)');
    if(scenario.holdCss){
     await page.waitForFunction(()=>window.__HidiAppStarted===true);
     await wait(Math.max(0,1800-(Date.now()-startedAt)));
     assert.equal(await page.evaluate(()=>window.__LoaderHydrated),0,'An evaluated module must remain waiting for CSS without another app download');
     assert.equal(requests.length,1,'Evaluation, rather than hydration, must end the recovery watchdog');
     assert(serverRequests.some(row=>row.url==='/full.css'&&row.respondedAt===undefined),'The full stylesheet request must still be held');
     releaseCss();
    }
    await page.waitForFunction(()=>window.__LoaderHydrated===1);
    // Wait through the relevant recovery deadline and any late queued startup.
    const endAt=scenario.bodyDelay||scenario.width?4700:Math.max(2600,(scenario.primaryReadyAt||0)+100,(scenario.queuedDelay||0)+200);
    await wait(Math.max(0,endAt-(Date.now()-startedAt)));
    const state=await page.evaluate(()=>({appStarted:window.__HidiAppStarted,boots:window.__LoaderBoots,hydrated:window.__LoaderHydrated,evaluations:window.__LoaderEvaluations,headAt:window.__LoaderHeadAt,bodyAt:window.__LoaderBodyAt,cssResolvedAt:window.__LoaderCssResolvedAt,posterReleasedAt:window.__LoaderPosterReleasedAt,scripts:[...document.querySelectorAll('script[data-hidi-mirror-app],script[type="module"]')].map(script=>({type:script.type,src:script.src,queuedSrc:script.dataset.hidiQueuedSrc,integrity:script.integrity,crossOrigin:script.crossOrigin})),resources:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/assets/index-loader-safety.js')).map(entry=>({url:entry.name,startTime:entry.startTime,responseEnd:entry.responseEnd,initiatorType:entry.initiatorType}))}));
    assert.equal(state.boots,1,'Exactly one application initialization is allowed');assert.equal(state.hydrated,1);assert.deepEqual(errors,[]);
    if(scenario.width)assert(state.resources.some(resource=>resource.url===primary+modulePath&&resource.startTime<state.bodyAt+1000),'The desktop request must begin from preload before the 1500ms queued dispatch, then be reused by the module');
    const expected=scenario.expected==='fallback'?2:1;assert.equal(requests.length,expected,scenario.name+' must have exactly '+expected+' app request(s)');
    const urls=requests.map(row=>row.url);
    if(scenario.expected==='primary')assert.deepEqual(urls,[primary+modulePath],'A healthy primary must not race an origin copy');
    else if(scenario.expected==='origin-only')assert.deepEqual(urls,[origin+modulePath],'Origin recovery must prevent a late queued primary');
    else{assert.deepEqual(urls,[primary+modulePath,origin+modulePath]);assert.equal(requests[1].status,200);if(scenario.primaryError)assert.equal(requests[0].status,503);}
    results.push({engine,scenario:scenario.name,passed:true,preload,requests,serverRequests,state});
   }catch(error){
    const state=page?await page.evaluate(()=>({appStarted:window.__HidiAppStarted,boots:window.__LoaderBoots,hydrated:window.__LoaderHydrated,evaluations:window.__LoaderEvaluations,headAt:window.__LoaderHeadAt,bodyAt:window.__LoaderBodyAt,posterReleasedAt:window.__LoaderPosterReleasedAt,scripts:[...document.querySelectorAll('script[data-hidi-mirror-app],script[type="module"]')].map(script=>({type:script.type,src:script.src,queuedSrc:script.dataset.hidiQueuedSrc,integrity:script.integrity,crossOrigin:script.crossOrigin}))})).catch(()=>null):null;
    results.push({engine,scenario:scenario.name,passed:false,error:String(error),requests,serverRequests,errors,state});
   }finally{releaseCss();await context?.close();await close(primaryServer);await close(originServer);}
  }}finally{await browser.close();}
 }
 const report={passed:results.every(result=>result.passed),sources:{mirrorSha256:createHash('sha256').update(sources.mirror).digest('hex'),startSha256:createHash('sha256').update(sources.start).digest('hex')},moduleIntegrity:integrity,results};
 await writeFile(out+'/loader-safety-'+label+'.json',JSON.stringify(report,null,2));
 if(!options.reportOnly)assert(report.passed,'Loader safety failed: '+results.filter(result=>!result.passed).map(result=>result.engine+'/'+result.scenario+': '+result.error).join('; '));
 console.log((report.passed?'PASS':'FAIL')+': loader startup, genuine modulepreload reuse, stalled/error recovery, late queued startup and unresolved CSS; '+results.length+' browser cases');
 return report;
}
