import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const mirrorSource=readFileSync(new URL('./asset-mirror-client.js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('./app-start.js',import.meta.url),'utf8');
const path='/assets/index-reviewed.js',origin='https://hidi-test.azurestaticapps.net';
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};

function fixture({mobile=true,readyState='interactive',native=true,primary='success',fetchMs=600,markup=true}={}){
 let now=0,nextId=1,resolvePoster,mounts=0;
 const jobs=new Map(),events={},requests=[],preloadEvents={};
 const setTimeout=(fn,ms)=>{const id=nextId++;jobs.set(id,{fn,at:now+ms,ms});return id;};
 const clearTimeout=id=>jobs.delete(id);
 const window={__HidiAvifSupport:Promise.resolve(true),__HidiNativePosterReady:new Promise(resolve=>resolvePoster=resolve),__HidiFullCssReady:new Promise(()=>{})};
 const original={dataset:{hidiQueuedSrc:origin+path,hidiMirrorApp:path},integrity:'sha256-reviewed',attributes:[
  {name:'type',value:'application/x-hidi-queued-module'},{name:'data-hidi-queued-src',value:origin+path},
  {name:'integrity',value:'sha256-reviewed'},{name:'crossorigin',value:'anonymous'},
  {name:'data-hidi-mirror-app',value:path},{name:'onerror',value:'window.__HidiAppFallback()'}
 ]};
 const evaluate=()=>{if(!window.__HidiAppStarted){window.__HidiAppStarted=true;mounts++;}};
 const document={readyState,
  querySelector(selector){
   if(selector.includes('script'))return !markup&&selector.includes('queued')?null:original;
   if(selector.includes('desktop-preload'))return {addEventListener:(name,fn)=>preloadEvents[name]=fn};
   return native?{}:null;
  },
  querySelectorAll:()=>[],
  addEventListener:(name,fn)=>events[name]=fn,
  removeEventListener:(name,fn)=>{if(events[name]===fn)delete events[name];},
  createElement:()=>({setAttribute(name,value){this[name]=value;}}),
  head:{append(script){
   requests.push({at:now,url:script.src,script});
   if(script.src===path)setTimeout(evaluate,50);
   else if(primary==='success')setTimeout(evaluate,fetchMs);
   else if(primary==='error')setTimeout(()=>window.__HidiAppFallback(),fetchMs);
  }}
 };
 const context={window,document,Promise,Map,Set,Object,matchMedia:()=>({matches:mobile}),setTimeout,clearTimeout};
 runInNewContext(mirrorSource.replace('__HIDI_ASSET_MIRROR__',JSON.stringify({origin,files:{[path]:true}})),context);
 const headCallback=[...jobs.values()][0].fn;
 const start=()=>runInNewContext(appSource,context);
 const advance=async target=>{
  await flush();
  while(true){
   const item=[...jobs.entries()].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
   if(!item||item[1].at>target)break;
   const [id,job]=item;jobs.delete(id);now=job.at;job.fn();await flush();
  }
  now=target;await flush();
 };
 return {window,document,events,requests,preloadEvents,headCallback,start,advance,resolvePoster,
  get mounts(){return mounts;},get now(){return now;}};
}

test('slow mobile poster plus healthy application uses one request and the original load deadline',async()=>{
 const f=fixture();f.start();await f.advance(1100);f.resolvePoster();await flush();
 assert.deepEqual(f.requests.map(r=>[r.at,r.url]),[[1100,origin+path]]);
 f.headCallback();await f.advance(1500);assert.equal(f.requests.length,1);
 await f.advance(3000);assert.equal(f.requests.length,1);assert.equal(f.mounts,1);
});

test('stalled mobile primary recovers 1500ms after dispatch and repeated claims cannot reset the clock',async()=>{
 const f=fixture({primary:'stall'});f.start();await f.advance(1100);f.resolvePoster();await flush();
 assert.equal(f.window.__HidiStartPrimaryApp(),false);
 await f.advance(2599);assert.equal(f.requests.length,1);
 await f.advance(2600);assert.deepEqual(f.requests.map(r=>[r.at,r.url]),[[1100,origin+path],[2600,path]]);
 assert.equal(f.requests[1].script.integrity,'sha256-reviewed');
 await f.advance(4000);assert.equal(f.mounts,1);assert.equal(f.requests.length,2);
});

test('desktop retains its preload wait and 3000ms deadline measured from primary dispatch',async()=>{
 const f=fixture({mobile:false,primary:'stall'});f.start();await f.advance(1200);f.preloadEvents.load();
 assert.deepEqual(f.requests.map(r=>[r.at,r.url]),[[1200,origin+path]]);
 await f.advance(4199);assert.equal(f.requests.length,1);
 await f.advance(4200);assert.equal(f.requests[1].url,path);assert.equal(f.requests[1].at,4200);
});

test('queued mobile and desktop startup remain bounded when their paint or preload never finishes',async()=>{
 for(const [mobile,dispatchAt,deadline] of [[true,1200,1500],[false,1500,3000]]){
  const f=fixture({mobile,primary:'stall'});f.start();await f.advance(dispatchAt-1);assert.equal(f.requests.length,0);
  await f.advance(dispatchAt);assert.equal(f.requests[0].url,origin+path);
  await f.advance(dispatchAt+deadline-1);assert.equal(f.requests.length,1);
  await f.advance(dispatchAt+deadline);assert.equal(f.requests[1].url,path);
 }
});

test('missing native markup starts immediately and evaluated application cannot fall back while CSS remains pending',async()=>{
 const f=fixture({native:false});f.start();assert.equal(f.requests[0].at,0);
 await f.advance(600);assert.equal(f.window.__HidiAppStarted,true);
 await f.advance(5000);assert.equal(f.requests.length,1);assert.equal(f.mounts,1);
});

test('application error recovers immediately with integrity and one startup claim',async()=>{
 const f=fixture({native:false,primary:'error',fetchMs:80});f.start();await f.advance(80);
 assert.deepEqual(f.requests.map(r=>[r.at,r.url]),[[0,origin+path],[80,path]]);
 assert.equal(f.requests[1].script.integrity,'sha256-reviewed');
 assert.equal(f.window.__HidiQueuePrimaryApp(),false);assert.equal(f.window.__HidiStartPrimaryApp(),false);
 await f.advance(5000);assert.equal(f.requests.length,2);assert.equal(f.mounts,1);
});

test('head failsafe remains bounded when queued startup never runs and prevents late primary download',async()=>{
 for(const [mobile,deadline] of [[true,1500],[false,3000]]){
  const f=fixture({mobile});await f.advance(deadline);
  assert.deepEqual(f.requests.map(r=>[r.at,r.url]),[[deadline,path]]);
  assert.equal(f.window.__HidiQueuePrimaryApp(),false);assert.equal(f.window.__HidiStartPrimaryApp(),false);
  f.start();f.resolvePoster();await f.advance(deadline+4000);
  assert.equal(f.requests.length,1);assert.equal(f.mounts,1);
 }
});

test('streamed head recovery waiting for parser is canceled before queued poster wait; stale callbacks cannot race',async()=>{
 const f=fixture({readyState:'loading'});await f.advance(1500);
 const staleReady=f.events.readystatechange;assert.equal(typeof staleReady,'function');assert.equal(f.requests.length,0);
 await f.advance(1700);f.start();assert.equal(f.events.readystatechange,undefined);
 f.document.readyState='interactive';staleReady();f.headCallback();assert.equal(f.requests.length,0);
 await f.advance(2800);f.resolvePoster();await flush();assert.equal(f.requests[0].at,2800);assert.equal(f.requests[0].url,origin+path);
 await f.advance(5000);assert.equal(f.requests.length,1);assert.equal(f.mounts,1);
});

test('real dispatched-primary recovery still waits for parser and executes once after stale callbacks are invalidated',async()=>{
 const f=fixture({readyState:'loading',native:false,primary:'stall'});await f.advance(1500);
 const staleReady=f.events.readystatechange;f.start();staleReady();
 await f.advance(3000);const activeReady=f.events.readystatechange;assert.equal(typeof activeReady,'function');
 assert.notEqual(activeReady,staleReady);assert.equal(f.requests.length,1);
 f.document.readyState='interactive';staleReady();assert.equal(f.requests.length,1);
 activeReady();activeReady();f.window.__HidiAppFallback();assert.equal(f.requests.length,2);assert.equal(f.requests[1].url,path);
 await f.advance(4000);assert.equal(f.mounts,1);
});

test('head failsafe is not canceled when app-start cannot find queued markup',async()=>{
 const f=fixture({markup:false});f.start();await f.advance(1500);
 assert.deepEqual(f.requests.map(r=>[r.at,r.url]),[[1500,path]]);
 assert.equal(f.window.__HidiQueuePrimaryApp(),false);
});
