import assert from 'node:assert/strict';import {writeFile,mkdir} from 'node:fs/promises';import {existsSync} from 'node:fs';
export async function verifyPosterCache(pw,base,out,mode){
 await mkdir(out+'/'+mode,{recursive:true});
 const browser=await pw.chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})}),rows=[];
 try{for(const mobile of [true,false]){
  const context=await browser.newContext({viewport:{width:mobile?390:1440,height:900},...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'}:{})}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
  await page.addInitScript(()=>document.addEventListener('error',event=>{const video=event.target;if(video instanceof HTMLMediaElement){window.__HidiCacheProbeMediaErrors=window.__HidiCacheProbeMediaErrors||[];window.__HidiCacheProbeMediaErrors.push({src:video.currentSrc||video.src,code:video.error?.code,message:video.error?.message});}},{capture:true}));
  // CDP interception preserves the HTTP cache; Playwright routing disables it.
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  cdp.on('Fetch.requestPaused',event=>{
   const req=event.request,url=new URL(req.url),allowed=['GET','HEAD'].includes(req.method)&&(url.origin===new URL(base).origin||['data:','blob:'].includes(url.protocol));
   void cdp.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:event.requestId}:{requestId:event.requestId,errorReason:'Aborted'}).catch(()=>{});
  });
  const requests=new Map(),responses=new Map();let returning=false,reused=false,expected;
  cdp.on('Network.requestWillBeSent',event=>requests.set(event.requestId,event.request.url));
  cdp.on('Network.requestServedFromCache',event=>{if(returning&&requests.get(event.requestId)===expected)reused=true;});
  cdp.on('Network.responseReceived',event=>{if(!returning)responses.set(event.response.url,event.response);if(returning&&event.response.url===expected&&event.response.fromDiskCache)reused=true;});
  try{
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{const video=document.querySelector('video.hero-live-media');return !document.querySelector('video[data-hidi-first-hero]')&&/\/poster-[a-f0-9]{16}\.avif$/.test(video?.poster||'')&&video.readyState>=2;});
   expected=await page.evaluate(()=>new URL(document.querySelector('video.hero-live-media').poster,location.href).href);
   const cold=responses.get(expected);assert(cold&&cold.status===200);assert.match(cold.mimeType,/image\/avif/);assert.match(String(Object.entries(cold.headers).find(([key])=>key.toLowerCase()==='cache-control')?.[1]),/immutable/);
   assert.equal([...requests.values()].filter(url=>url===expected).length,1,'Preload, native hero and React must reuse one cold poster request');returning=true;
   await page.goto(base+'/?cache-return',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{const video=document.querySelector('video.hero-live-media');return !document.querySelector('video[data-hidi-first-hero]')&&Boolean(video?.poster)&&video.readyState>=2;});
   const poster=await page.locator('video.hero-live-media').getAttribute('poster');assert(!poster.startsWith('data:'));assert.equal(new URL(poster,base).href,expected);
   await page.evaluate(async()=>{const image=new Image();image.src=document.querySelector('video.hero-live-media').poster;await image.decode();});
   assert(reused,'Returning poster must reuse its exact immutable HTTP cache entry');assert.deepEqual(errors,[]);
   rows.push({mobile,passed:true,coldPosterRequests:1,returningPoster:poster,httpCacheReused:true,writes:0});console.log('PASS poster cache '+mode+' '+(mobile?'mobile':'desktop'));
  }catch(error){
   await writeFile(out+'/'+mode+'/poster-cache-failure-'+mobile+'.json',JSON.stringify({error:error.message,url:page.url(),errors,mediaErrors:await page.evaluate(()=>window.__HidiCacheProbeMediaErrors||[]).catch(()=>[]),hero:await page.locator('.hero-media').evaluate(el=>el.outerHTML).catch(()=>null)},null,2));
   await page.screenshot({path:out+'/'+mode+'/poster-cache-failure-'+mobile+'.png',timeout:10000}).catch(()=>{});throw error;
  }finally{await context.close();}
 }}finally{await browser.close();}
 await writeFile(out+'/poster-cache-'+mode+'.json',JSON.stringify({passed:true,results:rows},null,2));
}
