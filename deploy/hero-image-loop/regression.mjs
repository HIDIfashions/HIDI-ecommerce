import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {startPreview,OWNER} from './preview.mjs';
const root=resolve(process.argv[2]),out=join(root,'results');await mkdir(out,{recursive:true});
await writeFile(join(out,'regression.json'),JSON.stringify({passed:false,status:'running',productionWrites:0},null,2));
const pw=await import(process.env.HIDI_PLAYWRIGHT_MODULE||'file:///C:/Users/nagal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const server=await startPreview(root),results=[];let checks=0,browser;const pages=[];
const check=(value,message)=>{assert(value,message);checks++};const headers={Cookie:'hidi_admin_access='+OWNER};
const fixtureDir=process.env.HIDI_HERO_FIXTURE?join(root,'fixtures'):resolve(root,'../landing-offer-loop');
const imagePath=join(fixtureDir,'offer.png');
try{
 check((await fetch(server.base+'/api/hidi/hero-upload',{method:'POST',headers:{'Content-Type':'image/png'},body:await readFile(imagePath)})).status===401,'Anonymous upload rejected');
 check((await fetch(server.base+'/api/hidi/hero-publish',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status===401,'Anonymous publish rejected');
 check((await fetch(server.base+'/api/hidi/hero-upload',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'invalid'})).status===400,'Unsupported upload rejected');
 check(server.writes.length===0,'Rejected requests do not write');
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium').split(',')){
 browser=await pw[engine].launch({headless:true});
 for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const label=engine+'-'+device;
  server.reset();const before=structuredClone(server.current()),context=await browser.newContext({viewport:{width,height}});await context.addCookies([{name:'hidi_admin_access',value:OWNER,url:server.base}]);
  await context.route('**/*',r=>new URL(r.request().url()).origin===server.base?r.continue():r.abort());
  const page=await context.newPage(),errors=[];pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  await page.goto(server.base+'/admin/landing-media?section=hero');await page.getByRole('button',{name:'Upload image',exact:true}).waitFor();
  check(await page.getByRole('button',{name:'Upload video',exact:true}).isEnabled(),'Video picker available');check(await page.locator('#heroPlaybackSummary').innerText().then(x=>x.includes('Video only')),'Video-only guidance');check(!(await page.locator('#autoPlay').isVisible()),'Automatic hero playback needs no checkbox');
  await page.locator('#heroUploadOptions').screenshot({path:join(out,label+'-upload-controls.png')});
  // The real file chooser must distinguish photos from videos.
  const imageChooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload image',exact:true}).click();await (await imageChooser).setFiles(imagePath);
  await page.getByText('Uploaded to draft. Review the desktop and mobile previews, then Publish banner.',{exact:true}).waitFor();
  check(await page.locator('#sequence .sequence-item').count()===2,'Image added beside existing video');assert.deepEqual(server.current(),before);checks++;
  check(server.writes.every(k=>k==='brand/hero/library.json'||k.startsWith('brand/hero/media/')),'Upload only writes library and media');
  check(await page.locator('#desktopPreview img').count()===1&&await page.locator('#mobilePreview img').count()===1,'Image preview on both devices');
  check(await page.locator('#fitMode').isEnabled(),'Image fit setting is available');check(await page.locator('#fitMode').inputValue()==='contain','New images default to full image');
  check(await page.locator('#desktopPreview img').evaluate(e=>getComputedStyle(e).objectFit)==='contain','Admin desktop preview shows full image');check(await page.locator('#mobilePreview img').evaluate(e=>getComputedStyle(e).objectFit)==='contain','Admin mobile preview shows full image');
  await page.locator('#intervalSeconds').selectOption('3');
  check(await page.locator('#heroPlaybackSummary').innerText().then(x=>x.includes('3 seconds')),'Image duration reflected in guidance');
  await page.screenshot({path:join(out,label+'-admin-draft.png'),fullPage:true});
  // Publish errors keep the live selection and the retryable draft.
  server.failPublish();await page.getByRole('button',{name:'Publish banner',exact:true}).click();await page.getByText('Hero media storage returned HTTP 503',{exact:false}).waitFor();assert.deepEqual(server.current(),before);checks++;
  check(await page.locator('#sequence .sequence-item').count()===2,'Failed publish keeps draft');
  await page.getByRole('button',{name:'Publish banner',exact:true}).click();await page.getByText('Published. The storefront now uses this media list.',{exact:true}).waitFor();
  check(server.current().autoPlay===true&&server.current().items.length===2,'Publish persists automatically looping video and image');check(server.current().items[0].assetId===before.items[0].assetId,'Existing video retained');
  await page.reload();await page.getByRole('button',{name:'Publish banner',exact:true}).waitFor();check(await page.locator('#sequence .sequence-item').count()===2,'Published media survives reload');
  const shop=await context.newPage();pages.push(shop);shop.on('pageerror',e=>errors.push(e.message));await shop.goto(server.base+'/');
  await shop.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v&&v.currentTime>.2&&!v.paused},{},{timeout:40000});
  check(!(await shop.locator('video.hero-live-media').evaluate(v=>v.loop)),'Video advances instead of looping when image is present');
  // Verify actual natural completion, no synthetic ended event.
  await shop.waitForFunction(()=>document.querySelector('.hero-media')?.dataset.mediaIndex==='1'&&document.querySelector('img.hero-live-media')?.naturalWidth>0&&getComputedStyle(document.querySelector('img.hero-live-media')).visibility==='visible',{},{timeout:40000});
  await shop.waitForFunction(()=>getComputedStyle(document.querySelector('.campaign-shop-button')).backgroundColor==='rgb(89, 30, 34)',{},{timeout:5000});
  await shop.screenshot({path:join(out,label+'-storefront-image.png')});
  check(await shop.locator('img.hero-live-media').evaluate(e=>getComputedStyle(e).objectFit)==='contain','Storefront keeps full image visible');
  check(await shop.locator('.campaign-shop-button').evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(89, 30, 34)','Image CTA stays legible on the light background');
  await shop.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return document.querySelector('.hero-media')?.dataset.mediaIndex==='0'&&v?.currentTime>.2&&!v.paused},{},{timeout:20000});checks++;
  await shop.close();
  // Removing the image affects only the draft until publication.
  await page.getByRole('button',{name:'Remove item 2',exact:true}).click();check(server.current().items.length===2,'Removing image remains a draft');check(await page.locator('#heroPlaybackSummary').innerText().then(x=>x.includes('Video only')),'Removal shows video-only mode');
  await page.getByRole('button',{name:'Publish banner',exact:true}).click();await page.getByText('Published. The storefront now uses this media list.',{exact:true}).waitFor();
  check(server.current().items.length===1&&server.current().items[0].type==='video','Published removal restores video only');
  const only=await context.newPage();await only.goto(server.base+'/');await only.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.loop&&v.currentTime>.2&&!v.paused},{},{timeout:40000});check(await only.locator('img.hero-live-media').count()===0,'No image slide when image absent');await only.close();
  // Upload failure leaves the video intact; retry adds the image once.
  server.failUpload();await page.locator('#heroImageFile').setInputFiles(imagePath);await page.getByText('Hero media storage returned HTTP 503',{exact:false}).waitFor();check(server.current().items.length===1,'Failed upload cannot alter published banner');check(await page.locator('#sequence .sequence-item').count()===1,'Failed upload adds no broken draft item');await page.getByRole('button',{name:'Retry upload',exact:true}).click();await page.getByText('Uploaded to draft. Review the desktop and mobile previews, then Publish banner.',{exact:true}).waitFor();check(await page.locator('#sequence .sequence-item').count()===2,'Retry succeeds without duplicating video');
  // Reject unsupported files at the dedicated image picker.
  await page.locator('#heroImageFile').setInputFiles({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});await page.getByText('Choose a supported image file.',{exact:true}).waitFor();check(await page.locator('#sequence .sequence-item').count()===2,'Invalid file keeps existing draft');
  // The video picker uses the same retained streaming upload path.
  const videoChooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload video',exact:true}).click();await (await videoChooser).setFiles(join(fixtureDir,'existing-hero.mp4'));
  await page.getByText('Uploaded to draft. Review the desktop and mobile previews, then Publish banner.',{exact:true}).waitFor();check(await page.locator('#sequence .sequence-item').count()===3,'Video picker uploads into draft');check(server.current().items.length===1,'Uploading another video never auto-publishes');
  // Hero additions do not change the retained Ananya controls.
  await page.locator('#slots .slot').filter({hasText:"Ananya's Pick photos"}).click();check(!(await page.locator('#heroUploadOptions').isVisible()),'Hero controls hidden in other sections');check(await page.locator('#autoPlay').isVisible(),'Ananya retains manual autoplay preference');check(await page.locator('#file').isVisible(),'Other sections retain image picker');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin fits viewport');assert.deepEqual(errors,[]);checks++;check(server.writes.every(k=>k.startsWith('brand/hero/')),'Only hero storage written');check(server.unexpected.length===0,'No other write attempts: '+JSON.stringify(server.unexpected));
  results.push({label,width,height,upload:true,draftIsolation:true,publish:true,reload:true,naturalVideoImageLoop:true,videoOnly:true,uploadFailureRetry:true,publishFailureRetry:true,otherSectionsPreserved:true});await context.close();console.log('PASS '+label);
 }
 await browser.close();browser=null;
 }
 await writeFile(join(out,'regression.json'),JSON.stringify({passed:true,checks,productionWrites:0,actualRuntime:!!process.env.HIDI_HERO_FIXTURE,actualRetainedHandler:true,storefrontImageFitOnly:true,results},null,2));
}catch(error){
 const diagnostics=[];for(const [i,page] of pages.entries()){if(page.isClosed())continue;await page.screenshot({path:join(out,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});diagnostics.push(await page.evaluate(()=>({url:location.href,title:document.title,text:document.body.innerText.slice(0,1500),scripts:[...document.scripts].map(s=>s.src).filter(Boolean),videos:[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,paused:v.paused,readyState:v.readyState,error:v.error?.message,time:v.currentTime})),hero:document.querySelector('.hero-media')?.outerHTML.slice(0,4000)})).catch(()=>({unavailable:true})));}
 await writeFile(join(out,'failure.json'),JSON.stringify({message:error.message,diagnostics,runtimeLogs:server.runtimeLogs()},null,2));throw error;
}finally{await browser?.close();await server.close()}

