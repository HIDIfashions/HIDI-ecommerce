import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {readMirrorProof,isMirrorAsset} from './asset-mirror.mjs';
import {existsSync} from 'node:fs';
import {createSlowDocumentProxy} from './slow-document-proxy.mjs';
export async function verifyMirrorFallback(pw,base,out,mode){
 const mirror=await readMirrorProof(out);if(!mirror)return;
 const rows=[],slow=await createSlowDocumentProxy(base);
 try{for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
  try{for(const width of [390,1440])for(const scenario of ['offline','late-main','media-offline','tampered-main','slow-document','origin-media-offline','tampered-style']){
   const targetBase=scenario==='slow-document'?slow.url:base;
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],reads=[];
   let tamperedStyles=0;const requests=[];page.on('requestfailed',request=>requests.push({url:request.url(),error:request.failure()}));
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname==='/api/store/products')reads.push(request.url());});
   try{
    await page.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(!['GET','HEAD'].includes(request.method())||url.origin!==new URL(targetBase).origin&&!isMirrorAsset(url.href,mirror))return route.abort();
     if(scenario==='origin-media-offline'&&url.origin===new URL(targetBase).origin&&url.pathname.endsWith('.avif')&&Object.hasOwn(mirror.files,url.pathname))return route.abort();
     if(isMirrorAsset(url.href,mirror)){
      if(scenario==='tampered-style'&&url.pathname.endsWith('.css')){tamperedStyles++;return route.fulfill({status:200,headers:{'content-type':'text/css','access-control-allow-origin':'*'},body:'body{display:none!important}'});}
      if(scenario==='slow-document'&&url.pathname.endsWith('.js'))return route.abort();
      if(scenario==='tampered-main'&&url.pathname.endsWith('.js'))return route.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:'window.__HidiMirrorTampered=true;'});
      if(scenario==='offline'||scenario==='media-offline'&&!url.pathname.endsWith('.js'))return route.abort();
      if(scenario==='late-main'&&url.pathname.endsWith('.js'))await new Promise(done=>setTimeout(done,2500));
     }
     return route.fallback();
    });
    await page.goto(targetBase+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.querySelector('video[data-hidi-first-hero]')&&document.querySelector('.hero-media')?.dataset.heroConfigStatus==='uploaded');
    await page.evaluate(()=>window.__HidiFallbackHero=document.querySelector('.hero-media'));
    await page.getByRole('button',{name:'Turn video sound on'}).click();
    await page.waitForFunction(()=>document.querySelector('video.hero-live-media')?.readyState>=2);
    await page.waitForTimeout(scenario==='late-main'?3000:500);
    const result=await page.evaluate(()=>({sameHero:window.__HidiFallbackHero===document.querySelector('.hero-media'),poster:document.querySelector('video.hero-live-media').poster,src:document.querySelector('video.hero-live-media').currentSrc,started:window.__HidiAppStarted,mainCount:document.querySelectorAll('main#main').length,tampered:window.__HidiMirrorTampered}));
    assert(result.sameHero&&result.started&&result.mainCount===1,'Late mirror module must not mount a second application');assert.equal(reads.length,1,'Fallback must retain one fresh catalogue request');assert.deepEqual(scenario==='tampered-main'?errors.filter(error=>error!=='Cannot load script due to integrity mismatch'):errors,[]);
    assert(!result.tampered,'Subresource integrity must block modified mirrored code');
    if(scenario==='tampered-style'){
     assert(tamperedStyles>0,'The browser must actually encounter the corrupted stylesheet');
     const styles=await page.locator('link[data-hidi-origin-href]').evaluateAll(links=>links.map(link=>({href:link.href,original:link.dataset.hidiOriginHref,integrity:link.integrity,loaded:Boolean(link.sheet),media:link.media})));
     assert(styles.length>0&&styles.every(link=>new URL(link.href).origin===new URL(base).origin&&!link.integrity&&link.loaded&&link.media==='all'),'SRI failure must load the original complete CSS before application startup');
    }
    if(['offline','media-offline'].includes(scenario)){assert.equal(new URL(result.poster).origin,new URL(base).origin);assert.equal(new URL(result.src).origin,new URL(base).origin);}
    if(scenario==='origin-media-offline')assert.equal(new URL(result.poster).origin,mirror.origin,'Original poster failure must recover to verified mirrored bytes');
    rows.push({engine,width,scenario,passed:true,oneApplication:true,oneCatalogueRead:true});console.log('PASS mirror recovery '+mode+' '+engine+' '+width+' '+scenario);
   }catch(error){
    const stem=out+'/mirror-'+mode+'-'+engine+'-'+width+'-'+scenario+'-failure';
    const state=await page.evaluate(()=>{const video=document.querySelector('video.hero-live-media');const probe=document.createElement('video');return {started:window.__HidiAppStarted,heroStatus:document.querySelector('.hero-media')?.dataset.heroConfigStatus,video:video?{src:video.src,currentSrc:video.currentSrc,readyState:video.readyState,networkState:video.networkState,paused:video.paused,autoplay:video.autoplay,error:video.error?.message,html:video.outerHTML}:null,codecs:{h264:probe.canPlayType('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'),av1:probe.canPlayType('video/mp4; codecs="av01.0.05M.08,mp4a.40.2"')}};}).catch(()=>null);
    await writeFile(stem+'.json',JSON.stringify({error:String(error),engine,width,scenario,errors,reads,requests,state},null,2));await writeFile(stem+'.html',await page.content());await page.screenshot({path:stem+'.png'}).catch(()=>{});throw error;
   }finally{await context.close();}
  }}finally{await browser.close();}
 }}finally{slow.close();}
 assert.equal(rows.length,28);await writeFile(out+'/mirror-fallback-'+mode+'.json',JSON.stringify({passed:true,cases:rows,writes:0,originRecovery:true,mirrorRecovery:true,lateModuleBootOnce:true,integrityRecovery:true,streamedDocumentRecovery:true,stylesheetIntegrityRecovery:true}));
}
