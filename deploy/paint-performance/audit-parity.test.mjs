import test from 'node:test';import assert from 'node:assert/strict';import {externalScriptUrls,isPinnedFixtureResponse,requireHealthyAudit} from './audit-parity.mjs';
test('audits reject missing catalogue data, private-domain responses and unavailable analytics SDKs',()=>{
 const rows=['/api/store/products','/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/analytics-config','/api/hidi/offers'].map(path=>({url:'https://hidiindia.com'+path,statusCode:200,resourceType:'Fetch'}));
 rows.push({url:'https://www.googletagmanager.com/gtag/js?id=G-APP',statusCode:200,resourceType:'Script'});requireHealthyAudit(rows);
 assert.throws(()=>requireHealthyAudit(rows.slice(1)),/endpoint unavailable/);assert.throws(()=>requireHealthyAudit(rows.map((row,i)=>i===0?{...row,statusCode:503}:row)),/endpoint unavailable/);assert.throws(()=>requireHealthyAudit(rows.map((row,i)=>i===5?{...row,statusCode:429}:row)),/SDK unavailable/);
});
test('production script parity includes provider identities without treating first-party SEO or images as trackers',()=>{
 const script=url=>({url,resourceType:'Script'}),ga='https://www.googletagmanager.com/gtag/js?id=G-APP',cf='https://static.cloudflareinsights.com/beacon.min.js';
 assert.deepEqual(externalScriptUrls([script(ga),script(cf),script(ga),script('https://hidiindia.com/assets/home-seo-a.js'),script('data:text/javascript,0'),{url:'https://image.example/a',resourceType:'Image'}]),[cf,ga]);
 assert.notDeepEqual(externalScriptUrls([script(ga)]),externalScriptUrls([script(ga.replace('G-APP','G-OTHER'))]));
});
test('production identity must still connect exclusively to the pinned local fixture',()=>{const valid={url:'https://hidiindia.com/',remoteIPAddress:'127.0.0.1',remotePort:3190};assert(isPinnedFixtureResponse(valid));for(const change of [{remoteIPAddress:'203.0.113.1'},{remotePort:443},{url:'https://other.example/'}])assert(!isPinnedFixtureResponse({...valid,...change}));});
