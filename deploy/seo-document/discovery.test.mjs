import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addHomeDiscovery,addReturnPolicy,guideHtml,guideRoutes,returnPolicy,handleGuide} from './discovery.mjs';
test('first HTML supports navigation when the landing module cannot run and enhancement stays within root',()=>{
 const html='<head></head><body><div id="root"><div class="site-shell"><header>Existing header</header></div></div><noscript>Preview</noscript><script>commerce()</script></body>';
 const result=addHomeDiscovery(html);
 assert.match(result,/<h1[^>]*>HIDI India/);assert.match(result,/href="\/collections\/work-wear"/);assert.match(result,/href="\/returns"/);
 assert(result.endsWith('<script>commerce()</script></body>'));assert(!result.includes('Preview'));
 assert.equal(addHomeDiscovery(result),result);assert.throws(()=>addHomeDiscovery('<div id="root"></div>'));
});
test('returns markup uses confirmed terms without claiming label workflow or refund receipt time',()=>{
 assert.equal(returnPolicy.merchantReturnDays,7);assert.equal(returnPolicy.returnFees,'https://schema.org/FreeReturn');
 assert(!('returnLabelSource' in returnPolicy));assert(!('refundType' in returnPolicy));
 const html='<head></head><body>Published policy</body>';
 const result=addReturnPolicy(html,'/returns');assert.match(result,/MerchantReturnPolicy/);assert(result.endsWith('<body>Published policy</body>'));
 assert.equal(addReturnPolicy(html,'/cart'),html);assert.equal(addReturnPolicy(result,'/returns'),result);
});
test('an existing initial hero keeps one main and one H1 with discovery below the hero',()=>{
 const html='<head></head><body><div id="root"><header>HIDI</header><main id="main" tabindex="-1"><section data-hidi-first-hero><h1>HIDI Indian wear</h1></section></main></div><noscript>Preview</noscript></body>';
 const result=addHomeDiscovery(html);assert.equal((result.match(/<main\b/g)||[]).length,1);assert.equal((result.match(/<h1\b/g)||[]).length,1);
 assert(result.indexOf('data-hidi-first-hero')<result.indexOf('data-hidi-home-discovery'));assert.match(result,/<h2[^>]*>HIDI India/);
});
test('each guide has original useful HTML, stable canonical, one heading and accessible anchors without script dependence',()=>{
 for(const route of guideRoutes){const html=guideHtml(route);assert.equal((html.match(/<h1>/g)||[]).length,1);assert(html.includes('href="https://hidiindia.com'+route+'"'));assert.match(html,/href="\/collections\/all"/);assert(!html.includes('thehidi.com'));assert.match(guideHtml(route,false),/noindex, nofollow/);}
 assert.equal(guideHtml('/guides/not-real'),null);
});
test('guide handler refuses writes, supports HEAD and does not catch unknown routes',()=>{
 let status,body,headers;const res={writeHead:(s,h)=>{status=s;headers=h},end:b=>body=b};
 assert(handleGuide({method:'POST'},res,'/guides',true));assert.equal(status,405);assert.equal(headers.Allow,'GET, HEAD');
 assert(handleGuide({method:'HEAD'},res,'/guides',false));assert.equal(status,200);assert.equal(body,undefined);assert.match(headers['X-Robots-Tag'],/noindex/);
 assert.equal(handleGuide({method:'GET'},res,'/guides/unknown',true),false);
});
