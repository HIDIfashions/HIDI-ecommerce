import test from 'node:test';
import assert from 'node:assert/strict';
import {navigate} from './navigation.mjs';
const response=status=>({status:()=>status,ok:()=>status>=200&&status<300});
test('temporary gateway responses recover with bounded recorded attempts',async()=>{
  const statuses=[503,502,200],evidence=[],delays=[];
  await navigate({goto:async()=>response(statuses.shift())},'https://example.test/',evidence,{delay:async ms=>delays.push(ms)});
  assert.deepEqual(evidence.map(({status,attempt})=>[status,attempt]),[[503,1],[502,2]]);
  assert.deepEqual(delays,[500,1000]);assert.equal(statuses.length,0);
});
test('persistent gateways fail after exactly three attempts',async()=>{
  let calls=0;const evidence=[];
  await assert.rejects(navigate({goto:async()=>{calls++;return response(504);}},'https://example.test/',evidence,{delay:async()=>{}}),/persisted after three/);
  assert.equal(calls,3);assert.equal(evidence.length,3);
});
test('other HTTP and transport failures are never retried',async()=>{
  for(const status of [401,403,404,500]){
    let calls=0;await assert.rejects(navigate({goto:async()=>{calls++;return response(status);}},'https://example.test/',[]),/Navigation failed/);assert.equal(calls,1);
  }
  let calls=0;await assert.rejects(navigate({goto:async()=>{calls++;throw Error('connection reset');}},'https://example.test/',[]),/connection reset/);assert.equal(calls,1);
});
