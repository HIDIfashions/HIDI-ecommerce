import {inlinePosterPath} from './poster-reference.mjs';
import {verifyPosterTiers} from './poster-tiers.mjs';
import {verifyPosterCache} from './cache-probe.mjs';
import {verifyInitialCss} from './critical-probe.mjs';
import {readMirrorProof,isMirrorAsset,mirrorAssetUrl} from './asset-mirror.mjs';
import {verifyMirrorFallback} from './mirror-fallback-probe.mjs';
import {verifyLoaderSafety} from './loader-safety-probe.mjs';
import {observeFirstFrames,finishFirstFrames,assertFirstFrames} from './first-frame-probe.mjs';
import {createTransferTracker,requireInitialTransferParity,transferAssetIdentity} from './transfer-parity.mjs';
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {get} from 'node:http';import {get as getHttps} from 'node:https';import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {existsSync} from 'node:fs';import {createHash} from 'node:crypto';
const [base,mode='live']=process.argv.slice(2),OUT='evidence/paint-performance';await mkdir(OUT+'/'+mode,{recursive:true});
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),manifest=JSON.parse(await readFile(OUT+'/manifest.json','utf8'));
const baseline=mode==='baseline',rows=[];
// Baseline and candidate must use the same content-verified first-party asset
// route. Mirror failure and origin recovery are exercised independently.
const mirror=await readMirrorProof(OUT);assert(mirror,'A verified immutable asset route is required for comparable browser probes');
function observeLoaderNetwork(page){
 const network=[],appRequests=[],documents=[],requests=new Map();
 const appUrl=url=>{try{return /\/assets\/index-[^/]+\.js$/.test(new URL(url).pathname);}catch{return false;}};
 page.on('request',request=>{
  network.push(request.url());if(!appUrl(request.url()))return;
  const entry={url:request.url(),method:request.method(),resourceType:request.resourceType(),requestedAt:Date.now(),timing:request.timing()};requests.set(request,entry);appRequests.push(entry);
 });
 page.on('response',response=>{const headers=response.headers(),publicHeaders=Object.fromEntries(['cache-control','cf-cache-status','age','vary','link','content-type','access-control-allow-origin'].filter(name=>headers[name]!==undefined).map(name=>[name,headers[name]]));const entry=requests.get(response.request());if(entry){entry.status=response.status();entry.responseUrl=response.url();entry.responseAt=Date.now();entry.headers=publicHeaders;}if(response.request().resourceType()==='document')documents.push({url:response.url(),status:response.status(),headers:publicHeaders,timing:response.request().timing()});});
 page.on('requestfinished',request=>{const entry=requests.get(request);if(entry){entry.finishedAt=Date.now();entry.timing=request.timing();}});
 page.on('requestfailed',request=>{const entry=requests.get(request);if(entry){entry.failedAt=Date.now();entry.failure=request.failure();entry.timing=request.timing();}});
 return {network,appRequests,documents};
}
async function loaderFailureState(page){
 return page.evaluate(()=>({readyState:document.readyState,appStarted:Boolean(window.__HidiAppStarted),primaryDispatchHook:typeof window.__HidiStartPrimaryApp==='function',scripts:[...document.querySelectorAll('script[data-hidi-mirror-app],script[data-hidi-queued-src],script[type="module"]')].map(script=>({src:script.src,type:script.type,integrity:script.integrity,crossOrigin:script.crossOrigin,queuedSrc:script.dataset.hidiQueuedSrc,originSrc:script.dataset.hidiMirrorApp})),preloads:[...document.querySelectorAll('link[rel="modulepreload"]')].map(link=>({href:link.href,media:link.media,integrity:link.integrity,crossOrigin:link.crossOrigin,fetchPriority:link.fetchPriority})),appResources:performance.getEntriesByType('resource').filter(entry=>/\/assets\/index-[^/]+\.js(?:\?|$)/.test(entry.name)).map(entry=>({url:entry.name,initiatorType:entry.initiatorType,startTime:entry.startTime,responseEnd:entry.responseEnd,duration:entry.duration,transferSize:entry.transferSize}))})).catch(error=>({captureError:String(error)}));
}
async function verifyPriceHeaderLayout(page,label){
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const capture=()=>page.evaluate(()=>{const bar=document.querySelector('body>.hidi-price-announcement'),header=document.querySelector('#site-header.campaign-header'),hero=document.querySelector('section.hero');if(!bar||!header||!hero)return{passed:false,reason:'missing announcement, campaign header or hero'};const b=bar.getBoundingClientRect(),h=header.getBoundingClientRect(),r=hero.getBoundingClientRect(),style=getComputedStyle(header),vertical=Math.min(b.bottom,h.bottom)-Math.max(b.top,h.top),horizontal=Math.min(b.right,h.right)-Math.max(b.left,h.left);return{passed:b.width>0&&b.height>0&&h.width>0&&h.height>0&&(vertical<=1||horizontal<=1)&&document.documentElement.scrollWidth<=innerWidth+1,scrollY,markerCount:document.querySelectorAll('style[data-hidi-price-header-offset]').length,text:bar.textContent.trim(),bar:{x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom},header:{x:h.x,y:h.y,width:h.width,height:h.height,bottom:h.bottom,position:style.position,marginBottom:style.marginBottom},heroDocumentY:r.top+scrollY,intersection:{vertical,horizontal},overflow:document.documentElement.scrollWidth>innerWidth+1};});
 await page.evaluate(()=>scrollTo(0,0));await settle();const top=await capture();
 assert(top.passed,label+': invalid top layout '+JSON.stringify(top));assert.equal(top.markerCount,1,label+': one scoped header layout rule required');assert.equal(top.text,'15% off across HIDI · Prices already reduced · No code needed',label+': offer text changed');assert.equal(top.header.position,'sticky',label+': homepage header must be sticky while the verified offer is present');assert.equal(top.header.marginBottom,top.header.height<65?'-58px':'-72px',label+': hero clearance must exactly cancel the reviewed header height');assert(Math.abs(top.bar.y)<=1&&Math.abs(top.header.y-top.bar.bottom)<=1.5,label+': header must start immediately after the offer');
 const partialY=Math.max(1,Math.min(20,Math.floor(top.bar.height/2)));await page.evaluate(y=>scrollTo(0,y),partialY);await settle();const partial=await capture();
 assert(partial.passed,label+': invalid partial-scroll layout '+JSON.stringify(partial));assert(Math.abs(partial.header.y-Math.max(0,partial.bar.bottom))<=1.5,label+': header must track the visible offer edge');assert(Math.abs(partial.heroDocumentY-top.heroDocumentY)<=1.5,label+': partial scroll changed hero document position');
 const pastY=Math.ceil(top.bar.height)+20;await page.evaluate(y=>scrollTo(0,y),pastY);await settle();const past=await capture();
 assert(past.passed,label+': invalid past-offer layout '+JSON.stringify(past));assert(past.bar.bottom<=1&&Math.abs(past.header.y)<=1.5,label+': header must stick to the viewport after the offer scrolls away');assert(Math.abs(past.heroDocumentY-top.heroDocumentY)<=1.5,label+': scrolling changed hero document position');
 await page.evaluate(()=>scrollTo(0,0));await settle();const restored=await capture();assert(restored.passed&&Math.abs(restored.header.y-top.header.y)<=1.5,label+': top layout was not restored');
 return {passed:true,top,partial,past,restored};
}
// Independent evidence: do not use the application's poster-ready promise or
// success marker to prove the native frame painted before the video request.
async function observeNativePoster(page){
 await page.addInitScript(()=>{
  const capture=()=>{
   const video=window.__HidiProbeNativeVideo||document.querySelector('video[data-hidi-first-hero]');
   if(!video)return;
   window.__HidiProbeNativeVideo=video;
   if(video.poster&&!window.__HidiProbeNativePoster){window.__HidiProbeNativePoster=video.poster;mutation.disconnect();}
  };
  const mutation=new MutationObserver(capture);mutation.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['poster']});capture();
  try{new PerformanceObserver(list=>{
   for(const entry of list.getEntries())if(!window.__HidiProbeNativePaint&&entry.element===window.__HidiProbeNativeVideo&&entry.url===window.__HidiProbeNativePoster&&Number.isFinite(entry.renderTime)&&entry.renderTime>0){
    window.__HidiProbeNativePaint={renderTime:entry.renderTime,poster:entry.url,observedAt:performance.now()};
   }
  }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
 });
}
async function assertDesktopPosterBeforeVideo(page,label){
 await page.waitForFunction(()=>{
  const video=document.querySelector('video.hero-live-media');
  return video?.readyState>=2&&performance.getEntriesByType('resource').some(entry=>entry.name===video.currentSrc);
 });
 const proof=await page.evaluate(()=>{
  const video=document.querySelector('video.hero-live-media'),resources=performance.getEntriesByType('resource');
  const media=resources.filter(entry=>entry.name===video.currentSrc).sort((a,b)=>a.startTime-b.startTime)[0];
  return {nativeSeen:Boolean(window.__HidiProbeNativeVideo),sameNode:video===window.__HidiProbeNativeVideo,paint:window.__HidiProbeNativePaint||null,poster:video.poster,media:{url:media.name,startTime:media.startTime},styles:[...document.querySelectorAll('link[data-hidi-deferred-style]')].map(link=>{
   const resource=resources.filter(entry=>entry.name===link.href).sort((a,b)=>b.responseEnd-a.responseEnd)[0];
   return {url:link.href,priority:link.fetchPriority,applied:link.media==='all'&&Boolean(link.sheet),startTime:resource?.startTime??null,responseEnd:resource?.responseEnd??null};
  })};
 });
 assert(proof.nativeSeen&&proof.sameNode,label+': the actual native video must survive hydration');
 assert(proof.paint?.renderTime>0,label+': an independent native-poster LCP with a positive renderTime is required');
 assert.equal(proof.paint.poster,proof.poster,label+': the painted poster must match the retained video');
 assert(proof.media.startTime>=proof.paint.renderTime,label+': video download must start after actual native poster paint on the same browser clock');
 assert(proof.styles.length>0&&proof.styles.every(style=>style.applied&&style.responseEnd>0&&style.responseEnd<=proof.media.startTime),label+': every complete stylesheet must finish before automatic video download');
 assert(proof.styles.every(style=>style.priority==='high'&&style.startTime>=proof.paint.renderTime),label+': promoted desktop CSS must start only after independently observed native poster paint');
 return proof;
}
async function verifyDesktopVideoSafety(browser){
 const results=[];
 for(const scenario of ['full-css-held','reduced-motion','data-saving']){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:scenario==='reduced-motion'?'reduce':'no-preference'}),page=await context.newPage();page.setDefaultTimeout(45000);
  const media=[],heldCss=[],errors=[],loaderNetwork=observeLoaderNetwork(page);let releaseCss;
  const cssGate=new Promise(resolve=>releaseCss=resolve);
  page.on('request',req=>{if(req.resourceType()==='media')media.push(req.url());});page.on('pageerror',error=>errors.push(error.message));
  await observeNativePoster(page);
  if(scenario==='data-saving')await page.addInitScript(()=>{
   if(navigator.connection)Object.defineProperty(navigator.connection,'saveData',{get:()=>true});
   else Object.defineProperty(navigator,'connection',{value:{saveData:true}});
  });
  try{
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==new URL(base).origin&&!isMirrorAsset(url.href,mirror)||!['GET','HEAD'].includes(req.method()))return route.abort();
    if(scenario==='full-css-held'&&url.pathname.endsWith('.css')){heldCss.push(url.href);await cssGate;}
    return route.continue();
   });
   assert.equal((await page.goto(base+'/',{waitUntil:'commit'})).status(),200);
   await page.waitForFunction(()=>window.__HidiAppStarted&&window.__HidiProbeNativePaint?.renderTime>0);
   assert(await page.evaluate(()=>typeof document.body.moveBefore==='function'),'Desktop safety probe requires Chromium native-node retention support');
   if(scenario==='full-css-held'){
    await page.waitForFunction(()=>[...document.querySelectorAll('link[data-hidi-deferred-style]')].some(link=>Boolean(link.href)));
    // Cross the normal desktop delay and mirror CSS recovery deadline while
    // both original and mirrored complete styles remain held at the network.
    await page.waitForTimeout(1800);
    const held=await page.evaluate(()=>({native:document.querySelector('video[data-hidi-first-hero]')===window.__HidiProbeNativeVideo,src:document.querySelector('video.hero-live-media')?.getAttribute('src'),pending:[...document.querySelectorAll('link[data-hidi-deferred-style]')].some(link=>!link.sheet||link.media!=='all')}));
    assert(heldCss.length>0&&held.pending,'Held CSS scenario must have an actual pending complete stylesheet');
    assert(held.native,'Hydration must retain the native poster while complete CSS is held');
    assert.equal(held.src,null,'Desktop video must have no source while complete CSS is held');
    assert.deepEqual(media,[],'Desktop video must not download before complete CSS is released');
    releaseCss();
   }
   await page.waitForFunction(()=>document.querySelector('.hero-media')?.dataset.heroConfigStatus==='uploaded'&&!document.querySelector('video[data-hidi-first-hero]'));
   let manualAt=null;
   if(scenario!=='full-css-held'){
    assert(await page.evaluate(kind=>kind==='reduced-motion'?matchMedia('(prefers-reduced-motion: reduce)').matches:navigator.connection?.saveData===true,scenario),'Requested desktop preference must be active');
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('video.hero-live-media').getAttribute('src'),null,'Desktop '+scenario+' must prevent automatic video downloads');
    assert.deepEqual(media,[],'Desktop '+scenario+' must issue no automatic media request');
    manualAt=await page.evaluate(()=>performance.now());
    await page.getByRole('button',{name:'Turn video sound on'}).click();
    await page.waitForFunction(()=>{const video=document.querySelector('video.hero-live-media');return video?.readyState>=2&&!video.muted&&!video.paused;});
   }else await page.waitForFunction(()=>{const video=document.querySelector('video.hero-live-media');return video?.readyState>=2&&!video.paused&&video.currentTime>0;});
   const paint=await assertDesktopPosterBeforeVideo(page,'Desktop '+scenario);
   if(manualAt!==null){assert(paint.media.startTime>=manualAt,'Preference override may download video only after explicit user interaction');await page.getByRole('button',{name:'Mute video sound'}).click();await page.waitForFunction(()=>document.querySelector('video.hero-live-media').muted);}
   assert.deepEqual(errors,[]);
   results.push({scenario,passed:true,heldCss,manualAt,media,paint});
  }catch(error){
   await page.screenshot({path:OUT+'/'+mode+'/desktop-'+scenario+'-failure.png'}).catch(()=>{});
   await writeFile(OUT+'/'+mode+'/desktop-'+scenario+'-failure.json',JSON.stringify({error:String(error),media,heldCss,errors,...loaderNetwork,loader:await loaderFailureState(page)}));throw error;
  }finally{releaseCss();await context.close();}
 }
 await writeFile(OUT+'/desktop-video-safety-'+mode+'.json',JSON.stringify({passed:true,results},null,2));
 console.log('PASS: desktop video waits for actual native poster paint and complete CSS; reduced-motion/data-saving require explicit playback');
 return results;
}
const request=(path,headers={})=>new Promise((resolve,reject)=>{const u=new URL(path,base);(u.protocol==='https:'?getHttps:get)(u,{headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject);});
if(!baseline){
 const patch=JSON.parse(await readFile(OUT+'/patch.json','utf8'));
 if(patch.seoHomeDiscoveryPreserved){const initial=(await request('/')).body.toString();assert(initial.includes('data-hidi-home-discovery'),'Current SEO discovery must remain in initial HTML');assert(initial.includes('href="/guides"'),'Current buying guide link must remain discoverable');assert.equal((initial.match(/<h1\b/gi)||[]).length,1,'Native hero and discovery must retain one primary heading');}
 const report=JSON.parse(await readFile(OUT+'/patch.json','utf8'));
 const originalPricing=await request('/pricing-assets/storefront.mjs',{'accept-encoding':'identity'});assert.equal(originalPricing.status,200);assert.equal(createHash('sha256').update(originalPricing.body).digest('hex'),report.globalPricingSourceSha256,'Global commerce pricing script must stay byte-identical');
 const encodedAsset=JSON.parse(await readFile(OUT+'/static-encoding-quality.json','utf8'));
 const icons=JSON.parse(await readFile(OUT+'/icon-quality.json','utf8'));
 for(const frame of icons.frames.filter(frame=>frame.width<=64)){const r=await request(frame.url);assert.equal(r.status,200);assert.match(r.headers['content-type'],/image\/png/);assert.match(r.headers['cache-control'],/immutable/);assert.equal(createHash('sha256').update(r.body).digest('hex'),frame.sha256);}
 const legacy=await request(icons.source);assert.equal(legacy.status,200);assert.equal(createHash('sha256').update(legacy.body).digest('hex'),icons.originalSha256,'Original multisize icon must remain intact');
 const home=await request('/'),homeText=home.body.toString();assert(!/rel="shortcut icon"[^>]*href="[^"]+\.ico/.test(homeText),'Browser tab should use the exact sized PNG frame');assert(homeText.includes('data-hidi-first-header'));assert(homeText.includes('data-hidi-first-hero="true"'),'Current supported hero must be present in initial HTML');assert(homeText.includes('data-hidi-inline-css'));assert(homeText.includes('src="'+mirrorAssetUrl('/'+report.bundle,mirror)+'"'),'Exact verified application URL must be present');assert(homeText.includes('data-hidi-desktop-preload="true"'));assert(homeText.includes('data-hidi-app-start="true"'));assert(homeText.includes('data-hidi-inline-script="/config.js"'));assert(homeText.includes('data-hidi-early-hero'));if(!baseline)assert.equal((homeText.match(/data-hidi-price-header-offset/g)||[]).length,1,'Homepage must contain one scoped pre-paint price/header layout rule');
 await verifyPosterTiers(pw,home.body.toString(),manifest,OUT,mode);
 const headAssets=JSON.parse(await readFile(OUT+'/head-assets-quality.json','utf8'));
 for(const asset of [headAssets.logo,headAssets.seo,headAssets.countdown].filter(Boolean)){const r=await request(asset.url,{'accept-encoding':'identity'});assert.equal(r.status,200);assert.equal(createHash('sha256').update(r.body).digest('hex'),asset.sha256,'Prepared head assets must retain their reviewed bytes');assert.match(r.headers['content-type'],asset===headAssets.logo?/image\/png/:/(?:java|ecma)script/);}
 if(headAssets.countdown){const original=await request('/hidi-launch-countdown-20261011.js',{'accept-encoding':'identity'});assert.equal(original.status,200);assert.equal(createHash('sha256').update(original.body.toString().replace(/\r\n/g,'\n')).digest('hex'),headAssets.countdown.sourceSha256,'Original countdown source must remain byte-equivalent');assert(home.body.toString().includes('src="'+headAssets.countdown.url+'"'),'Homepage must use only the reviewed hashed countdown copy');}
 assert(home.body.toString().includes('src="'+headAssets.logo.url+'"'),'Native logo must reuse the exact verified immutable PNG');assert(headAssets.logo.allRgbaPixelsIdentical);
 // The wrapper injects identity metadata only for its production host. The
 // separate pinned public-host fixture always requires this exact asset.
 if(headAssets.seo&&(!['127.0.0.1','localhost'].includes(new URL(base).hostname)||home.body.toString().includes('data-hidi-seo-identity')))assert(home.body.toString().includes('defer src="'+headAssets.seo.url+'"'),'Exact SEO code must load independently of HTML');
 const encodedHome=await request('/',{'accept-encoding':'br'});assert.equal(encodedHome.headers['content-encoding'],'br');if(!baseline)assert(encodedHome.body.length<=14600,'Brotli homepage exceeded the guarded initial delivery window: '+encodedHome.body.length);await writeFile(OUT+'/document-delivery-'+mode+'.json',JSON.stringify({passed:true,brotliHtmlBytes:encodedHome.body.length,maximumBrotliHtmlBytes:14600,fullStylesIndependent:true,seoCodeUnchanged:true,logoPixelsUnchanged:headAssets.logo.allRgbaPixelsIdentical}));
 for(const path of ['/'+report.bundle,'/assets/index-yOknTVcM.css','/api/store/products']){
  const plain=await request(path,{'accept-encoding':'identity'});assert.equal(plain.status,200,path);
  for(const encoding of ['br','gzip']){const r=await request(path,{'accept-encoding':encoding});assert.equal(r.status,200);assert.equal(r.headers['content-encoding'],encoding,path);assert.match(r.headers.vary,/Accept-Encoding/i);const decoded=encoding==='br'?brotliDecompressSync(r.body):gunzipSync(r.body);if(mode==='live'&&path.startsWith('/api/'))assert(Array.isArray(JSON.parse(decoded)));else assert.deepEqual(decoded,plain.body);assert(r.body.length<plain.body.length*.7,path+' should compress');if(path===encodedAsset.url){assert.equal(r.body.length,encodedAsset.encodings[encoding].bytes);assert.equal(createHash('sha256').update(r.body).digest('hex'),encodedAsset.encodings[encoding].sha256,'Prepared representation must be used without recompression');}}
  if(path.startsWith('/api/'))assert.match(plain.headers['cache-control'],/no-store/);
 }
 for(const item of Object.values(manifest.videos))for(const variant of [item.mobile,item.desktop]){
  const poster=await request(variant.avifPoster);assert.equal(poster.status,200);assert.match(poster.headers['content-type'],/image\/avif/);assert.match(poster.headers['cache-control'],/immutable/);
  for(const mediaUrl of [variant.url,variant.av1Url].filter(Boolean)){
  const r=await request(mediaUrl,{range:'bytes=0-63'});assert.equal(r.status,206);assert.equal(r.body.length,64);assert.match(r.headers['cache-control'],/immutable/);assert(!r.headers['content-encoding']);
  const suffix=await request(mediaUrl,{range:'bytes=-64'});assert.equal(suffix.status,206);assert.equal(suffix.body.length,64);
  }
 }
}
for(const engine of baseline?['chromium']:['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
 try{for(const width of engine==='chromium'?[320,390,768,1001,1440]:[390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,...(engine==='chromium'&&width<=700?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'}:{}),reducedMotion:engine==='chromium'?'no-preference':'reduce'}),page=await context.newPage();page.setDefaultTimeout(45000);
   const errors=[],network=[],media=[],appPriorities=[],stylePriorities=[],loaderNetwork=observeLoaderNetwork(page),transfer=createTransferTracker();let firstFrames=null,forceEmptyCatalogue=false;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{network.push(r.url());if(r.resourceType()==='media')media.push(r.url());});
   if(engine==='chromium'){const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');cdp.on('Network.loadingFinished',e=>transfer.loadingFinished(e));cdp.on('Network.requestWillBeSent',e=>{transfer.requestStarted(e);try{const u=new URL(e.request.url);if(u.pathname.includes('/assets/index-')&&u.pathname.endsWith('.js'))appPriorities.push({url:e.request.url,initialPriority:e.request.initialPriority||null});if(e.type==='Stylesheet')stylePriorities.push({url:e.request.url,initialPriority:e.request.initialPriority||null});}catch{}});}
   await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==new URL(base).origin&&!isMirrorAsset(u.href,mirror)||!['GET','HEAD'].includes(r.method()))return route.abort();if(forceEmptyCatalogue&&u.origin===new URL(base).origin&&u.pathname==='/api/store/products')return route.fulfill({status:200,contentType:'application/json',body:'[]'});return route.continue();});
  if(!baseline){await observeNativePoster(page);await observeFirstFrames(page);}
  await page.addInitScript(()=>{window.__lcp=0;window.__cls=0;try{new PerformanceObserver(l=>window.__lcp=l.getEntries().at(-1).startTime).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__cls+=e.value;})).observe({type:'layout-shift',buffered:true});}catch{}});
  try{
   assert.equal((await page.goto(base+'/',{waitUntil:'domcontentloaded'})).status(),200);
   await page.waitForFunction(()=>document.querySelector('.hero-media')?.dataset.heroConfigStatus==='uploaded');
   const video=page.locator('video.hero-live-media');await video.waitFor({state:'attached'});
   if(!baseline)await page.waitForFunction(()=>window.__HidiAppStarted&&!document.querySelector('video[data-hidi-first-hero]'));
   if(engine==='chromium')await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.readyState>=2&&v.videoWidth>0;});
   else await page.waitForFunction(()=>!!document.querySelector('video.hero-live-media')?.poster);
   await page.waitForTimeout(2500);
   if(!baseline){firstFrames=await finishFirstFrames(page);assertFirstFrames(firstFrames,mode+'/'+engine+'/'+width);}
   const headerLayout=!baseline?await verifyPriceHeaderLayout(page,mode+'/'+engine+'/'+width):null;
   if(!baseline){const retention=await page.evaluate(()=>({eligible:!matchMedia('(max-width: 700px)').matches&&typeof document.body.moveBefore==='function',nativeSeen:Boolean(window.__HidiProbeNativeVideo),sameNode:window.__HidiProbeNativeVideo===document.querySelector('video.hero-live-media')}));if(retention.eligible)assert(retention.nativeSeen&&retention.sameNode,'Supported desktop browsers must retain the actual painted native video node');}
   const initial=await page.evaluate(()=>({lcp:window.__lcp,cls:window.__cls,retentionEligible:!matchMedia('(max-width: 700px)').matches&&typeof document.body.moveBefore==='function',retainedNativeVideo:window.__HidiProbeNativeVideo===document.querySelector('video.hero-live-media'),video:{src:document.querySelector('video.hero-live-media').currentSrc,poster:document.querySelector('video.hero-live-media').poster,width:document.querySelector('video.hero-live-media').videoWidth},overflow:document.documentElement.scrollWidth>innerWidth+1}));
    const transferSnapshot=transfer.snapshot(),initialBytes=transferSnapshot.totalBytes,initialNonMediaBytes=transferSnapshot.nonMediaBytes,initialMediaBytes=transferSnapshot.mediaBytes,initialRequests=[...network],verifiedAppPaths=Object.keys(mirror.files).filter(path=>/^\/assets\/index-[a-f0-9]{16}\.js$/.test(path));assert.equal(verifiedAppPaths.length,1,'One proof-listed application bundle required');assert.deepEqual(initialRequests.filter(url=>/^\/assets\/index-[^/]+\.js$/.test(new URL(url).pathname)),[mirrorAssetUrl(verifiedAppPaths[0],mirror)],'Baseline and candidate must each use the exact verified application route once');if(!baseline){const scope=JSON.parse(await readFile(OUT+'/patch.json','utf8'));assert(!initialRequests.some(u=>new URL(u).pathname==='/pricing-assets/storefront.mjs'),'Home must use its scoped loader without replacing the global commerce script');assert.equal(initialRequests.filter(u=>new URL(u).pathname==='/'+scope.homePricingBundle).length,1);}if(!baseline)assert.equal(initialRequests.filter(u=>new URL(u).pathname==='/api/store/products').length,1,'One fresh initial catalogue request must be reused by the offer script');if(!baseline&&engine==='chromium')assert(!initialRequests.some(u=>new URL(u).pathname.endsWith('.ico')),'Normal browser tab must use the exact small PNG frame');if(!baseline&&engine==='chromium'){assert(!initialRequests.some(u=>u.includes(width<=700?'poster-1920.webp':'poster-1280.webp')),'Only the matching responsive poster should download');}assert(!initial.overflow);if(!baseline){assert.equal(initialRequests.filter(u=>new URL(u).pathname==='/api/hidi/hero-config').length,1,'Early hero request must be reused');assert.equal(initialRequests.filter(u=>new URL(u).pathname==='/api/hidi/landing-media-config').length,1,'Early landing selection must be reused');assert(!initialRequests.some(u=>new URL(u).pathname==='/config.js'),'Config must not block on another request');assert.equal(initialRequests.filter(u=>u.includes('/assets/index-')&&u.endsWith('.js')).length,1,'App preload and module should reuse one request');assert(!initialRequests.some(u=>u.includes('/ananya-portraits/')),'Off-screen original portraits must not download');}
   if(!baseline){assert(initial.video.poster.includes('/media-performance/assets/')||inlinePosterPath(initial.video.poster,mirror),'Poster must be a verified external or exact inline asset'); if(engine==='chromium'){assert(initial.video.poster.endsWith('.avif')||inlinePosterPath(initial.video.poster,mirror));const expectedVariant=Object.values(manifest.videos)[0][width<=700?'mobile':'desktop'];const smallTier=await page.evaluate(()=>{const video=document.querySelector('video.hero-live-media'),rect=video.getBoundingClientRect();const mobile=matchMedia('(max-width: 700px)').matches;return (mobile?matchMedia('(max-width: 432px) and (min-height: 760px)').matches:matchMedia('(min-width: 701px) and (max-aspect-ratio: 40/27)').matches)&&getComputedStyle(video).objectPosition==='50% 50%'&&rect.width/rect.height<=(mobile?512/720:1600/1080);});const expected=smallTier&&expectedVariant.avifPosterSmall?expectedVariant.avifPosterSmall:expectedVariant.avifPoster;const inline=inlinePosterPath(initial.video.poster,mirror);assert.equal(inline||new URL(initial.video.poster,base).pathname,expected);assert.equal(initialRequests.filter(u=>new URL(u).pathname===expected).length,inline?0:1,'Inline bytes need no request; external preload and both hero renderers must reuse one request');const wrong=Object.values(manifest.videos)[0][width<=700?'desktop':'mobile'].avifPoster;assert(!initialRequests.some(u=>new URL(u).pathname===wrong),'Only matching AVIF poster should download');assert(!initialRequests.some(u=>/poster-.*\.webp/.test(u)),'Modern browser should avoid duplicate WebP poster');}if(engine==='chromium'){assert(initial.video.src.includes('/media-performance/assets/'));assert.equal(initial.video.width,width<=700?1280:1920);assert.equal(new URL(initial.video.src).pathname,Object.values(manifest.videos)[0][width<=700?'mobile':'desktop'].av1Url,'Responsive AV1 must decode successfully');assert(initialBytes<(width<=700?7:11)*1024*1024,'Initial transfer budget');}assert(!media.some(u=>u.includes('/api/hidi/hero-asset/')),'Original video should not be downloaded');}
   if(!baseline&&engine==='chromium'&&width>700){assert.equal(appPriorities.length,1,'Desktop application must have one network request');assert.equal(appPriorities[0].initialPriority,'Low','Desktop application preload must be observed at Low priority');if(initial.retentionEligible){initial.desktopPaint=await assertDesktopPosterBeforeVideo(page,'Chromium '+width);for(const style of initial.desktopPaint.styles){const requests=stylePriorities.filter(row=>row.url===style.url);assert.equal(requests.length,1,'Each complete stylesheet must issue one observed browser request');assert.equal(requests[0].initialPriority,'High','Complete desktop CSS must actually dispatch at High after native poster paint');}}}
   const sound=page.getByRole('button',{name:'Turn video sound on'});await sound.waitFor();
   if(engine==='chromium'){
    await sound.click();await page.waitForFunction(()=>!document.querySelector('video.hero-live-media').muted);await page.getByRole('button',{name:'Mute video sound'}).click();await page.waitForFunction(()=>document.querySelector('video.hero-live-media').muted);
   }
   await page.addStyleTag({content:'*,*::before,*::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; }'});
   const height=await page.evaluate(()=>document.documentElement.scrollHeight);
   for(let y=0;y<height;y+=600){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(250);await page.waitForFunction(()=>[...document.querySelectorAll('main img')].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;}).every(i=>i.complete&&i.naturalWidth>1&&!i.currentSrc.startsWith('data:')));}
   await page.waitForTimeout(1500);await page.evaluate(()=>scrollTo(0,0));
   if(engine==='chromium')await video.evaluate(async v=>{v.pause();v.currentTime=1;await new Promise(done=>{if(v.readyState>=2)setTimeout(done,200);else v.addEventListener('seeked',done,{once:true});});});
   const geometry=await page.evaluate(()=>[...document.querySelectorAll('#site-header, main > section, .hero-sound-toggle, .campaign-shop-button, .hidi-collection-card, footer')].map((el,index)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{index,tag:el.tagName,id:el.id,cls:el.className,x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontFamily,color:s.color,background:s.backgroundColor};}));
   const photos=await page.locator('main img').evaluateAll(imgs=>imgs.filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.right>0&&r.left<innerWidth;}).map(i=>({original:i.dataset.hidiOriginalSrc||i.src,src:i.currentSrc,loaded:i.complete&&i.naturalWidth>1,fit:getComputedStyle(i).objectFit,position:getComputedStyle(i).objectPosition})));
   assert(photos.every(i=>i.loaded),'All homepage photographs must decode after scrolling');assert.deepEqual(errors,[]);
   if(!baseline&&engine==='chromium'){const section=page.locator('#meet-hidi');await section.scrollIntoViewIfNeeded();const choices=section.locator('.portrait-gallery__preview');for(let i=0;i<await choices.count();i++){await choices.nth(i).click();await page.waitForFunction(()=>document.querySelector('.portrait-gallery__portrait')?.dataset.photoReady==='true'||document.querySelector('.portrait-gallery__portrait')?.naturalWidth>1);assert.equal(await choices.nth(i).getAttribute('aria-pressed'),'true');}await choices.first().click();await page.evaluate(()=>scrollTo(0,0));}
   await page.screenshot({path:OUT+'/'+mode+'/'+engine+'-'+width+'.png',fullPage:true});
   let cleanup=null;if(!baseline&&width===390){const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/store/products'&&response.status()===200);forceEmptyCatalogue=true;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await refreshed;await page.waitForFunction(()=>!document.querySelector('[data-hidi-price-announcement]'));cleanup=await page.evaluate(()=>{const header=document.querySelector('#site-header.campaign-header'),r=header?.getBoundingClientRect(),style=header?getComputedStyle(header):null;return{passed:Boolean(header&&r.width>0&&r.height>0&&Math.abs(r.top)<=1.5&&document.documentElement.scrollWidth<=innerWidth+1),announcementCount:document.querySelectorAll('[data-hidi-price-announcement]').length,header:r?{x:r.x,y:r.y,width:r.width,height:r.height,position:style.position}:null,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert(cleanup.passed&&cleanup.announcementCount===0,mode+'/'+engine+'/'+width+': campaign-off cleanup failed '+JSON.stringify(cleanup));assert.deepEqual(errors,[]);}
    rows.push({engine,width,passed:true,initialBytes,initialNonMediaBytes,initialMediaBytes,initialRequests,appPriorities,stylePriorities,firstFrames,headerLayout,cleanup,initial,geometry,photos});
  }catch(error){if(!baseline&&!firstFrames)firstFrames=await finishFirstFrames(page).catch(()=>null);await page.screenshot({path:OUT+'/'+mode+'/'+engine+'-'+width+'-failure.png',fullPage:true}).catch(()=>{});await writeFile(OUT+'/'+mode+'/'+engine+'-'+width+'-failure.json',JSON.stringify({error:String(error),errors,media,appPriorities,stylePriorities,firstFrames,...loaderNetwork,loader:await loaderFailureState(page),hero:await page.locator('.hero-media').evaluate(el=>el.outerHTML).catch(()=>null)}));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
if(!baseline&&mode==='candidate'){
 const before=JSON.parse(await readFile(OUT+'/baseline.json','utf8'));
 const transferEvidence=rows.filter(row=>row.engine==='chromium').map(row=>{const original=before.results.find(item=>item.width===row.width),poster=value=>value?.startsWith('data:')?{inline:true,sha256:createHash('sha256').update(value).digest('hex')}:{inline:false,identity:transferAssetIdentity(value)};return{width:row.width,baseline:{totalBytes:original?.initialBytes,nonMediaBytes:original?.initialNonMediaBytes,mediaBytes:original?.initialMediaBytes,video:transferAssetIdentity(original?.initial?.video?.src),poster:poster(original?.initial?.video?.poster)},candidate:{totalBytes:row.initialBytes,nonMediaBytes:row.initialNonMediaBytes,mediaBytes:row.initialMediaBytes,video:transferAssetIdentity(row.initial?.video?.src),poster:poster(row.initial?.video?.poster)}};});
 await writeFile(OUT+'/transfer-comparison.json',JSON.stringify({passed:false,relativeNonMediaCeiling:1.02,absoluteTotalBudgetsMiB:{mobile:7,desktop:11},results:transferEvidence},null,2));
 for(const row of rows.filter(r=>r.engine==='chromium')){
   const original=before.results.find(r=>r.width===row.width);requireInitialTransferParity(row,original,row.width);
  assert.equal(row.geometry.length,original.geometry.length);for(let i=0;i<row.geometry.length;i++){const a=original.geometry[i],b=row.geometry[i],header=b.id==='site-header';for(const key of ['x','y','width','height']){if(header&&key==='y'){assert(Math.abs(a.y)<=1.5,'Baseline must retain the independently observed overlap at '+row.width);assert(Math.abs(b.y-row.headerLayout.restored.header.y)<=1.5,'Only the reviewed header offset may change at '+row.width);continue;}assert(Math.abs(a[key]-b[key])<=1.5,'Layout changed: '+key+' '+a.cls+' at '+row.width);}for(const key of ['font','color','background'])assert.equal(a[key],b[key],a.cls+' '+key);}
 }
 await writeFile(OUT+'/transfer-comparison.json',JSON.stringify({passed:true,relativeNonMediaCeiling:1.02,absoluteTotalBudgetsMiB:{mobile:7,desktop:11},results:transferEvidence},null,2));
 await writeFile(OUT+'/visual-comparison.json',JSON.stringify({passed:true,widths:[320,390,768,1001,1440],intendedChange:'Homepage header starts immediately below the verified price announcement and sticks at the viewport after the announcement scrolls away',unchanged:'hero and section geometry, typography, colours, button positions and selected uploads'}));
}
if(!baseline&&mode==='candidate'){
 const browser=await pw.chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
 try{for(const scenario of ['codec-failure','unsupported','reduced-motion','data-saving','initial-selection']){
  const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:scenario==='reduced-motion'?'reduce':'no-preference'}),page=await context.newPage();page.setDefaultTimeout(45000);
  const loaderNetwork=observeLoaderNetwork(page);let releaseInitial;
  try{
  if(scenario==='unsupported')await page.addInitScript(()=>{const native=HTMLMediaElement.prototype.canPlayType;HTMLMediaElement.prototype.canPlayType=function(type){return type.includes('av01')?'':native.call(this,type);};});
  if(scenario==='data-saving')await page.addInitScript(()=>{if(navigator.connection)Object.defineProperty(navigator.connection,'saveData',{get:()=>true});});
  let catalogueReads=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/store/products')catalogueReads++;});
  const initialGate=new Promise(resolve=>{releaseInitial=resolve;});
  await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==new URL(base).origin&&!isMirrorAsset(u.href,mirror)||!['GET','HEAD'].includes(r.method()))return route.abort();if(scenario==='initial-selection'&&u.pathname==='/api/hidi/hero-config'){const response=await route.fetch();const value=await response.json();value.mobilePosition='35% 65%';if(value.items?.length)value.items[0].mobilePosition='35% 65%';await initialGate;return route.fulfill({response,json:value});}if(scenario==='codec-failure'&&u.pathname.includes('/hero-av1-'))return route.fulfill({status:500,body:'Controlled codec fallback test'});return route.continue();});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('.hero-media')?.dataset.heroConfigStatus==='uploaded'&&!document.querySelector('video[data-hidi-first-hero]'));
  if(scenario==='initial-selection'){assert.equal(await page.evaluate(()=>window.__HidiHeroInitial),null,'Initial snapshot must be cleared after first mount');assert(await page.locator('video.hero-live-media').getAttribute('poster'));releaseInitial();await page.waitForFunction(()=>document.querySelector('video.hero-live-media')?.style.getPropertyValue('--hero-position-mobile')==='35% 65%');await page.waitForLoadState('load');assert.equal(catalogueReads,1);for(const resume of ['pageshow','visibility']){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/store/products');await page.evaluate(type=>{if(type==='pageshow')dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));else document.dispatchEvent(new Event('visibilitychange'));},resume);await response;await page.waitForTimeout(100);}assert.equal(catalogueReads,3,'Returning to the page and becoming visible must still read fresh prices');}
  if(['codec-failure','unsupported'].includes(scenario)){
   await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.readyState>=2;});
   assert.equal(new URL(await page.locator('video.hero-live-media').evaluate(v=>v.currentSrc)).pathname,Object.values(manifest.videos)[0].mobile.url);
  }else if(['reduced-motion','data-saving'].includes(scenario)){await page.waitForTimeout(1500);assert.equal(await page.locator('video.hero-live-media').evaluate(v=>v.getAttribute('src')),null,'Motion and data preferences must prevent automatic video downloads');}
  await page.getByRole('button',{name:'Turn video sound on'}).click();await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.readyState>=2&&!v.muted;});
  }catch(error){await writeFile(OUT+'/'+mode+'/'+scenario+'-failure.json',JSON.stringify({error:String(error),...loaderNetwork,loader:await loaderFailureState(page)}));throw error;}finally{releaseInitial?.();await context.close();}
 }await verifyDesktopVideoSafety(browser);}finally{await browser.close();}
 await verifyLoaderSafety(pw,OUT,mode);
 await writeFile(OUT+'/fallback-safety.json',JSON.stringify({passed:true,codecFailure:true,unsupportedCodec:true,reducedMotion:true,dataSaving:true,manualSound:true,initialSelectionReuse:true,freshSelectionUpdate:true,catalogueRequestReuse:true,catalogueResumeFreshness:true}));
 console.log('PASS: codec recovery, original MP4 fallback, reduced-motion, data saving, explicit sound playback, initial hero reuse and fresh selection updates');
}
if(!baseline){const expected={chromium:[320,390,768,1001,1440],firefox:[390,1440],webkit:[390,1440]};for(const [engine,widths] of Object.entries(expected))assert.deepEqual(rows.filter(row=>row.engine===engine).map(row=>row.width),widths,engine+' header-layout coverage changed');assert(rows.every(row=>row.headerLayout?.passed),'Every hydrated browser case must pass the announcement/header layout gate');const cleanup=rows.filter(row=>row.width===390).map(row=>({engine:row.engine,...row.cleanup}));assert.equal(cleanup.length,3);assert(cleanup.every(row=>row.passed&&row.announcementCount===0),'Campaign-off cleanup must pass in every browser engine');await writeFile(OUT+'/header-layout-'+mode+'.json',JSON.stringify({passed:true,expected,results:rows.map(({engine,width,headerLayout,cleanup})=>({engine,width,headerLayout,cleanup})),campaignOffCleanup:cleanup},null,2));await verifyInitialCss(pw,base,OUT,mode);await verifyPosterCache(pw,base,OUT,mode);await verifyMirrorFallback(pw,base,OUT,mode);}
await writeFile(OUT+'/'+mode+'.json',JSON.stringify({passed:true,results:rows},null,2));
console.log('PASS: '+mode+' homepage, poster, responsive photographs, sound controls, media ranges, compression and layout; '+rows.length+' browser/viewport cases');
