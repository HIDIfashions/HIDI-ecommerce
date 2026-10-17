import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {readMirrorProof,isMirrorAsset} from './asset-mirror.mjs';
import {createSlowDocumentProxy} from './slow-document-proxy.mjs';
export async function verifyMirrorFallback(pw,base,out,mode){
 const mirror=await readMirrorProof(out);if(!mirror)return;
 const rows=[],slow=await createSlowDocumentProxy(base);
 try{for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{for(const width of [390,1440])for(const scenario of ['offline','late-main','media-offline','tampered-main','slow-document']){
   const targetBase=scenario==='slow-document'?slow.url:base;
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],reads=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname==='/api/store/products')reads.push(request.url());});
   try{
    await page.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(!['GET','HEAD'].includes(request.method())||url.origin!==new URL(targetBase).origin&&!isMirrorAsset(url.href,mirror))return route.abort();
     if(isMirrorAsset(url.href,mirror)){
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
    if(['offline','media-offline'].includes(scenario)){assert.equal(new URL(result.poster).origin,new URL(base).origin);assert.equal(new URL(result.src).origin,new URL(base).origin);}
    rows.push({engine,width,scenario,passed:true,oneApplication:true,oneCatalogueRead:true});console.log('PASS mirror recovery '+mode+' '+engine+' '+width+' '+scenario);
   }finally{await context.close();}
  }}finally{await browser.close();}
 }}finally{slow.close();}
 assert.equal(rows.length,20);await writeFile(out+'/mirror-fallback-'+mode+'.json',JSON.stringify({passed:true,cases:rows,writes:0,originRecovery:true,lateModuleBootOnce:true,integrityRecovery:true,streamedDocumentRecovery:true}));
}
