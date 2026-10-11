import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {probe as galleryProbe} from '../portrait-layout/probes.mjs';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
export async function probe(base,output,{candidate=false,retained=true}={}){
  await mkdir(output,{recursive:true});
  const captured=JSON.parse(await readFile(process.env.HIDI_CATEGORY_PRIVATE+'/public-before.json','utf8'));
  const hero=candidate?captured.hero:await(await fetch(base+'/api/hidi/hero-config')).json();
  assert.equal(hero.items.length,1);assert.equal(hero.items[0].originalName,'IMG_3757.mp4');assert.equal(hero.items[0].assetId,'ccb85470-43bb-4544-a533-7f0edcf927ac');
  const media=candidate?await readFile(process.env.HIDI_CATEGORY_PRIVATE+'/hero-video.mp4'):null;
  const banner=await readFile(process.env.HIDI_CATEGORY_PRIVATE+'/banner-image');
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),results=[];
  for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
    const browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&process.env.HIDI_CHROMIUM_CHANNEL?{channel:process.env.HIDI_CHROMIUM_CHANNEL}:{}),...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try{for(const width of candidate?[320,390,768,1440]:[390,1440]){
      const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,reducedMotion:'no-preference'}),page=await context.newPage();page.setDefaultTimeout(30000);
      const writes=[],errors=[],mediaRequests=[];
      const nativePlayback=engine==='chromium';
      if(!nativePlayback)await page.addInitScript(()=>{
        const state=new WeakMap(),get=v=>{if(!state.has(v))state.set(v,{paused:true,time:0});return state.get(v);};
        Object.defineProperties(HTMLMediaElement.prototype,{readyState:{get(){return 2;}},paused:{get(){return get(this).paused;}},currentTime:{get(){return get(this).time;},set(value){get(this).time=value;}}});
        Object.defineProperty(HTMLVideoElement.prototype,'videoWidth',{get(){return 3840;}});
        HTMLMediaElement.prototype.play=function(){get(this).paused=false;get(this).time=.5;this.dispatchEvent(new Event('loadeddata'));return Promise.resolve();};
        HTMLMediaElement.prototype.pause=function(){get(this).paused=true;};
        document.addEventListener('error',event=>{if(event.target instanceof HTMLMediaElement)event.stopImmediatePropagation();},true);
      });
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(window.rejectUnmuted&&!this.muted)return Promise.reject(new DOMException('Playback rejected','NotAllowedError'));return play.call(this);};});
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(isBlockedTelemetry(req.method(),req.url(),new URL(base).origin)||/googletagmanager|google-analytics|facebook\.net/.test(url.hostname))return route.abort();
        if(!['GET','HEAD'].includes(req.method())){writes.push(req.method()+' '+url.pathname);return route.abort();}
        if(req.resourceType()==='media'){mediaRequests.push(url.pathname);if(!nativePlayback)return route.abort();}
        if(candidate&&url.pathname==='/api/hidi/hero-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(hero)});
        if(candidate&&url.pathname==='/api/hidi/landing-media-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(captured.landing)});
        if(candidate&&url.pathname===hero.items[0].url){
          const range=req.headers().range,match=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
          if(match){const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):media.length-1,media.length-1);return route.fulfill({status:206,contentType:'video/mp4',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${media.length}`},body:media.subarray(start,end+1)});}
          return route.fulfill({status:200,contentType:'video/mp4',headers:{'Accept-Ranges':'bytes'},body:media});
        }
        if(candidate&&url.pathname.startsWith('/api/hidi/hero-asset/'))return route.fulfill({status:200,contentType:'image/png',body:banner});
        return route.continue();
      });
      try{
        assert.equal((await page.goto(base+'/',{waitUntil:'domcontentloaded'})).status(),200);
        const heroSection=page.locator('.hero--campaign'),video=heroSection.locator('video.hero-live-media'),sound=heroSection.getByRole('button',{name:'Turn video sound on'});
        await sound.waitFor();await page.waitForFunction(()=>document.querySelector('video.hero-live-media')?.readyState>=2);
        assert.equal(await video.count(),1);assert((await video.getAttribute('src')).endsWith('1791716760991-e92e5c8a-9f8a-46d9-8cad-c6ba3cd9e0cb.mp4'));
        assert(await video.evaluate(v=>v.muted));assert(await video.evaluate(v=>v.loop));
        assert(!mediaRequests.some(url=>url.includes('1791606631003')||url.includes('luminous-v1.mp4')),'Removed or fallback video requested');
        const button=await sound.boundingBox(),shop=await heroSection.getByRole('button',{name:'Shop Now',exact:true}).boundingBox();
        assert(button.width>=44&&button.height>=44&&button.x>=0&&button.x+button.width<=width);
        assert(button.x+button.width<=shop.x||shop.x+shop.width<=button.x||button.y+button.height<=shop.y||shop.y+shop.height<=button.y,'Sound and Shop Now must not overlap');
        await sound.click();await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v&&!v.muted&&!v.paused&&v.currentTime>0;});
        assert.equal(await heroSection.getByRole('button',{name:'Mute video sound'}).getAttribute('aria-pressed'),'true');
        await heroSection.getByRole('button',{name:'Mute video sound'}).click();assert(await video.evaluate(v=>v.muted));
        await sound.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>!document.querySelector('video.hero-live-media').muted);
        await page.locator('#our-promises').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('video.hero-live-media').paused);
        await heroSection.scrollIntoViewIfNeeded();await page.waitForFunction(()=>!document.querySelector('video.hero-live-media').paused);
        if(candidate&&width===390){
          await page.emulateMedia({reducedMotion:'reduce'});await page.reload({waitUntil:'domcontentloaded'});await sound.waitFor();
          await page.waitForFunction(()=>document.querySelector('video.hero-live-media')?.readyState>=2);assert(await video.evaluate(v=>v.muted&&v.paused));
          await sound.click();await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return !v.muted&&!v.paused&&v.currentTime>0;});
          await heroSection.getByRole('button',{name:'Mute video sound'}).click();
          await page.evaluate(()=>window.rejectUnmuted=true);await sound.click();await sound.waitFor();assert(await video.evaluate(v=>v.muted));
          await page.evaluate(()=>window.rejectUnmuted=false);
        }
        assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1);
        await heroSection.screenshot({path:`${output}/${engine}-${width}.png`,animations:'disabled'});
        assert.deepEqual(writes,[]);assert.deepEqual(errors.filter(x=>!x.startsWith('Minified React error #418;')),[]);
        results.push({engine,width,passed:true,audioToggleVerified:true,sampleRemoved:true,nativePlayback});
        console.log(`PASS ${candidate?'candidate':'live'} ${engine} ${width}: selected video, sound/mute, keyboard, viewport pause and controls spacing (${nativePlayback?'native playback':'media API control checks'})`);
      }catch(error){await page.screenshot({path:`${output}/${engine}-${width}-failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${output}/${engine}-${width}-failure.json`,JSON.stringify({message:error.message,errors,writes,mediaRequests,video:await page.locator('video.hero-live-media').evaluate(v=>({ready:v.readyState,error:v.error?.code,paused:v.paused,muted:v.muted})).catch(()=>null)},null,2));throw error;}
      finally{await context.close();}
    }}finally{await browser.close();}
  }
  let gallery={};
  if(retained){const engines=process.env.HIDI_BROWSER_ENGINES;try{process.env.HIDI_BROWSER_ENGINES='chromium';gallery=await galleryProbe(base,output+'/retained-gallery',{candidate});}finally{process.env.HIDI_BROWSER_ENGINES=engines;}}
  const report={...gallery,passed:true,heroSoundOnly:true,audioToggleVerified:true,sampleRemoved:true,reducedMotion:true,mediaFailureRecovery:candidate,browserResults:results,blobWrites:0,databaseWrites:0};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
