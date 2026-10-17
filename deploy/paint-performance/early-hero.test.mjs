import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('./early-hero.js',import.meta.url),'utf8');
test('only phone screens fully covered by 768 physical pixels use the smaller poster',()=>{
 for(const small of [true,false]){const context={window:{},location:{pathname:'/'},AbortController,fetch:async()=>null,setTimeout:()=>1,clearTimeout:()=>{},matchMedia:query=>{assert.equal(query,'(max-width: 432px) and (max-resolution: 1.75dppx)');return {matches:small};},Image:class{set src(value){}}};runInNewContext(code,context);assert.equal(context.window.__HidiAvifPoster({avifPoster:'/full.avif',avifPosterSmall:'/small.avif'}),small?'/small.avif':'/full.avif');assert.equal(context.window.__HidiAvifPoster({avifPoster:'/full.avif'}),'/full.avif');}
});
test('hero stays fresh while catalogue and below-fold media wait for the poster, with bounded fallback',async()=>{
 let calls=0,cleared=0;const context={window:{},location:{pathname:'/'},AbortController,setTimeout:()=>1,clearTimeout:()=>cleared++,fetch:async(url,options)=>{calls++;assert(['/api/hidi/hero-config','/api/hidi/landing-media-config','/api/store/products'].includes(url));assert.equal(options.cache,'no-store');assert(options.signal);return {ok:true};}};
 runInNewContext(code,context);assert.equal(calls,1);assert((await context.window.__HidiHeroEarly).ok);context.window.__HidiStartHomeReads();context.window.__HidiStartHomeReads();assert.equal(calls,3);assert((await context.window.__HidiLandingEarly).ok);assert((await context.window.__HidiCatalogueEarly).ok);assert.equal(cleared,4);
 context.location.pathname='/about';context.window={};runInNewContext(code,context);assert.equal(calls,3);assert.equal(context.window.__HidiHeroEarly,undefined);assert.equal(context.window.__HidiLandingEarly,undefined);
 context.location.pathname='/';context.fetch=async()=>{throw Error('unavailable');};runInNewContext(code,context);context.window.__HidiStartHomeReads();assert.equal(await context.window.__HidiHeroEarly,null);assert.equal(await context.window.__HidiLandingEarly,null);assert.equal(await context.window.__HidiCatalogueEarly,null);
});

test('AVIF capability detection resolves both decoding and safe fallback',async()=>{
 for(const supported of [true,false]){
  const context={window:{},location:{pathname:'/'},AbortController,setTimeout:()=>1,clearTimeout:()=>{},fetch:async()=>null,Image:class {naturalWidth=supported?2:0;set src(value){assert(value.startsWith('data:image/avif;base64,'));queueMicrotask(()=>supported?this.onload():this.onerror());}}};
  runInNewContext(code,context);assert.equal(await context.window.__HidiAvifSupport,supported);
 }
});
test('native poster handoff waits for decoding and a paint, with a bounded error fallback',async()=>{
 let decode,paint,settled=false,next=0;const timers=new Map(),context={window:{},location:{pathname:'/'},document:{visibilityState:'visible'},AbortController,fetch:async()=>null,setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>paint=fn,Image:class{naturalWidth=2;set src(value){if(value.startsWith('data:'))queueMicrotask(()=>this.onload());}decode(){return new Promise(resolve=>decode=resolve);}}};runInNewContext(code,context);
 const ready=context.window.__HidiWaitForPosterPaint({poster:'/poster.avif'}).then(()=>settled=true);await Promise.resolve();assert(!settled);decode();await Promise.resolve();assert(paint);assert(!settled);paint();assert(!settled);paint();[...timers.values()].find(timer=>timer.ms===0).fn();await ready;assert(settled);assert(![...timers.values()].some(timer=>timer.ms===1200));
 settled=false;const fallback=context.window.__HidiWaitForPosterPaint({poster:'/slow.avif'}).then(()=>settled=true);[...timers.values()].find(timer=>timer.ms===1200).fn();await fallback;assert(settled);context.document.visibilityState='hidden';await context.window.__HidiWaitForPosterPaint({poster:'/background.avif'});
});
