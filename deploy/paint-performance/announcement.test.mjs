import test from 'node:test';import assert from 'node:assert/strict';import {renderAnnouncement,renderInitialHome} from './announcement.mjs';
const html='<html><body id="top"><div id="root"></div></body></html>';
test('initial offer is identical and validated using current catalogue pricing',async()=>{
 const products=[{variants:[{mrpPaise:10000,pricePaise:8500}]}];const result=await renderAnnouncement(html,async()=>products);
 assert(result.includes('<body id="top"><aside class="hidi-price-announcement"'));assert(result.includes('15% off across HIDI · Prices already reduced · No code needed'));
 assert.equal(await renderAnnouncement(result,async()=>products),result);
 for(const data of [[],null,[{variants:[{mrpPaise:10000,pricePaise:9000}]}],[{variants:[]}]])assert.equal(await renderAnnouncement(html,async()=>data),html);
 assert.equal(await renderAnnouncement(html,async()=>{throw Error('Unavailable');}),html);
});

test('server and browser fixture use the same captured public selection; live defaults to its own listener',async()=>{
 const originalFetch=globalThis.fetch,originalOrigin=process.env.HIDI_PUBLIC_READ_ORIGIN,originalPort=process.env.PORT;
 try{
  const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>String(url).endsWith('/products')?[{variants:[{mrpPaise:10000,pricePaise:8500}]}]:{active:false}};};process.env.PORT='3186';
  process.env.HIDI_PUBLIC_READ_ORIGIN='http://127.0.0.1:3188';assert((await renderInitialHome(html)).includes('data-hidi-price-announcement'));assert(calls.every(url=>url.startsWith('http://127.0.0.1:3188/')));assert.equal(calls.length,2);
  calls.length=0;delete process.env.HIDI_PUBLIC_READ_ORIGIN;await renderInitialHome(html);assert(calls.every(url=>url.startsWith('http://127.0.0.1:3186/')));assert.equal(calls.length,2);
  calls.length=0;process.env.HIDI_PUBLIC_READ_ORIGIN='https://outside.example';assert.equal(await renderInitialHome(html),html);assert.equal(calls.length,0);
 }finally{globalThis.fetch=originalFetch;if(originalOrigin===undefined)delete process.env.HIDI_PUBLIC_READ_ORIGIN;else process.env.HIDI_PUBLIC_READ_ORIGIN=originalOrigin;if(originalPort===undefined)delete process.env.PORT;else process.env.PORT=originalPort;}
});
