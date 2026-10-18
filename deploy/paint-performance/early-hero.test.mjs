import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('./early-hero.js',import.meta.url),'utf8');
test('desktop handoff can follow a confirmed native-poster paint, never another element paint',async()=>{
 let callback,decode,disconnected=0,next=0,settled=false;const timers=new Map(),video={poster:'/poster.avif'},window={};
 class Observer{static supportedEntryTypes=['largest-contentful-paint'];constructor(fn){callback=fn;}observe(options){assert.equal(options.type,'largest-contentful-paint');assert(options.buffered);}disconnect(){disconnected++;}}
 const context={window,PerformanceObserver:Observer,location:{pathname:'/'},document:{visibilityState:'visible',readyState:'loading',querySelector:()=>video,addEventListener:()=>{}},AbortController,fetch:async()=>null,matchMedia:()=>({matches:false}),setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:()=>{},Image:class{naturalWidth=2;set src(value){if(value.startsWith('data:'))queueMicrotask(()=>this.onload());}decode(){return new Promise(resolve=>decode=resolve);}}};runInNewContext(code,context);
 const ready=window.__HidiWaitForPosterPaint(video).then(()=>settled=true);callback({getEntries:()=>[{element:{}}]});await Promise.resolve();assert(!settled);decode();await Promise.resolve();callback({getEntries:()=>[{element:video}]});await ready;assert(settled);assert.equal(disconnected,1);assert(![...timers.values()].some(timer=>timer.ms===1200));
});
test('portrait crop retains framing only for centred tall phone rectangles; focal or shape changes use the full frame',()=>{
 for(const eligible of [true,false]){let rect={width:390,height:900};const context={window:{},location:{pathname:'/'},document:{querySelector:()=>({getBoundingClientRect:()=>rect})},AbortController,fetch:async()=>null,setTimeout:()=>1,clearTimeout:()=>{},matchMedia:query=>{assert.equal(query,'(max-width: 432px) and (min-height: 760px)');return {matches:eligible};},Image:class{set src(value){}}};runInNewContext(code,context);
 const variant={avifPoster:'/full.avif',avifPosterSmall:'/portrait.avif',posterCrop:{width:512,height:720}};
 assert.equal(context.window.__HidiAvifPoster(variant,'50% 50%'),eligible?'/portrait.avif':'/full.avif');assert.equal(context.window.__HidiAvifPoster(variant,'20% 50%'),'/full.avif');assert.equal(context.window.__HidiAvifPoster({avifPoster:'/full.avif'}),'/full.avif');rect={width:432,height:500};assert.equal(context.window.__HidiAvifPoster(variant),'/full.avif');
 }
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
 let decode,paint,settled=false,next=0;const timers=new Map(),context={window:{},location:{pathname:'/'},document:{visibilityState:'visible'},PerformanceObserver:class{static supportedEntryTypes=['largest-contentful-paint'];observe(){throw Error('unsupported observer');}},matchMedia:()=>({matches:false}),AbortController,fetch:async()=>null,setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>paint=fn,Image:class{naturalWidth=2;set src(value){if(value.startsWith('data:'))queueMicrotask(()=>this.onload());}decode(){return new Promise(resolve=>decode=resolve);}}};runInNewContext(code,context);
 const ready=context.window.__HidiWaitForPosterPaint({poster:'/poster.avif'}).then(()=>settled=true);await Promise.resolve();assert(!settled);decode();await Promise.resolve();assert(paint);assert(!settled);paint();assert(!settled);paint();[...timers.values()].find(timer=>timer.ms===0).fn();await ready;assert(settled);assert(![...timers.values()].some(timer=>timer.ms===1200));
 settled=false;const fallback=context.window.__HidiWaitForPosterPaint({poster:'/slow.avif'}).then(()=>settled=true);[...timers.values()].find(timer=>timer.ms===1200).fn();await fallback;assert(settled);context.document.visibilityState='hidden';await context.window.__HidiWaitForPosterPaint({poster:'/background.avif'});
});

test('desktop crop applies only within its centred fitted field; wider and off-centre frames retain all original pixels',()=>{
 let rect={width:1350,height:940},matches=true;const context={window:{},location:{pathname:'/'},document:{querySelector:()=>({getBoundingClientRect:()=>rect})},AbortController,fetch:async()=>null,setTimeout:()=>1,clearTimeout:()=>{},matchMedia:query=>{assert.equal(query,'(min-width: 701px) and (max-aspect-ratio: 40/27)');return {matches};},Image:class{set src(value){}}};runInNewContext(code,context);const variant={avifPoster:'/full.avif',avifPosterSmall:'/tall.avif',posterCrop:{sourceWidth:1920,width:1600,height:1080}};assert.equal(context.window.__HidiAvifPoster(variant),'/tall.avif');assert.equal(context.window.__HidiAvifPoster(variant,'20% 50%'),'/full.avif');rect={width:1440,height:900};assert.equal(context.window.__HidiAvifPoster(variant),'/full.avif');rect={width:1350,height:940};matches=false;assert.equal(context.window.__HidiAvifPoster(variant),'/full.avif');
});
