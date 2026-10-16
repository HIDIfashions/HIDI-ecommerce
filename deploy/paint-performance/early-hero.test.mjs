import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('./early-hero.js',import.meta.url),'utf8');
test('early selection request is homepage-only, fresh, bounded and falls back on failure',async()=>{
 let calls=0,cleared=0;const context={window:{},location:{pathname:'/'},AbortController,setTimeout:()=>1,clearTimeout:()=>cleared++,fetch:async(url,options)=>{calls++;assert(['/api/hidi/hero-config','/api/hidi/landing-media-config'].includes(url));assert.equal(options.cache,'no-store');assert(options.signal);return {ok:true};}};
 runInNewContext(code,context);assert((await context.window.__HidiHeroEarly).ok);assert.equal(calls,2);assert.equal(cleared,2);assert((await context.window.__HidiLandingEarly).ok);
 context.location.pathname='/about';context.window={};runInNewContext(code,context);assert.equal(calls,2);assert.equal(context.window.__HidiHeroEarly,undefined);assert.equal(context.window.__HidiLandingEarly,undefined);
 context.location.pathname='/';context.fetch=async()=>{throw Error('unavailable');};runInNewContext(code,context);assert.equal(await context.window.__HidiHeroEarly,null);assert.equal(await context.window.__HidiLandingEarly,null);
});

test('AVIF capability detection resolves both decoding and safe fallback',async()=>{
 for(const supported of [true,false]){
  const context={window:{},location:{pathname:'/'},AbortController,setTimeout:()=>1,clearTimeout:()=>{},fetch:async()=>null,Image:class {naturalWidth=supported?2:0;set src(value){assert(value.startsWith('data:image/avif;base64,'));queueMicrotask(()=>supported?this.onload():this.onerror());}}};
  runInNewContext(code,context);assert.equal(await context.window.__HidiAvifSupport,supported);
 }
});
