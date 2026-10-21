import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {HidiSeoLinkProps} from './links.mjs';
import {foundationReadKind,isFailedDeclaredPrefetchError,trackFoundationReads} from './browser.mjs';

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
  page.emit('requestfinished',cart);page.emit('requestfailed',navigation);
  assert.equal(state.pending.size,0);
});

test('only a failed declared prefetch can explain WebKit access-control noise',()=>{
  const page=new EventEmitter(),request=(url,headers={})=>({method:()=> 'GET',url:()=>url,headers:()=>headers});
  const url='http://127.0.0.1:39095/products/example?_rsc=prefetch';
  const prefetch=request(url,{'next-router-segment-prefetch':'/_tree'});
  const blocking=request('http://127.0.0.1:39095/products/interactive?_rsc=navigation');
  const state=trackFoundationReads(page);
  page.emit('request',prefetch);page.emit('request',blocking);
  const message='Fetch API cannot load http: /127.0.0.1:39095/products/example?_rsc=prefetch due to access control checks.';
  page.emit('requestfailed',prefetch);
  assert.equal(isFailedDeclaredPrefetchError(message,state),false);
  state.allowFailedDeclaredPrefetches=true;
  page.emit('request',prefetch);
  page.emit('requestfailed',prefetch);page.emit('requestfailed',blocking);
  assert.equal(isFailedDeclaredPrefetchError(message,state),true);
  assert.equal(isFailedDeclaredPrefetchError('Fetch API cannot load http: /127.0.0.1:39095/products/interactive?_rsc=navigation due to access control checks.',state),false);
  assert.equal(isFailedDeclaredPrefetchError('Fetch API cannot load http: /127.0.0.1:39095/products/other?_rsc=prefetch due to access control checks.',state),false);
  assert.equal(isFailedDeclaredPrefetchError('A real application error',state),false);
});
