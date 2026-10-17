import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('./app-start.js',import.meta.url),'utf8');
test('mobile application waits for native paint without losing integrity or recovery; desktop starts immediately',async()=>{
 for(const mobile of [true,false]){
  let avifReady,posterReady;const appended=[],timers=[];
  const original={dataset:{hidiQueuedSrc:'https://hidi.azurestaticapps.net/assets/index.js'},attributes:[{name:'type',value:'application/x-hidi-queued-module'},{name:'data-hidi-queued-src',value:'source'},{name:'integrity',value:'sha256-reviewed'},{name:'crossorigin',value:'anonymous'},{name:'onerror',value:'window.__HidiAppFallback()'},{name:'data-hidi-mirror-app',value:'/assets/index.js'}]};
  const window={__HidiAvifSupport:new Promise(done=>avifReady=done),__HidiNativePosterReady:new Promise(done=>posterReady=done)};
  const document={querySelector:selector=>selector.includes('queued')?original:{},createElement:()=>({setAttribute(key,value){this[key]=value;}}),head:{append:item=>appended.push(item)}};
  runInNewContext(code,{window,document,Promise,matchMedia:()=>({matches:mobile}),setTimeout:(fn,ms)=>timers.push({fn,ms})});
  await new Promise(setImmediate);assert.equal(appended.length,mobile?0:1);
  avifReady(true);await new Promise(setImmediate);assert.equal(appended.length,mobile?0:1);posterReady();await new Promise(setImmediate);assert.equal(appended.length,1);
  if(mobile){timers[0].fn();assert.equal(appended.length,1);assert.equal(timers[0].ms,1200);}
  assert.equal(appended[0].type,'module');assert.equal(appended[0].src,original.dataset.hidiQueuedSrc);assert.equal(appended[0].integrity,'sha256-reviewed');assert.equal(appended[0].onerror,'window.__HidiAppFallback()');assert.equal(appended[0]['data-hidi-mirror-app'],'/assets/index.js');
 }
});
test('a stalled poster has one bounded application start; native markup absence never delays startup',async()=>{
 for(const native of [true,false]){const appended=[],timers=[],original={dataset:{hidiQueuedSrc:'/app.js'},attributes:[]},window={__HidiAvifSupport:new Promise(()=>{})},document={querySelector:selector=>selector.includes('queued')?original:native?{}:null,createElement:()=>({}),head:{append:item=>appended.push(item)}};
  runInNewContext(code,{window,document,Promise,matchMedia:()=>({matches:true}),setTimeout:(fn,ms)=>timers.push({fn,ms})});
  if(native){assert.equal(appended.length,0);timers[0].fn();timers[0].fn();}assert.equal(appended.length,1);
 }
});
