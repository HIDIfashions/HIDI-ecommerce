import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {startPreview,OWNER} from './preview.mjs';
const root=resolve(process.argv[2]),out=join(root,'results');await mkdir(out,{recursive:true});
const pw=await import(process.env.HIDI_PLAYWRIGHT_MODULE||'file:///C:/Users/nagal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const server=await startPreview(root),headers={Cookie:'hidi_admin_access='+OWNER,'Content-Type':'application/json'},results=[];let checks=0;
const check=(test,message)=>{assert(test,message);checks++};
const post=(path,body)=>fetch(server.base+path,{method:'POST',headers,body:JSON.stringify(body)});
let browser,browserServer;
try{
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium').split(',')){
  for(const width of [390,1440]){
   browserServer=await pw[engine].launchServer({headless:true});browser=await pw[engine].connect(browserServer.wsEndpoint());
   server.reset();const context=await browser.newContext({viewport:{width,height:1000}});context.setDefaultTimeout(20000);await context.addCookies([{name:'hidi_admin_access',value:OWNER,url:server.base}]);
   await context.route('**/*',route=>new URL(route.request().url()).origin===server.base?route.continue():route.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.base+'/admin/landing-media?section=hero');await page.locator('#heroImageFile').waitFor({state:'attached'});
   check(await page.locator('#heroDeviceImages').isHidden(),'Video does not show image controls');
   const before=structuredClone(server.current());await page.locator('#heroImageFile').setInputFiles(join(root,'fixtures/desktop.png'));await page.getByText('Uploaded to draft.',{exact:false}).waitFor();
   check(await page.locator('#heroDeviceImages').isVisible(),'Image has responsive controls');
   await page.locator('#heroMobileFile').setInputFiles(join(root,'fixtures/mobile.png'));await page.getByText('Mobile image saved to this banner draft.',{exact:false}).waitFor();
   check(await page.locator('#sequence .sequence-item').count()===2,'Mobile artwork does not add another slide');assert.deepEqual(server.current(),before);checks++;
   check(await page.locator('#desktopPreview img').getAttribute('src')!==await page.locator('#mobilePreview img').getAttribute('src'),'Device previews use different files');
   await page.locator('#publish').click();await page.getByText('Published. The storefront now uses this media list.',{exact:true}).waitFor();
   let state=server.current(),image=state.items[1];check(image.mobileAssetId&&image.mobileUrl&&image.mobileOriginalName==='mobile.png','Publish persists paired artwork');
   const published=structuredClone(state);
   // The server resolves URLs from the authenticated library, never posted URLs.
   let r=await post('/api/hidi/hero-publish',{items:[{...image,mobileUrl:'https://attacker.invalid/picture.png'}],autoPlay:true});check(r.ok,'Valid mobile library ID accepted');let data=await r.json();check(!data.current.items[0].mobileUrl.includes('attacker.invalid'),'Posted mobile URL ignored');
   for(const body of [
    {items:[{...image,mobileAssetId:'not-in-library'}]},
    {items:[{...image,mobileAssetId:state.items[0].assetId}]},
    {items:[{...state.items[0],mobileAssetId:image.mobileAssetId}]},
   ])check((await post('/api/hidi/hero-publish',body)).status===400,'Invalid mobile pairing rejected');
   check((await fetch(server.base+'/api/hidi/hero-publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[image]})})).status===401,'Anonymous pairing rejected');
   r=await post('/api/hidi/hero-publish',{items:[image],autoPlay:true,intervalSeconds:30});check(r.ok,'Image-only responsive fixture published');
   const shop=await context.newPage();shop.on('pageerror',e=>console.log('SHOP ERROR',e.message));await shop.goto(server.base+'/');
   for(const size of [390,700,701,1440,390]){
    await shop.setViewportSize({width:size,height:1000});const expected=new URL(size<=700?image.mobileUrl:image.url,server.base).pathname;
    await shop.waitForFunction(expected=>{const i=document.querySelector('img.hero-live-media');return i?.naturalWidth>0&&new URL(i.currentSrc).pathname===expected&&getComputedStyle(i).visibility==='visible';},expected).catch(async error=>{console.log('HERO FAILURE',JSON.stringify(await shop.evaluate(()=>({html:document.querySelector('.hero-media')?.outerHTML,body:document.body.innerText.slice(0,500),images:[...document.querySelectorAll('.hero-media img')].map(i=>({src:i.src,currentSrc:i.currentSrc,width:i.naturalWidth,vis:getComputedStyle(i).visibility}))}))));throw error;});
    check(await shop.locator('picture[data-hidi-device-image] source').count()===1,'Responsive picture uses one mobile source');
   }
   await shop.screenshot({path:join(out,engine+'-'+width+'-responsive.png')});
   // Broken mobile source retries the desktop source without dropping the slide.
   await shop.route('**'+new URL(image.mobileUrl,server.base).pathname,route=>route.abort());await shop.reload();
   await shop.waitForFunction(expected=>{const i=document.querySelector('img.hero-live-media');return i?.naturalWidth>0&&new URL(i.currentSrc).pathname===expected&&getComputedStyle(i).visibility==='visible';},new URL(image.url,server.base).pathname);checks++;await shop.close();
   await post('/api/hidi/hero-publish',{items:published.items,autoPlay:true,intervalSeconds:3});
   const loop=await context.newPage();await loop.goto(server.base+'/');
   await loop.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.currentTime>.2&&!v.paused;},undefined,{timeout:45000});
   check(!(await loop.locator('video.hero-live-media').evaluate(v=>v.loop)),'Video advances to paired image');
   await loop.waitForFunction(expected=>{const i=document.querySelector('img.hero-live-media');return i?.naturalWidth>0&&new URL(i.currentSrc).pathname===expected&&getComputedStyle(i).visibility==='visible';},new URL(width<=700?image.mobileUrl:image.url,server.base).pathname,{timeout:45000});checks++;
   await loop.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return document.querySelector('.hero-media')?.dataset.mediaIndex==='0'&&v?.currentTime>.2&&!v.paused;},undefined,{timeout:20000});checks++;
   await loop.close();await page.reload();await page.locator('#sequence .sequence-name').nth(1).click();
   check((await page.locator('#heroMobileName').innerText())==='mobile.png','Reload preserves mobile file');
   await page.locator('#heroDesktopFile').setInputFiles(join(root,'fixtures/desktop-new.png'));await page.getByText('Desktop image saved to this banner draft.',{exact:false}).waitFor();
   check((await page.locator('#heroMobileName').innerText())==='mobile.png','Desktop replacement preserves mobile artwork');check(await page.locator('#sequence .sequence-item').count()===2,'Desktop replacement preserves slide count');
   server.failUpload();await page.locator('#heroMobileFile').setInputFiles(join(root,'fixtures/mobile.png'));await page.getByText('Hero media storage returned HTTP 503',{exact:false}).waitFor();
   check((await page.locator('#heroMobileName').innerText())==='mobile.png','Upload failure retains current pair');
   await page.locator('#heroMobileFile').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});await page.getByText('Choose a JPEG, PNG, WebP or AVIF image.',{exact:true}).waitFor();checks++;
   await page.locator('#heroRemoveMobile').click();check(server.current().items[1].mobileAssetId===image.mobileAssetId,'Removing mobile remains draft only');
   check(await page.locator('#desktopPreview img').getAttribute('src')===await page.locator('#mobilePreview img').getAttribute('src'),'Removed mobile falls back in preview');
   await page.locator('#publish').click();await page.getByText('Published. The storefront now uses this media list.',{exact:true}).waitFor();check(!server.current().items[1].mobileAssetId,'Publishing removal restores desktop fallback');
   await page.locator('#restore').click();await page.getByText('Previous media list restored.',{exact:true}).waitFor();check(server.current().items[1].mobileAssetId===image.mobileAssetId,'Restore brings back paired artwork');
   await page.locator('#sequence .sequence-name').nth(1).click();await page.screenshot({path:join(out,engine+'-'+width+'-admin.png'),fullPage:true});
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin fits viewport');check(errors.length===0,'No admin JavaScript errors: '+errors.join(';'));
   await page.locator('#slots .slot').filter({hasText:"Ananya's Pick photos"}).click();check(await page.locator('#heroDeviceImages').isHidden(),'Other sections remain unchanged');
   check(server.unexpected.length===0,'No unrelated writes');results.push({engine,width,pairUpload:true,draftIsolation:true,publishReload:true,responsiveBreakpoint:true,failedMobileFallback:true,pairedVideoImageLoop:true,desktopReplacement:true,removeRestore:true,serverValidation:true});await browserServer.kill();browserServer=null;browser=null;console.log('PASS responsive hero '+engine+' '+width);
  }
 }
 await writeFile(join(out,'regression.json'),JSON.stringify({passed:true,checks,results,productionWrites:0,actualRuntime:!!process.env.HIDI_HERO_FIXTURE,actualRetainedHandler:true},null,2));
}catch(error){await writeFile(join(out,'failure.json'),JSON.stringify({message:error.stack},null,2));throw error;}finally{await browserServer?.kill();await server.close();}
