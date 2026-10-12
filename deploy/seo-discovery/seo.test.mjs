import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeoIdentity, identityUrl } from './metadata.mjs';
import { sitemapXml, createSeoSitemap } from './sitemap.mjs';

test('only SEO identity fields change; garment facts, schema vocabulary and visible body stay exact', () => {
  const graph = {'@context':'https://schema.org','@type':'Product',url:'https://thidigk.thehidi.com/products/test',name:'Actual dress',description:'thehidi.com',offers:{url:'https://thehidi.com/products/test',price:'1490',availability:'https://schema.org/InStock'},image:['https://thidigk.thehidi.com/media/a.jpg','https://images.example/a.jpg']};
  const body='<body><img src="https://thidigk.thehidi.com/media/a.jpg"><button>Add to cart</button><script>window.unchanged=true</script></body>';
  const html='<head><meta property="og:image" content="https://thehidi.com/hero.jpg"><script type="application/ld+json">'+JSON.stringify(graph)+'</script></head>'+body;
  const result=normalizeSeoIdentity(html);
  assert.equal(result.slice(result.indexOf('<body>')),body);
  const schema=JSON.parse(result.match(/application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.equal(schema.url,'https://hidiindia.com/products/test');
  assert.equal(schema.offers.price,graph.offers.price);
  assert.equal(schema.offers.availability,graph.offers.availability);
  assert.equal(schema.description,graph.description);
  assert.equal(schema.image[1],graph.image[1]);
  assert(result.includes('content="https://hidiindia.com/hero.jpg"'));
  assert.equal(normalizeSeoIdentity(result),result);
});
test('unrelated and malicious lookalike URLs retain their original meaning',()=>{
  for(const url of ['https://thehidi.com.evil.example/x','https://schema.org/InStock','https://example.com/x','javascript:alert(1)','/media/a.jpg']) assert.equal(identityUrl(url),url);
});
test('sitemap covers all public catalogue products and excludes private/draft inventory',()=>{
  const xml=sitemapXml([{slug:'published-style'},{slug:'published-style'},{slug:'draft-style',status:'DRAFT'},{slug:'sold-out-style',inStock:false}]);
  assert.equal(xml.match(/published-style/g).length,1);
  assert(xml.includes('/products/sold-out-style'));
  assert(!xml.includes('draft-style'));
  assert(!xml.includes('/checkout')&&!xml.includes('/admin'));
  assert.throws(()=>sitemapXml([{slug:'../admin'}]));
});
function response(){return {status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};}
test('preview gets no sitemap and performs no backend request',async()=>{
  let reads=0;const handler=createSeoSitemap({catalogueUrl:'https://api.example/v1/products',isProductionRequest:()=>false,fetcher:()=>{reads++;throw new Error('must not read');}});
  const res=response();await handler({method:'GET'},res);assert.equal(res.status,404);assert.equal(reads,0);assert(res.headers['X-Robots-Tag'].includes('noindex'));
});
test('sitemap reads are GET-only, omit customer credentials and are cached; HEAD returns no body',async()=>{
  let reads=0;const handler=createSeoSitemap({catalogueUrl:'https://api.example/v1/products',isProductionRequest:()=>true,fetcher:async(url,options)=>{
    reads++;assert.equal(options.method,'GET');assert(!options.headers.Cookie&&!options.headers.Authorization);return {ok:true,text:async()=>JSON.stringify([{slug:'live-style'}])};
  }});
  const first=response();await handler({method:'GET',headers:{cookie:'private'}},first);assert.equal(first.status,200);assert(first.body.includes('live-style'));
  const head=response();await handler({method:'HEAD'},head);assert.equal(head.status,200);assert.equal(head.body,undefined);assert.equal(reads,1);
});
test('catalogue failure returns an uncached 503 rather than a misleading partial sitemap',async()=>{
  const handler=createSeoSitemap({catalogueUrl:'https://api.example/v1/products',isProductionRequest:()=>true,fetcher:async()=>({ok:false})});const res=response();await handler({method:'GET'},res);assert.equal(res.status,503);assert.equal(res.headers['Cache-Control'],'no-store');
});
