import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {normalizeMirror,isMirrorAsset,mirrorAssetUrl} from './asset-mirror.mjs';
const sha='a'.repeat(64),path='/media-performance/assets/poster-'+sha.slice(0,16)+'.avif',main='/assets/index-'+sha.slice(0,16)+'.js',mp4='/media-performance/assets/hero-av1-'+sha.slice(0,16)+'-1280.mp4',origin='https://hidi-test.azurestaticapps.net',proof={passed:true,bootOnce:true,origin,files:{[path]:sha,[main]:sha,[mp4]:sha}};
const edgeOrigin='https://hidi-performance-posters.pages.dev';
test('only identical current assets on the exact owned edge host are eligible; future hashes keep Azure delivery',()=>{
 const value={...proof,edgeOrigin,edgeFiles:{[main]:sha}},mirror=normalizeMirror(value);assert(mirror);assert.equal(mirrorAssetUrl(main,mirror),edgeOrigin+main);assert.equal(mirrorAssetUrl(path,mirror),origin+path);assert(isMirrorAsset(edgeOrigin+main,mirror));
 for(const url of [edgeOrigin+path,edgeOrigin+main+'?x',edgeOrigin+'/api/store/products','https://other.pages.dev'+main])assert(!isMirrorAsset(url,mirror));
 for(const change of [{edgeOrigin:'https://other.pages.dev'},{edgeFiles:{[main]:'b'.repeat(64)}},{edgeFiles:{'/config.js':sha}},{edgeFiles:{}}])assert.equal(normalizeMirror({...value,...change}),null);
});
test('edge poster and video failures recover to original HIDI bytes without looping',()=>{
 const images=[],window={},video={poster:edgeOrigin+path},context={window,Set,Map,Object,Image:class{constructor(){images.push(this);}},setTimeout:()=>1,clearTimeout:()=>{},document:{querySelectorAll:()=>[video]}};
 runInNewContext(readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8').replace('__HIDI_ASSET_MIRROR__',JSON.stringify({...proof,edgeOrigin,edgeFiles:proof.files})),context);
 assert.equal(window.__HidiAssetUrl(main),edgeOrigin+main);assert.equal(window.__HidiMirrorPoster(path),edgeOrigin+path);images[0].onerror();assert.equal(video.poster,path);assert.equal(window.__HidiMirrorPoster(path),path);images[1].onerror();assert.equal(images.length,2);
 let loaded=0;const movie={src:edgeOrigin+mp4,load:()=>loaded++};assert(window.__HidiMirrorVideoFallback(movie,mp4));assert.equal(movie.src,mp4);assert.equal(loaded,1);assert(!window.__HidiMirrorVideoFallback(movie,mp4));
});
test('only verified immutable assets on the exact HTTPS mirror are first-party',()=>{const mirror=normalizeMirror(proof);assert(mirror);assert(isMirrorAsset(origin+path,mirror));for(const url of [origin+path+'?x',origin+path+'#x',origin+'/api/store/products','https://other.azurestaticapps.net'+path,'https://evil.example'+path])assert(!isMirrorAsset(url,mirror));for(const value of [{...proof,bootOnce:false},{...proof,origin:'http://hidi-test.azurestaticapps.net'},{...proof,files:{'/config.js':sha}},{...proof,files:{[path]:'b'.repeat(64)}}])assert.equal(normalizeMirror(value),null);});
test('poster, video and application return to the original origin on mirror failure',()=>{
 const timers=[],images=[],scripts=[],video={poster:origin+path},app={dataset:{hidiMirrorApp:main}};
 const window={},context={window,Set,Object,Image:class{constructor(){images.push(this);}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},document:{querySelectorAll:()=>[video],querySelector:()=>app,createElement:()=>({}),head:{append:s=>scripts.push(s)}}};
 runInNewContext(readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8').replace('__HIDI_ASSET_MIRROR__',JSON.stringify(proof)),context);
 assert.equal(window.__HidiMirrorPoster(path),origin+path);assert.equal(images.length,1);window.__HidiMirrorPoster(path);assert.equal(images.length,1);images[0].onerror();assert.equal(video.poster,path);assert.equal(window.__HidiMirrorPoster(path),path);
 let loaded=0,played=0;const movie={src:origin+mp4,autoplay:true,load:()=>loaded++,play:()=>{played++;return Promise.resolve();}};assert.equal(window.__HidiMirrorVideoFallback(movie,mp4),true);assert.equal(movie.src,mp4);assert.equal(loaded,1);assert.equal(played,1);assert.equal(window.__HidiMirrorVideoFallback(movie,mp4),false);assert.equal(window.__HidiAssetUrl(mp4),mp4);
 window.__HidiAppFallback();window.__HidiAppFallback();assert.equal(scripts.length,1);assert.equal(scripts[0].src,main);assert.equal(scripts[0].type,'module');
 window.__HidiAppStarted=true;timers[0]();assert.equal(scripts.length,1);
});

test('a completed cached poster does not fall back while its load event is queued',()=>{
 const timers=[],window={},video={poster:origin+path},context={window,Set,Object,Image:class{complete=true;naturalWidth=1280;},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},document:{querySelectorAll:()=>[video]}};
 runInNewContext(readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8').replace('__HIDI_ASSET_MIRROR__',JSON.stringify(proof)),context);assert.equal(window.__HidiMirrorPoster(path),origin+path);timers.at(-1)();assert.equal(video.poster,origin+path);assert.equal(window.__HidiAssetUrl(path),origin+path);
});
test('verified mobile origin posters recover to the identical mirror once, including React poster reads',()=>{
 const images=[],video={poster:'https://hidiindia.com'+path,getAttribute:()=>path},window={},timers=[];
 const context={window,Set,Map,Object,matchMedia:()=>({matches:true}),Image:class{constructor(){images.push(this);}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},document:{querySelectorAll:()=>[video]}};
 runInNewContext(readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8').replace('__HIDI_ASSET_MIRROR__',JSON.stringify({...proof,originPosters:[path]})),context);
 assert.equal(window.__HidiMirrorPoster(path),path);assert.equal(images.length,1);images[0].onerror();assert.equal(video.poster,origin+path);assert.equal(window.__HidiMirrorPoster(path),origin+path);assert.equal(images.length,2);images[1].onerror();for(const timer of timers.slice(1))timer();assert.equal(images.length,2);assert.equal(window.__HidiMirrorPoster(path),origin+path);
});
test('desktop keeps mirrored poster delivery even when the same path is enabled for mobile origin',()=>{
 const images=[],window={},context={window,Set,Map,Object,matchMedia:()=>({matches:false}),Image:class{constructor(){images.push(this);}},setTimeout:()=>1,clearTimeout:()=>{},document:{querySelectorAll:()=>[]}};
 runInNewContext(readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8').replace('__HIDI_ASSET_MIRROR__',JSON.stringify({...proof,originPosters:[path]})),context);assert.equal(window.__HidiMirrorPoster(path),origin+path);assert.equal(images[0].src,origin+path);
});
test('mobile inline bytes remain identical across hero handoff and recover to origin on decode error',()=>{
 const value='data:image/avif;base64,YWJj',images=[],window={},video={poster:value},context={window,Set,Map,Object,matchMedia:()=>({matches:true}),Image:class{constructor(){images.push(this);}},setTimeout:()=>1,clearTimeout:()=>{},document:{querySelectorAll:()=>[video]}};
 runInNewContext(readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8').replace('__HIDI_ASSET_MIRROR__',JSON.stringify({...proof,inlinePosters:{[path]:value}})),context);assert.equal(window.__HidiMirrorPoster(path),value);assert.equal(window.__HidiMirrorPoster(path),value);assert.equal(images.length,1);images[0].onerror();assert.equal(video.poster,path);assert.equal(window.__HidiMirrorPoster(path),path);assert.equal(images.length,2);
});

test('application recovery waits for streamed markup and configuration to finish parsing',()=>{
 const window={},scripts=[],listeners={},document={readyState:'loading',addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name],querySelector:()=>({dataset:{hidiMirrorApp:main},integrity:'sha256-test'}),createElement:()=>({}),head:{append:script=>scripts.push(script)}};
 runInNewContext(readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8').replace('__HIDI_ASSET_MIRROR__',JSON.stringify(proof)),{window,Set,Object,document,setTimeout:()=>1,clearTimeout:()=>{}});
 window.__HidiAppFallback();window.__HidiAppFallback();assert.equal(scripts.length,0);assert.equal(Object.keys(listeners).length,1);document.readyState='interactive';listeners.readystatechange();assert.equal(scripts.length,1);assert.equal(scripts[0].integrity,'sha256-test');assert.equal(Object.keys(listeners).length,0);window.__HidiAppFallback();assert.equal(scripts.length,1);
});


test('verified desktop origin posters reuse HIDI and recover to exact edge bytes once without affecting mobile selection',()=>{
 for(const mobile of [false,true]){
  const images=[],video={poster:'https://hidiindia.com'+path,getAttribute:()=>path},window={};
  const context={window,Set,Map,Object,matchMedia:()=>({matches:mobile}),Image:class{constructor(){images.push(this);}},setTimeout:()=>1,clearTimeout:()=>{},document:{querySelectorAll:()=>[video]}};
  runInNewContext(readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8').replace('__HIDI_ASSET_MIRROR__',JSON.stringify({...proof,edgeOrigin,edgeFiles:proof.files,desktopOriginPosters:[path]})),context);
  if(mobile){assert.equal(window.__HidiMirrorPoster(path),edgeOrigin+path);continue;}
  assert.equal(window.__HidiMirrorPoster(path),path);images[0].onerror();assert.equal(video.poster,edgeOrigin+path);assert.equal(window.__HidiMirrorPoster(path),edgeOrigin+path);images[1].onerror();assert.equal(images.length,2);
 }
});
