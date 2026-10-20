import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('./app-start.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};

function fixture({mobile=true,native=true,preload=true}={}){
 let avifReady,posterReady,nextTimer=1,queueClaims=0,startClaims=0;
 const appended=[],events={},timers=new Map();
 const original={dataset:{hidiQueuedSrc:'https://hidi.azurestaticapps.net/assets/index.js'},attributes:[
  {name:'type',value:'application/x-hidi-queued-module'},
  {name:'data-hidi-queued-src',value:'source'},
  {name:'integrity',value:'sha256-reviewed'},
  {name:'crossorigin',value:'anonymous'},
  {name:'onerror',value:'window.__HidiAppFallback()'},
  {name:'data-hidi-mirror-app',value:'/assets/index.js'}
 ]};
 const nativeVideo=native?{poster:'/poster.avif',isConnected:true,matches:selector=>selector==='video[data-hidi-first-hero]'}:null;
 const preloadLink=preload?{addEventListener:(name,fn)=>events[name]=fn}:null;
 const window={
  __HidiAvifSupport:new Promise(done=>avifReady=done),
  __HidiNativePosterReady:new Promise(done=>posterReady=done),
  __HidiQueuePrimaryApp:()=>{queueClaims++;return true;},
  __HidiStartPrimaryApp:()=>{startClaims++;return true;}
 };
 const document={
  querySelector(selector){
   if(selector.includes('queued'))return original;
   if(selector.includes('video'))return nativeVideo;
   if(selector.includes('desktop-preload'))return preloadLink;
   return null;
  },
  createElement:()=>({setAttribute(name,value){this[name]=value;}}),
  head:{append:item=>appended.push(item)}
 };
 const setTimeout=(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;};
 const clearTimeout=id=>timers.delete(id);
 runInNewContext(code,{window,document,Promise,Number,matchMedia:()=>({matches:mobile}),setTimeout,clearTimeout});
 const resolvePoster=async({verified=true,paint={}}={})=>{
  avifReady(true);await flush();
  if(verified)window.__HidiNativePosterPaint={video:nativeVideo,poster:nativeVideo?.poster,renderTime:1,...paint};
  posterReady();await flush();
 };
 const fire=ms=>{
  const entry=[...timers.entries()].find(([,timer])=>timer.ms===ms);
  assert.ok(entry,`expected an active ${ms}ms timer`);
  timers.delete(entry[0]);entry[1].fn();
 };
 return {window,original,nativeVideo,appended,events,timers,resolvePoster,fire,
  get queueClaims(){return queueClaims;},get startClaims(){return startClaims;}};
}

test('mobile waits for native readiness, preserves application attributes, and starts once',async()=>{
 const f=fixture();
 assert.equal(f.queueClaims,1);assert.equal(f.appended.length,0);
 await f.resolvePoster({verified:false});
 assert.equal(f.appended.length,1);
 const script=f.appended[0];
 assert.equal(script.type,'module');assert.equal(script.src,f.original.dataset.hidiQueuedSrc);
 assert.equal(script.integrity,'sha256-reviewed');assert.equal(script.crossorigin,'anonymous');
 assert.equal(script.onerror,'window.__HidiAppFallback()');assert.equal(script['data-hidi-mirror-app'],'/assets/index.js');
 assert.equal(script.fetchPriority,undefined);assert.equal(script['data-hidi-queued-src'],undefined);
 f.fire(1200);assert.equal(f.appended.length,1);assert.equal(f.startClaims,1);
});

test('desktop native startup waits when preload finishes before verified poster paint',async()=>{
 const f=fixture({mobile:false});
 f.events.load();assert.equal(f.appended.length,0);
 await f.resolvePoster();
 assert.equal(f.appended.length,1);assert.equal(f.startClaims,1);assert.equal(f.timers.size,0);
 assert.equal(f.appended[0].fetchPriority,'low');assert.equal(f.appended[0].integrity,'sha256-reviewed');
});

test('desktop native startup waits when verified poster paint finishes before preload',async()=>{
 const f=fixture({mobile:false});
 await f.resolvePoster();assert.equal(f.appended.length,0);
 f.events.error();assert.equal(f.appended.length,1);assert.equal(f.startClaims,1);assert.equal(f.timers.size,0);
 f.events.error();f.events.load();assert.equal(f.appended.length,1);
});

test('desktop ignores an unverified poster-ready signal until the bounded fallback',async()=>{
 const f=fixture({mobile:false});
 f.events.load();
 await f.resolvePoster({verified:true,paint:{video:{},renderTime:0}});
 assert.equal(f.appended.length,0);assert.equal(f.startClaims,0);
 f.fire(1500);assert.equal(f.appended.length,1);assert.equal(f.startClaims,1);
 f.window.__HidiNativePosterPaint={video:f.nativeVideo,poster:f.nativeVideo.poster,renderTime:2};
 f.events.load();f.events.error();await flush();assert.equal(f.appended.length,1);
});

test('desktop native startup is bounded when paint and preload both stall',()=>{
 const f=fixture({mobile:false});
 assert.equal(f.appended.length,0);f.fire(1500);
 assert.equal(f.appended.length,1);assert.equal(f.startClaims,1);assert.equal(f.appended[0].fetchPriority,'low');
});

test('desktop without native markup retains preload release and bounded recovery',()=>{
 for(const releaseEvent of ['load','error']){
  const f=fixture({mobile:false,native:false});
  assert.equal(f.appended.length,0);f.events[releaseEvent]();
  assert.equal(f.appended.length,1);assert.equal(f.startClaims,1);assert.equal(f.timers.size,0);
  f.events.load();f.events.error();assert.equal(f.appended.length,1);
 }
 const stalled=fixture({mobile:false,native:false});
 stalled.fire(1500);assert.equal(stalled.appended.length,1);assert.equal(stalled.startClaims,1);
 const immediate=fixture({mobile:false,native:false,preload:false});
 assert.equal(immediate.appended.length,1);assert.equal(immediate.startClaims,1);assert.equal(immediate.timers.size,0);
});
