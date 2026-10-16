import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {get} from 'node:http';import {get as getHttps} from 'node:https';import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {existsSync} from 'node:fs';import {createHash} from 'node:crypto';
const [base,mode='live']=process.argv.slice(2),OUT='evidence/paint-performance';await mkdir(OUT+'/'+mode,{recursive:true});
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),manifest=JSON.parse(await readFile(OUT+'/manifest.json','utf8'));
const baseline=mode==='baseline',rows=[];
const request=(path,headers={})=>new Promise((resolve,reject)=>{const u=new URL(path,base);(u.protocol==='https:'?getHttps:get)(u,{headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject);});
if(!baseline){
 const report=JSON.parse(await readFile(OUT+'/patch.json','utf8'));
 const originalPricing=await request('/pricing-assets/storefront.mjs',{'accept-encoding':'identity'});assert.equal(originalPricing.status,200);assert.equal(createHash('sha256').update(originalPricing.body).digest('hex'),report.globalPricingSourceSha256,'Global commerce pricing script must stay byte-identical');
 const encodedAsset=JSON.parse(await readFile(OUT+'/static-encoding-quality.json','utf8'));
 const icons=JSON.parse(await readFile(OUT+'/icon-quality.json','utf8'));
 for(const frame of icons.frames.filter(frame=>frame.width<=64)){const r=await request(frame.url);assert.equal(r.status,200);assert.match(r.headers['content-type'],/image\/png/);assert.match(r.headers['cache-control'],/immutable/);assert.equal(createHash('sha256').update(r.body).digest('hex'),frame.sha256);}
 const legacy=await request(icons.source);assert.equal(legacy.status,200);assert.equal(createHash('sha256').update(legacy.body).digest('hex'),icons.originalSha256,'Original multisize icon must remain intact');
 const home=await request('/');assert(!/rel="shortcut icon"[^>]*href="[^"]+\.ico/.test(home.body.toString()),'Browser tab should use the exact sized PNG frame');assert(home.body.toString().includes('data-hidi-first-header'));assert(home.body.toString().includes('data-hidi-first-hero="true"'),'Current supported hero must be present in initial HTML');assert(home.body.toString().includes('data-hidi-inline-css'));assert(home.body.toString().includes('src="/'+report.bundle+'"'));assert(home.body.toString().includes('rel="modulepreload"'));assert(home.body.toString().includes('data-hidi-inline-script="/config.js"'));assert(home.body.toString().includes('data-hidi-early-hero'));assert(home.body.toString().includes('data:image/png;base64,'));
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
 try{for(const width of engine==='chromium'?[320,390,768,1440]:[390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,reducedMotion:engine==='chromium'?'no-preference':'reduce'}),page=await context.newPage();page.setDefaultTimeout(45000);
  const errors=[],network=[],media=[];let transferred=0;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{network.push(r.url());if(r.resourceType()==='media')media.push(r.url());});
  if(engine==='chromium'){const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');cdp.on('Network.loadingFinished',e=>transferred+=e.encodedDataLength);}
  await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==new URL(base).origin||!['GET','HEAD'].includes(r.method()))return route.abort();return route.continue();});
  await page.addInitScript(()=>{window.__lcp=0;window.__cls=0;try{new PerformanceObserver(l=>window.__lcp=l.getEntries().at(-1).startTime).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__cls+=e.value;})).observe({type:'layout-shift',buffered:true});}catch{}});
  try{
   assert.equal((await page.goto(base+'/',{waitUntil:'domcontentloaded'})).status(),200);
   await page.waitForFunction(()=>document.querySelector('.hero-media')?.dataset.heroConfigStatus==='uploaded');
   const video=page.locator('video.hero-live-media');await video.waitFor({state:'attached'});
   if(engine==='chromium')await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.readyState>=2&&v.videoWidth>0;});
   else await page.waitForFunction(()=>!!document.querySelector('video.hero-live-media')?.poster);
   await page.waitForTimeout(2500);
   const initial=await page.evaluate(()=>({lcp:window.__lcp,cls:window.__cls,video:{src:document.querySelector('video.hero-live-media').currentSrc,poster:document.querySelector('video.hero-live-media').poster,width:document.querySelector('video.hero-live-media').videoWidth},overflow:document.documentElement.scrollWidth>innerWidth+1}));
   const initialBytes=transferred,initialRequests=[...network];if(!baseline){const scope=JSON.parse(await readFile(OUT+'/patch.json','utf8'));assert(!initialRequests.some(u=>new URL(u).pathname==='/pricing-assets/storefront.mjs'),'Home must use its scoped loader without replacing the global commerce script');assert.equal(initialRequests.filter(u=>new URL(u).pathname==='/'+scope.homePricingBundle).length,1);}if(!baseline)assert.equal(initialRequests.filter(u=>new URL(u).pathname==='/api/store/products').length,1,'One fresh initial catalogue request must be reused by the offer script');if(!baseline&&engine==='chromium')assert(!initialRequests.some(u=>new URL(u).pathname.endsWith('.ico')),'Normal browser tab must use the exact small PNG frame');if(!baseline&&engine==='chromium'){assert(!initialRequests.some(u=>u.includes(width<=700?'poster-1920.webp':'poster-1280.webp')),'Only the matching responsive poster should download');}assert(!initial.overflow);if(!baseline){assert.equal(initialRequests.filter(u=>new URL(u).pathname==='/api/hidi/hero-config').length,1,'Early hero request must be reused');assert.equal(initialRequests.filter(u=>new URL(u).pathname==='/api/hidi/landing-media-config').length,1,'Early landing selection must be reused');assert(!initialRequests.some(u=>new URL(u).pathname==='/config.js'),'Config must not block on another request');assert.equal(initialRequests.filter(u=>u.includes('/assets/index-')&&u.endsWith('.js')).length,1,'App preload and module should reuse one request');assert(!initialRequests.some(u=>u.includes('/ananya-portraits/')),'Off-screen original portraits must not download');}
   if(!baseline){assert(initial.video.poster.includes('/media-performance/assets/'));if(engine==='chromium'){assert(initial.video.poster.endsWith('.avif'));const wrong=Object.values(manifest.videos)[0][width<=700?'desktop':'mobile'].avifPoster;assert(!initialRequests.some(u=>new URL(u).pathname===wrong),'Only matching AVIF poster should download');assert(!initialRequests.some(u=>/poster-.*\.webp/.test(u)),'Modern browser should avoid duplicate WebP poster');}if(engine==='chromium'){assert(initial.video.src.includes('/media-performance/assets/'));assert.equal(initial.video.width,width<=700?1280:1920);if(width<=700)assert.equal(new URL(initial.video.src).pathname,Object.values(manifest.videos)[0].mobile.av1Url,'Mobile AV1 must decode successfully');assert(initialBytes<(width<=700?7:11)*1024*1024,'Initial transfer budget');}assert(!media.some(u=>u.includes('/api/hidi/hero-asset/')),'Original video should not be downloaded');}
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
   await page.screenshot({path:OUT+'/'+mode+'/'+engine+'-'+width+'.png',fullPage:true});rows.push({engine,width,passed:true,initialBytes,initialRequests,initial,geometry,photos});
  }catch(error){await page.screenshot({path:OUT+'/'+mode+'/'+engine+'-'+width+'-failure.png',fullPage:true}).catch(()=>{});await writeFile(OUT+'/'+mode+'/'+engine+'-'+width+'-failure.json',JSON.stringify({error:String(error),errors,media,hero:await page.locator('.hero-media').evaluate(el=>el.outerHTML).catch(()=>null)}));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
if(!baseline&&mode==='candidate'){
 const before=JSON.parse(await readFile(OUT+'/baseline.json','utf8'));
 for(const row of rows.filter(r=>r.engine==='chromium')){
  const original=before.results.find(r=>r.width===row.width);assert(row.initialBytes<original.initialBytes*1.02,'No transfer regression for '+row.width);
  assert.equal(row.geometry.length,original.geometry.length);for(let i=0;i<row.geometry.length;i++){const a=original.geometry[i],b=row.geometry[i];for(const key of ['x','y','width','height'])assert(Math.abs(a[key]-b[key])<=1.5,'Layout changed: '+key+' '+a.cls+' at '+row.width);for(const key of ['font','color','background'])assert.equal(a[key],b[key],a.cls+' '+key);}
 }
 await writeFile(OUT+'/visual-comparison.json',JSON.stringify({passed:true,widths:[320,390,768,1440],unchanged:'section geometry, typography, colours, CSS, button positions and selected uploads'}));
}
if(!baseline&&mode==='candidate'){
 const browser=await pw.chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
 try{for(const scenario of ['codec-failure','unsupported','reduced-motion','data-saving','initial-selection']){
  const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:scenario==='reduced-motion'?'reduce':'no-preference'}),page=await context.newPage();page.setDefaultTimeout(45000);
  if(scenario==='unsupported')await page.addInitScript(()=>{const native=HTMLMediaElement.prototype.canPlayType;HTMLMediaElement.prototype.canPlayType=function(type){return type.includes('av01')?'':native.call(this,type);};});
  if(scenario==='data-saving')await page.addInitScript(()=>{if(navigator.connection)Object.defineProperty(navigator.connection,'saveData',{get:()=>true});});
  let catalogueReads=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/store/products')catalogueReads++;});
  let releaseInitial;const initialGate=new Promise(resolve=>{releaseInitial=resolve;});
  await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==new URL(base).origin||!['GET','HEAD'].includes(r.method()))return route.abort();if(scenario==='initial-selection'&&u.pathname==='/api/hidi/hero-config'){const response=await route.fetch();const value=await response.json();value.mobilePosition='35% 65%';if(value.items?.length)value.items[0].mobilePosition='35% 65%';await initialGate;return route.fulfill({response,json:value});}if(scenario==='codec-failure'&&u.pathname.includes('/hero-av1-'))return route.fulfill({status:500,body:'Controlled codec fallback test'});return route.continue();});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('.hero-media')?.dataset.heroConfigStatus==='uploaded'&&!document.querySelector('video[data-hidi-first-hero]'));
  if(scenario==='initial-selection'){assert.equal(await page.evaluate(()=>window.__HidiHeroInitial),null,'Initial snapshot must be cleared after first mount');assert(await page.locator('video.hero-live-media').getAttribute('poster'));releaseInitial();await page.waitForFunction(()=>document.querySelector('video.hero-live-media')?.style.getPropertyValue('--hero-position-mobile')==='35% 65%');await page.waitForLoadState('load');assert.equal(catalogueReads,1);for(const resume of ['pageshow','visibility']){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/store/products');await page.evaluate(type=>{if(type==='pageshow')dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));else document.dispatchEvent(new Event('visibilitychange'));},resume);await response;await page.waitForTimeout(100);}assert.equal(catalogueReads,3,'Returning to the page and becoming visible must still read fresh prices');}
  if(['codec-failure','unsupported'].includes(scenario)){
   await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.readyState>=2;});
   assert.equal(new URL(await page.locator('video.hero-live-media').evaluate(v=>v.currentSrc)).pathname,Object.values(manifest.videos)[0].mobile.url);
  }else if(['reduced-motion','data-saving'].includes(scenario)){await page.waitForTimeout(1500);assert.equal(await page.locator('video.hero-live-media').evaluate(v=>v.getAttribute('src')),null,'Motion and data preferences must prevent automatic video downloads');}
  await page.getByRole('button',{name:'Turn video sound on'}).click();await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.readyState>=2&&!v.muted;});
  await context.close();
 }}finally{await browser.close();}
 await writeFile(OUT+'/fallback-safety.json',JSON.stringify({passed:true,codecFailure:true,unsupportedCodec:true,reducedMotion:true,dataSaving:true,manualSound:true,initialSelectionReuse:true,freshSelectionUpdate:true,catalogueRequestReuse:true,catalogueResumeFreshness:true}));
 console.log('PASS: codec recovery, original MP4 fallback, reduced-motion, data saving, explicit sound playback, initial hero reuse and fresh selection updates');
}
await writeFile(OUT+'/'+mode+'.json',JSON.stringify({passed:true,results:rows},null,2));
console.log('PASS: '+mode+' homepage, poster, responsive photographs, sound controls, media ranges, compression and layout; '+rows.length+' browser/viewport cases');
