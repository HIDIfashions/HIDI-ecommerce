import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HidiSeoLinkProps} from './links.mjs';

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
