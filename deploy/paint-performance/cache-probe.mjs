import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
export async function verifyPosterCache(pw,base,out,mode){
 const browser=await pw.chromium.launch({headless:true}),rows=[];
 try{for(const mobile of [true,false]){
  const context=await browser.newContext({viewport:{width:mobile?390:1440,height:900},...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'}:{})}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
  // CDP interception preserves the HTTP cache; Playwright routing disables it.
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  cdp.on('Fetch.requestPaused',event=>{
   const req=event.request,url=new URL(req.url),allowed=['GET','HEAD'].includes(req.method)&&(url.origin===new URL(base).origin||['data:','blob:'].includes(url.protocol));
   void cdp.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:event.requestId}:{requestId:event.requestId,errorReason:'Aborted'}).catch(()=>{});
  });
  const requests=new Map();let returning=false,reused=false,expected;
  cdp.on('Network.requestWillBeSent',event=>requests.set(event.requestId,event.request.url));
  cdp.on('Network.requestServedFromCache',event=>{if(returning&&requests.get(event.requestId)===expected)reused=true;});
  cdp.on('Network.responseReceived',event=>{if(returning&&event.response.url===expected&&event.response.fromDiskCache)reused=true;});
  try{
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!document.querySelector('video[data-hidi-first-hero]')&&document.querySelector('video.hero-live-media')?.poster.startsWith('data:image/avif;base64,'));
   expected=await page.evaluate(()=>new URL(Object.keys(window.__HidiInlinePosters)[0],location.href).href);
   await page.evaluate(()=>dispatchEvent(new Event('pointerdown')));
   await page.waitForFunction(()=>document.cookie.includes('hidi_poster_cache='));returning=true;
   await page.goto(base+'/?cache-return',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!document.querySelector('video[data-hidi-first-hero]')&&Boolean(document.querySelector('video.hero-live-media')?.poster));
   const poster=await page.locator('video.hero-live-media').getAttribute('poster');assert(!poster.startsWith('data:'));assert.equal(new URL(poster,base).href,expected);
   await page.evaluate(async()=>{const image=new Image();image.src=document.querySelector('video.hero-live-media').poster;await image.decode();});
   assert(reused,'Returning poster must reuse its exact immutable HTTP cache entry');assert.deepEqual(errors,[]);
   rows.push({mobile,passed:true,returningPoster:poster,httpCacheReused:true,writes:0});console.log('PASS poster cache '+mode+' '+(mobile?'mobile':'desktop'));
  }finally{await context.close();}
 }}finally{await browser.close();}
 await writeFile(out+'/poster-cache-'+mode+'.json',JSON.stringify({passed:true,results:rows},null,2));
}
