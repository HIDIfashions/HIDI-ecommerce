import test from 'node:test';import assert from 'node:assert/strict';import {externalScriptUrls,isPinnedFixtureResponse} from './audit-parity.mjs';
test('production script parity includes provider identities without treating first-party SEO or images as trackers',()=>{
 const script=url=>({url,resourceType:'Script'}),ga='https://www.googletagmanager.com/gtag/js?id=G-APP',cf='https://static.cloudflareinsights.com/beacon.min.js';
 assert.deepEqual(externalScriptUrls([script(ga),script(cf),script(ga),script('https://hidiindia.com/assets/home-seo-a.js'),script('data:text/javascript,0'),{url:'https://image.example/a',resourceType:'Image'}]),[cf,ga]);
 assert.notDeepEqual(externalScriptUrls([script(ga)]),externalScriptUrls([script(ga.replace('G-APP','G-OTHER'))]));
});
test('production identity must still connect exclusively to the pinned local fixture',()=>{const valid={url:'https://hidiindia.com/',remoteIPAddress:'127.0.0.1',remotePort:3190};assert(isPinnedFixtureResponse(valid));for(const change of [{remoteIPAddress:'203.0.113.1'},{remotePort:443},{url:'https://other.example/'}])assert(!isPinnedFixtureResponse({...valid,...change}));});
