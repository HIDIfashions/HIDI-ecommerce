import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('./early-hero.js',import.meta.url),'utf8');
test('early selection request is homepage-only, fresh, bounded and falls back on failure',async()=>{
 let calls=0,cleared=0;const context={window:{},location:{pathname:'/'},AbortController,setTimeout:()=>1,clearTimeout:()=>cleared++,fetch:async(url,options)=>{calls++;assert.equal(url,'/api/hidi/hero-config');assert.equal(options.cache,'no-store');assert(options.signal);return {ok:true};}};
 runInNewContext(code,context);assert((await context.window.__HidiHeroEarly).ok);assert.equal(calls,1);assert.equal(cleared,1);
 context.location.pathname='/about';context.window={};runInNewContext(code,context);assert.equal(calls,1);assert.equal(context.window.__HidiHeroEarly,undefined);
 context.location.pathname='/';context.fetch=async()=>{throw Error('unavailable');};runInNewContext(code,context);assert.equal(await context.window.__HidiHeroEarly,null);
});
