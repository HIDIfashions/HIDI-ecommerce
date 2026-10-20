import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./full-css-client.js',import.meta.url),'utf8');
function fixture(change=()=>{}){
 const requests=[],events={},timers=[],removed=[];
 const video={isConnected:true,poster:'https://posters.example/verified.avif'};
 const window={__HidiNativePosterPaint:{video,poster:video.poster,renderTime:100}};
 const document={readyState:'loading',visibilityState:'visible',body:{moveBefore(){}},querySelector:()=>video,querySelectorAll:()=>[link],addEventListener(){}};
 const link={dataset:{hidiFullHref:'https://styles.example/full.css',hidiOriginHref:'/original.css'},fetchPriority:'low',media:'print',integrity:'sha256-original',crossOrigin:'anonymous',
  addEventListener:(name,fn)=>events[name]=fn,removeAttribute:name=>removed.push(name),
  set href(value){this._href=value;requests.push({url:value,priority:this.fetchPriority,integrity:this.integrity,crossOrigin:this.crossOrigin});},get href(){return this._href;}};
 const observer=Object.assign(function(){},{supportedEntryTypes:['largest-contentful-paint']});
 const context={window,document,location:{hash:''},scrollY:0,PerformanceObserver:observer,performance:{now:()=>200,getEntriesByType:()=>[{type:'navigate'}]},matchMedia:()=>({matches:false}),Promise,
  setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
 change({context,window,document,video,link});runInNewContext(source,context);
 return {window,link,events,requests,timers,removed};
}

test('actual matching desktop native poster permits CSS promotion before dispatch without changing integrity or cascade',async()=>{
 const f=fixture();assert.equal(f.requests.length,0);assert.equal(f.link.fetchPriority,'low');
 f.window.__HidiLoadFullCss();f.window.__HidiLoadFullCss();
 assert.deepEqual(f.requests,[{url:'https://styles.example/full.css',priority:'high',integrity:'sha256-original',crossOrigin:'anonymous'}]);
 assert.equal(f.link.media,'print');assert.equal(f.timers.length,1);
 f.events.load();await f.window.__HidiFullCssReady;assert.equal(f.link.media,'all');assert.equal(f.requests.length,1);
});

for(const [name,change] of [
 ['no paint evidence',({window})=>delete window.__HidiNativePosterPaint],
 ['zero render time',({window})=>window.__HidiNativePosterPaint.renderTime=0],
 ['non-finite render time',({window})=>window.__HidiNativePosterPaint.renderTime=NaN],
 ['future render time',({window})=>window.__HidiNativePosterPaint.renderTime=201],
 ['changed poster',({video})=>video.poster='https://posters.example/different.avif'],
 ['detached video',({video})=>video.isConnected=false],
 ['different native node',({document})=>document.querySelector=()=>({})],
 ['mobile',({context})=>context.matchMedia=()=>({matches:true})],
 ['unsupported retention',({document})=>delete document.body.moveBefore],
 ['unsupported native paint observer',({context})=>context.PerformanceObserver.supportedEntryTypes=[]],
 ['hidden document',({document})=>document.visibilityState='hidden'],
 ['anchor navigation',({context})=>context.location.hash='#collections'],
 ['restored scroll',({context})=>context.scrollY=30],
 ['back-forward navigation',({context})=>context.performance.getEntriesByType=()=>[{type:'back_forward'}]],
 ['missing timing API',({context})=>delete context.performance]
])test('CSS retains Low for '+name,async()=>{
 const f=fixture(change);f.window.__HidiLoadFullCss();assert.equal(f.requests[0].priority,'low');
 f.events.load();await f.window.__HidiFullCssReady;assert.equal(f.link.media,'all');
});

test('paint evidence arriving after eager dispatch does not restart or promote the request',async()=>{
 let saved;const f=fixture(({window})=>{saved=window.__HidiNativePosterPaint;delete window.__HidiNativePosterPaint;});
 f.window.__HidiLoadFullCss();f.window.__HidiNativePosterPaint=saved;f.window.__HidiLoadFullCss();
 assert.equal(f.requests.length,1);assert.equal(f.link.fetchPriority,'low');f.events.load();await f.window.__HidiFullCssReady;
});

test('promoted CSS retains the existing bounded origin recovery and resolves once',async()=>{
 const f=fixture();f.window.__HidiLoadFullCss();f.timers[0]();
 assert.deepEqual(f.requests.map(r=>r.url),['https://styles.example/full.css','/original.css']);
 assert.deepEqual(f.removed,['integrity','crossorigin']);assert.equal(f.requests[1].priority,'high');
 f.events.load();await f.window.__HidiFullCssReady;f.events.error();assert.equal(f.requests.length,2);assert.equal(f.link.media,'all');
});
