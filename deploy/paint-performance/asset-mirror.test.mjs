import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {normalizeMirror,isMirrorAsset} from './asset-mirror.mjs';
const sha='a'.repeat(64),path='/media-performance/assets/poster-'+sha.slice(0,16)+'.avif',main='/assets/index-'+sha.slice(0,16)+'.js',mp4='/media-performance/assets/hero-av1-'+sha.slice(0,16)+'-1280.mp4',origin='https://hidi-test.azurestaticapps.net',proof={passed:true,bootOnce:true,origin,files:{[path]:sha,[main]:sha,[mp4]:sha}};
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
