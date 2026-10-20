import test from 'node:test';import assert from 'node:assert/strict';import {externalScriptUrls,isPinnedFixtureResponse,normalizeExternalScriptUrls,requireHealthyAudit} from './audit-parity.mjs';
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

test('a verified owned mirror stays distinct from analytics and must load successfully',()=>{
 const path='/assets/index-aaaaaaaaaaaaaaaa.js',mirror={origin:'https://hidi-test.azurestaticapps.net',files:{[path]:'a'.repeat(64)}},ga='https://www.googletagmanager.com/gtag/js?id=G-APP';
 const rows=['/api/store/products','/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/analytics-config','/api/hidi/offers'].map(path=>({url:'https://hidiindia.com'+path,statusCode:200,resourceType:'Fetch'}));rows.push({url:mirror.origin+path,statusCode:200,resourceType:'Script'},{url:ga,statusCode:200,resourceType:'Script'});
 assert.deepEqual(externalScriptUrls(rows,mirror),[ga]);requireHealthyAudit(rows,mirror);assert.throws(()=>requireHealthyAudit(rows.filter(row=>row.url!==mirror.origin+path),mirror),/application must load/);assert.throws(()=>requireHealthyAudit(rows.map(row=>row.url===mirror.origin+path?{...row,statusCode:503}:row),mirror));assert.deepEqual(externalScriptUrls([{url:mirror.origin+'/unverified.js',resourceType:'Script'}],mirror),[mirror.origin+'/unverified.js']);
 assert.deepEqual(normalizeExternalScriptUrls([ga,mirror.origin+path,mirror.origin+'/unverified.js',ga],mirror),[mirror.origin+'/unverified.js',ga],'Saved baseline URLs remove only the exact content-addressed HIDI mirror asset');
 const edgeOrigin='https://hidi-performance-posters.pages.dev',edge={...mirror,edgeOrigin,edgeFiles:mirror.files},edgeRows=rows.map(row=>row.url===mirror.origin+path?{...row,url:edgeOrigin+path}:row);requireHealthyAudit(edgeRows,edge);assert.deepEqual(externalScriptUrls(edgeRows,edge),[ga]);assert.throws(()=>requireHealthyAudit(rows,edge),/application must load/);
});
