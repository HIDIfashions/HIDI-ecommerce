import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const base='https://hidiindia.com';
const output=resolve('evidence/landing-media-fix/live');await mkdir(output,{recursive:true});
const getJson=async path=>{const response=await fetch(base+path,{headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200,path);return response.json();};
const hero=await getJson('/api/hidi/hero-config');
const landing=await getJson('/api/hidi/landing-media-config');

function urls(value,result=new Set()){
  if(Array.isArray(value))for(const item of value)urls(item,result);
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key==='url'&&typeof item==='string')result.add(item);else urls(item,result);}
  return result;
}
const activeUrls=[...new Set([...urls(hero),...urls(landing)])];
assert(activeUrls.length>0,'Published landing media URLs required');
for(const url of activeUrls){
  assert(url.startsWith('/api/hidi/hero-asset/brand/'),'Brand media must use the private Blob proxy: '+url);
  assert(!url.includes('/media/brand/'),'Product-only route must not receive brand media');
  const response=await fetch(base+url,{headers:{Range:'bytes=0-31','Cache-Control':'no-cache'}});
  assert([200,206].includes(response.status),`Media ${response.status}: ${url}`);
  assert.match(response.headers.get('content-type')||'',/^(?:image|video)\//,`Media MIME: ${url}`);
  const reader=response.body.getReader();const first=await reader.read();assert(first.value?.length>0,`Empty media: ${url}`);await reader.cancel();
}
assert(landing.ananya?.active&&landing.ananya.items?.length>0,'Active Ananya photo sequence required');

const adminResponse=await fetch(base+'/admin/landing-media',{headers:{'Cache-Control':'no-cache'}});assert.equal(adminResponse.status,200);
const admin=await adminResponse.text();const slotBlock=/const slots = \[\n(.*?)\n\];/s.exec(admin);assert(slotBlock,'Live Admin slots block');
const adminSlots=[...slotBlock[1].matchAll(/id:"([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(adminSlots,['hero','range-everyday','range-work-edit','range-occasion','ananya','hidi-edit-banner']);
assert(!admin.includes('Range 02 - New arrivals'));assert(!admin.includes('Range 05 - Shop all'));
assert(admin.includes('first active photo also powers the Ananya’s Pick category card'));

const {chromium}=await import(process.env.HIDI_PLAYWRIGHT_MODULE);const browser=await chromium.launch({channel:'chrome',headless:true});
// Start with normal motion so a real uploaded video is asked to decode and
// play. After its first frame and playback are proven, switch this same page
// to reduced motion and verify that the decoded frame stays visible but stops.
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference',hasTouch:true});
const page=await context.newPage();const mediaFailures=[],pageErrors=[];
page.on('pageerror',error=>pageErrors.push(error.message));
page.on('response',response=>{const path=new URL(response.url()).pathname;if((path.startsWith('/api/hidi/hero')||path.startsWith('/api/hidi/landing-media'))&&response.status()>=400)mediaFailures.push({path,status:response.status()});});
const inspectHero=()=>page.evaluate(()=>{const media=document.querySelector('.hero-live-media');if(!media)return {missing:true,configStatus:document.querySelector('.hero-media')?.dataset.heroConfigStatus,codecSupport:document.createElement('video').canPlayType('video/mp4; codecs="avc1.640034"')};return {tag:media.tagName.toLowerCase(),src:media.currentSrc||media.src,visibility:getComputedStyle(media).visibility,ready:media instanceof HTMLVideoElement?media.readyState:media.complete,networkState:media instanceof HTMLVideoElement?media.networkState:undefined,width:media instanceof HTMLVideoElement?media.videoWidth:media.naturalWidth,height:media instanceof HTMLVideoElement?media.videoHeight:media.naturalHeight,currentTime:media instanceof HTMLVideoElement?media.currentTime:undefined,paused:media instanceof HTMLVideoElement?media.paused:undefined,autoplay:media instanceof HTMLVideoElement?media.hasAttribute('autoplay'):undefined,error:media instanceof HTMLVideoElement&&media.error?{code:media.error.code,message:media.error.message}:null,codecSupport:media instanceof HTMLVideoElement?media.canPlayType('video/mp4; codecs="avc1.640034"'):undefined,frameReady:media.closest('.hero-media')?.dataset.frameReady,configStatus:media.closest('.hero-media')?.dataset.heroConfigStatus};});
let heroPaint,heroMotion={mode:'image'},landingPaint={},blockingPageErrors=[];
try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{const media=document.querySelector('.hero-live-media');if(media instanceof HTMLImageElement)return media.complete&&media.naturalWidth>0&&getComputedStyle(media).visibility!=='hidden';if(media instanceof HTMLVideoElement)return media.readyState>=2&&media.videoWidth>0&&getComputedStyle(media).visibility!=='hidden';return false;},null,{timeout:120000});
  heroPaint=await inspectHero();heroPaint.src=new URL(heroPaint.src).pathname;
  const expectedHero=hero.items?.length?hero.items[0]:hero;assert.equal(heroPaint.tag,expectedHero.type);assert.equal(heroPaint.src,expectedHero.url);assert.equal(heroPaint.visibility,'visible');assert(heroPaint.width>0&&heroPaint.height>0);assert.equal(heroPaint.error,null);assert.equal(heroPaint.frameReady,'true');
  if(heroPaint.tag==='video'){
    assert.equal(heroPaint.width,3840,'Expected uploaded hero video width');assert.equal(heroPaint.height,2160,'Expected uploaded hero video height');
    assert.notEqual(heroPaint.codecSupport,'','Stock Chrome must support the uploaded H.264 hero codec');
    let playback=null;
    if(hero.autoPlay!==false){
      const startTime=heroPaint.currentTime;
      await page.waitForFunction(start=>{const video=document.querySelector('video.hero-live-media');return video&&!video.paused&&Math.abs(video.currentTime-start)>0.05;},startTime,{timeout:30000});
      playback=await inspectHero();assert.equal(playback.paused,false);playback.startTime=startTime;playback.advanced=true;
      playback.frame=await page.evaluate(()=>new Promise((resolve,reject)=>{const video=document.querySelector('video.hero-live-media');if(!video||typeof video.requestVideoFrameCallback!=='function'){reject(new Error('Video frame callback unavailable'));return;}const timeout=setTimeout(()=>reject(new Error('Decoded video frame was not presented')),15000);video.requestVideoFrameCallback((_,metadata)=>{clearTimeout(timeout);const rect=video.getBoundingClientRect(),style=getComputedStyle(video);resolve({presentedFrames:metadata.presentedFrames,width:rect.width,height:rect.height,display:style.display,visibility:style.visibility,opacity:Number(style.opacity)});});}));
      assert(playback.frame.presentedFrames>0);assert(playback.frame.width>0&&playback.frame.height>0);assert.notEqual(playback.frame.display,'none');assert.equal(playback.frame.visibility,'visible');assert(playback.frame.opacity>0);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>{const video=document.querySelector('video.hero-live-media');return video&&video.readyState>=2&&video.videoWidth>0&&getComputedStyle(video).visibility==='visible'&&video.paused&&!video.hasAttribute('autoplay');},null,{timeout:30000});
    const reduced=await inspectHero();assert.equal(reduced.paused,true);assert.equal(reduced.autoplay,false);assert.equal(reduced.visibility,'visible');assert.equal(reduced.width,heroPaint.width);assert.equal(reduced.height,heroPaint.height);assert.equal(reduced.error,null);assert.equal(reduced.frameReady,'true');
    heroMotion={mode:'video',normal:{paused:playback?.paused,startTime:playback?.startTime,currentTime:playback?.currentTime,autoplay:playback?.autoplay,advanced:playback?.advanced,frame:playback?.frame},reduced:{paused:reduced.paused,currentTime:reduced.currentTime,autoplay:reduced.autoplay,visibility:reduced.visibility,frameReady:reduced.frameReady}};
  }else await page.emulateMedia({reducedMotion:'reduce'});
  async function paintedImage(selector,expected){const locator=page.locator(selector);await locator.waitFor({timeout:30000});await locator.scrollIntoViewIfNeeded();await locator.evaluate(image=>image.decode());const value=await locator.evaluate(image=>({src:new URL(image.currentSrc||image.src).pathname,width:image.naturalWidth,height:image.naturalHeight,visibility:getComputedStyle(image).visibility}));assert.equal(value.src,expected,selector);assert(value.width>0&&value.height>0,selector);assert.notEqual(value.visibility,'hidden',selector);return value;}
  for(const [slot,label] of [['range-everyday','Casual Wear'],['range-work-edit','Work Wear'],['range-occasion','Occasional Wear']]){
    const value=landing.slots?.[slot];if(value?.active)landingPaint[slot]=await paintedImage(`.hidi-collection-card[aria-label$=": ${label}"] img`,value.url);
  }
  const ananyaUrl=landing.ananya.items[0].url;
  landingPaint.ananyaCard=await paintedImage('.hidi-collection-card[aria-label$=": Ananya’s Pick"] img',ananyaUrl);
  landingPaint.ananyaFullPage=await paintedImage('.meet-cinematic--photo .meet-cinematic__model',ananyaUrl);
  if(landing.slots?.['hidi-edit-banner']?.active)landingPaint.banner=await paintedImage('#hidi-edit .edit-campaign > img',landing.slots['hidi-edit-banner'].url);
  await page.screenshot({path:join(output,'homepage-mobile.png'),fullPage:true});await new Promise(done=>setTimeout(done,300));
  blockingPageErrors=pageErrors.filter(error=>!error.startsWith('Minified React error #418;'));
  assert.deepEqual(mediaFailures,[]);assert.deepEqual(blockingPageErrors,[]);
}catch(error){
  const state=await inspectHero().catch(inspectError=>({inspectionError:inspectError.message}));
  await writeFile(join(output,'failure.json'),JSON.stringify({passed:false,message:error.message,stack:error.stack,heroState:state,mediaFailures,pageErrors},null,2));
  await page.screenshot({path:join(output,'failure-homepage-mobile.png'),timeout:15000}).catch(()=>{});
  throw error;
}finally{await context.close();await browser.close();}

const report={passed:true,activeMediaUrls:activeUrls.length,allActiveMediaReadable:true,adminSlots,heroPaint,heroMotion,landingPaint,browser:'chrome',viewport:'390x844',mediaFailures,pageErrors,blockingPageErrors,databaseWrites:0,blobWrites:0};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
