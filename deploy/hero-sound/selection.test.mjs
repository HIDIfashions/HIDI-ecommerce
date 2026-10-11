import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from './selection.mjs';
const sample={assetId:'b135682c-f693-4761-8e9c-2455135d4895',originalName:'SAMPLE.mp4',type:'video',url:'/sample.mp4'};
const keep={assetId:'ccb85470-43bb-4544-a533-7f0edcf927ac',originalName:'IMG_3757.mp4',type:'video',url:'/remaining.mp4'};
async function fixture({missing=false,already=false,wrong=false,conflict=false}={}){
  const originalFetch=globalThis.fetch,env={...process.env},log=console.log;let report,writes=[],version=4;
  process.env.AZURE_STORAGE_ACCOUNT='fixturestore';process.env.MEDIA_STORAGE_PROVIDER='azure';process.env.AZURE_STORAGE_CONTAINER='hero';process.env.IDENTITY_ENDPOINT='http://identity.fixture/token';delete process.env.AZURE_STORAGE_BLOB_ENDPOINT;
  const current={active:true,...sample,autoPlay:true,intervalSeconds:6,items:already?[keep]:missing?[sample]:[{...sample,originalName:wrong?'different.mp4':'SAMPLE.mp4'},keep],custom:'preserve'};
  const store=new Map([['brand/hero/current.json',{value:current,etag:'"1"'}],['brand/hero/previous.json',{value:{older:true},etag:'"2"'}],['brand/hero/library.json',{value:{assets:[sample,keep]},etag:'"3"'}]]);
  globalThis.fetch=async(url,options={})=>{
    url=new URL(url);if(url.hostname==='identity.fixture')return Response.json({access_token:'fixture-token'});
    const key=url.pathname.replace('/hero/',''),old=store.get(key);
    if(options.method==='GET')return old?Response.json(old.value,{headers:{etag:old.etag}}):new Response(null,{status:404});
    assert.equal(options.method,'PUT');assert(key.startsWith('brand/hero/'));
    if(conflict&&key==='brand/hero/current.json')return new Response(null,{status:412});
    if(old?options.headers['If-Match']!==old.etag:options.headers['If-None-Match']!=='*')return new Response(null,{status:412});
    const value=JSON.parse(options.body),etag='"'+version+++'"';store.set(key,{value,etag});writes.push(key);return new Response(null,{status:201,headers:{etag}});
  };
  console.log=value=>{if(value.startsWith('HIDI_HERO_SELECTION::'))report=JSON.parse(value.split('::')[1]);};
  try{await run('fixturestore',{run:'123-1'});return {store,writes,report,current};}
  catch(error){error.fixture={store,writes};throw error;}
  finally{globalThis.fetch=originalFetch;console.log=log;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
}
test('removes just SAMPLE with conditional metadata writes and an exact backup',async()=>{
  const {store,writes,report,current}=await fixture();assert(report.passed&&report.sampleRemoved&&report.etagVerified);
  const next=store.get('brand/hero/current.json').value;assert.deepEqual(next.items,[keep]);assert.equal(next.custom,'preserve');assert.equal(next.assetId,keep.assetId);
  assert.deepEqual(store.get('brand/hero/previous.json').value,current);assert.deepEqual(store.get('brand/hero/backups/remove-sample-123-1.json').value.current,current);
  assert.deepEqual(writes,['brand/hero/backups/remove-sample-123-1.json','brand/hero/previous.json','brand/hero/current.json']);
});
test('already removed selection is idempotent and does not write',async()=>{const {writes,report}=await fixture({already:true});assert.deepEqual(writes,[]);assert(report.alreadyRemoved);});
test('missing retained video and mismatched target stop before writing',async()=>{for(const config of [{missing:true},{wrong:true}])await assert.rejects(fixture(config),error=>{assert.deepEqual(error.fixture.writes,[]);return true;});});
test('a concurrent selection rejects the write and restores only the owned previous value',async()=>{await assert.rejects(fixture({conflict:true}),error=>{assert.deepEqual(error.fixture.store.get('brand/hero/previous.json').value,{older:true});assert.equal(error.fixture.store.get('brand/hero/current.json').value.assetId,sample.assetId);return true;});});
