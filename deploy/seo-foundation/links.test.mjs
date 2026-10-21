import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {HidiSeoLinkProps} from './links.mjs';
import {foundationReadKind,routeChangeDeclaredPrefetchErrorUrl,snapshotActiveDeclaredPrefetches,trackFoundationReads} from './browser.mjs';

test('ordinary activation retains the existing action; modified clicks use native link behavior',()=>{
  let actions=0,prevented=0;
  const link=HidiSeoLinkProps('/collections/all',()=>actions++);
  assert.equal(link.href,'/collections/all');
  const event={button:0,preventDefault:()=>prevented++};
  link.onClick(event);assert.equal(actions,1);assert.equal(prevented,1);
  for(const modified of [{button:1},{button:0,ctrlKey:true},{button:0,metaKey:true},{button:0,shiftKey:true},{button:0,altKey:true}])link.onClick({...event,...modified});
  assert.equal(actions,1);assert.equal(prevented,1);
});

test('Space retains button activation on release and prevents page scrolling; Enter remains native',()=>{
  let actions=0,prevented=0;
  const link=HidiSeoLinkProps('/collections/all',()=>actions++);
  const event={key:' ',preventDefault:()=>prevented++};
  link.onKeyDown(event);assert.equal(actions,0);assert.equal(prevented,1);
  link.onKeyUp(event);assert.equal(actions,1);assert.equal(prevented,2);
  link.onKeyDown({...event,key:'Enter'});link.onKeyUp({...event,key:'Enter'});
  link.onKeyDown({...event,ctrlKey:true});link.onKeyUp({...event,metaKey:true});
  assert.equal(actions,1);assert.equal(prevented,2);
});

test('foundation read gate requires completed shopping reads without waiting on declared Next streams',()=>{
  const page=new EventEmitter(),request=(url,headers={})=>({method:()=> 'GET',url:()=>url,headers:()=>headers});
  const cart=request('https://hidiindia.com/api/store/carts/test');
  const navigation=request('https://hidiindia.com/collections/all?_rsc=navigation');
  const prefetch=request('https://hidiindia.com/products/example?_rsc=prefetch',{'next-router-prefetch':'1'});
  const segmentPrefetch=request('https://hidiindia.com/products/segment?_rsc=prefetch',{'next-router-segment-prefetch':'/_tree'});
  const ordinary=request('https://hidiindia.com/products/example',{'next-router-prefetch':'1'});
  assert.equal(foundationReadKind(cart),'blocking');
  assert.equal(foundationReadKind(navigation),'blocking');
  assert.equal(foundationReadKind(prefetch),'prefetch');
  assert.equal(foundationReadKind(segmentPrefetch),'prefetch');
  assert.equal(foundationReadKind(ordinary),undefined);
  const state=trackFoundationReads(page);
  for(const value of [cart,navigation,prefetch,segmentPrefetch,ordinary])page.emit('request',value);
  assert.deepEqual(state.pending,new Set([cart,navigation]));
  assert.equal(state.declaredPrefetches,2);
  assert.deepEqual(state.activeDeclaredPrefetches,new Set([prefetch,segmentPrefetch]));
  page.emit('requestfinished',cart);page.emit('requestfailed',navigation);page.emit('requestfinished',prefetch);
  assert.equal(state.pending.size,0);
  assert.deepEqual(state.activeDeclaredPrefetches,new Set([segmentPrefetch]));
});

test('only a prefetch active at the deliberate route change can explain later WebKit cancellation noise',()=>{
  const page=new EventEmitter(),request=(url,headers={})=>({method:()=> 'GET',url:()=>url,headers:()=>headers});
  const activeUrl='http://127.0.0.1:39095/products/example?_rsc=prefetch';
  const finishedUrl='http://127.0.0.1:39095/products/finished?_rsc=prefetch';
  const failedUrl='http://127.0.0.1:39095/products/failed?_rsc=prefetch';
  const active=request(activeUrl,{'next-router-segment-prefetch':'/_tree'});
  const finished=request(finishedUrl,{'next-router-segment-prefetch':'/_tree'});
  const failed=request(failedUrl,{'next-router-segment-prefetch':'/_tree'});
  const blocking=request('http://127.0.0.1:39095/products/interactive?_rsc=navigation');
  const state=trackFoundationReads(page);
  for(const value of [active,finished,failed,blocking])page.emit('request',value);
  page.emit('requestfinished',finished);page.emit('requestfailed',failed);
  assert.deepEqual(snapshotActiveDeclaredPrefetches(state),new Set([activeUrl]));
  page.emit('requestfailed',active);
  assert.equal(state.activeDeclaredPrefetches.size,0,'late cancellation clears live tracking without changing the frozen transition evidence');
  const message='Fetch API cannot load http: /127.0.0.1:39095/products/example?_rsc=prefetch due to access control checks.';
  assert.equal(routeChangeDeclaredPrefetchErrorUrl(message,4,state,5),undefined,'same error before route change remains blocking');
  assert.equal(routeChangeDeclaredPrefetchErrorUrl(message,5,state,5),activeUrl);
  assert.equal(routeChangeDeclaredPrefetchErrorUrl('Fetch API cannot load http: /127.0.0.1:39095/products/finished?_rsc=prefetch due to access control checks.',5,state,5),undefined);
  assert.equal(routeChangeDeclaredPrefetchErrorUrl('Fetch API cannot load http: /127.0.0.1:39095/products/failed?_rsc=prefetch due to access control checks.',5,state,5),undefined);
  assert.equal(routeChangeDeclaredPrefetchErrorUrl('Fetch API cannot load http: /127.0.0.1:39095/products/interactive?_rsc=navigation due to access control checks.',5,state,5),undefined);
  assert.equal(routeChangeDeclaredPrefetchErrorUrl('Fetch API cannot load http: /127.0.0.1:39095/products/other?_rsc=prefetch due to access control checks.',5,state,5),undefined);
  assert.equal(routeChangeDeclaredPrefetchErrorUrl('A real application error',5,state,5),undefined);
});
