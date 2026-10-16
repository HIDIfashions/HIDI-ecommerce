import test from 'node:test';import assert from 'node:assert/strict';import {renderAnnouncement} from './announcement.mjs';
const html='<html><body id="top"><div id="root"></div></body></html>';
test('initial offer is identical and validated using current catalogue pricing',async()=>{
 const products=[{variants:[{mrpPaise:10000,pricePaise:8500}]}];const result=await renderAnnouncement(html,async()=>products);
 assert(result.includes('<body id="top"><aside class="hidi-price-announcement"'));assert(result.includes('15% off across HIDI · Prices already reduced · No code needed'));
 assert.equal(await renderAnnouncement(result,async()=>products),result);
 for(const data of [[],null,[{variants:[{mrpPaise:10000,pricePaise:9000}]}],[{variants:[]}]])assert.equal(await renderAnnouncement(html,async()=>data),html);
 assert.equal(await renderAnnouncement(html,async()=>{throw Error('Unavailable');}),html);
});
