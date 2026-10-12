import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeoIdentity, identityUrl, seoIdentityTransform, clientMetadataScript, isPublishedProductImage, shouldIndexPublishedImage } from './metadata.mjs';
import { Readable } from 'node:stream';
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
test('homepage and collection search/social fields change together; creative body and commerce scripts stay byte-identical',()=>{
  const body='<body><h1>Wear the feeling.</h1><button>Shop Now</button><script type="application/json">{"price":1199,"available":4}</script></body>';
  const head='<head><title>HIDI — Wear the feeling.</title><meta name="description" content="Old"><meta property="og:title" content="Old"><meta name="twitter:title" content="Old"><meta property="og:description" content="Old"><meta name="twitter:description" content="Old"><meta name="robots" content="index, follow"></head>';
  const changed=normalizeSeoIdentity(head+body,'/');
  assert.equal(changed.slice(changed.indexOf('<body>')),body);
  assert(changed.includes('<title>HIDI India | Women’s Indian Wear and Kurta Sets</title>'));
  assert.equal((changed.match(/HIDI India \| Women’s Indian Wear and Kurta Sets/g)||[]).length,3);
  assert.equal((changed.match(/Browse kurta sets, product details and size information\./g)||[]).length,3);
  assert(changed.includes('<meta name="robots" content="index, follow">'));
  assert.equal(normalizeSeoIdentity(changed,'/'),changed);
  const duplicate=normalizeSeoIdentity(head.replace('</head>','<meta name="description" content="Duplicate"></head>')+body,'/');
  assert.equal((duplicate.match(/name="description"/g)||[]).length,1,'Duplicate description tags have one owner');
  const collection=normalizeSeoIdentity(head+body,'/collections/all');
  assert(collection.includes('Women’s Kurta Sets &amp; Indian Wear | HIDI India'));
});
test('image eligibility is limited to exact published catalogue assets',()=>{
  const known='/media/products/variants/cmv3e6j3z00hs01z3o94jjvwv/1791697100254-b1588e04-08f2-4a27-b264-39e60840ffe9.webp';
  assert(isPublishedProductImage(known));
  assert(shouldIndexPublishedImage(200,'image/webp','hidiindia.com',known));
  assert(shouldIndexPublishedImage(200,'image/jpeg; charset=binary','www.hidiindia.com',known));
  assert(shouldIndexPublishedImage(200,'image/svg+xml','hidiindia.com','/brand/hidi-logo-header.svg'));
  assert(!shouldIndexPublishedImage(200,'image/svg+xml','hidiindia.com','/brand/unknown.svg'));
  assert(!shouldIndexPublishedImage(200,'image/svg+xml','thidigk.thehidi.com','/brand/hidi-logo-header.svg'));
  for(const input of [[404,'image/webp','hidiindia.com'],[304,'image/webp','hidiindia.com'],[200,'application/json','hidiindia.com'],[200,'image/webp','thidigk.thehidi.com'],[200,'image/webp','thehidi.com']])assert(!shouldIndexPublishedImage(...input,known));
  for(const path of ['/admin','/api/orders','/media/private/customer.jpg','/media/products/variants/unknown/private.jpg',known+'/other',known+'?private=1']){
    assert(!isPublishedProductImage(path));assert(!shouldIndexPublishedImage(200,'image/webp','hidiindia.com',path));
  }
});
test('private, error, preview, product and unsupported destination metadata stays unchanged',()=>{
  const page='<head><title>Existing product | HIDI</title><meta name="description" content="Existing facts"></head><body>Exact</body>';
  for(const path of [undefined,'/cart','/checkout','/account','/products/existing-product','/about','/collections/unknown'])assert.equal(normalizeSeoIdentity(page,path),page);
  const error=page.replace('Existing product | HIDI','404: Not found');
  assert.equal(normalizeSeoIdentity(error,'/collections/all'),error);
});
test('streamed body JSON-LD normalizes across UTF-8/tag boundaries while visible markup stays exact',async()=>{
  const visible='<body><p>₹1,490 — 🪷 తెలుగు</p><img src="https://thidigk.thehidi.com/media/real.jpg">';
  const json='<script type="application/ld+json">'+JSON.stringify({'@type':'Product',url:'https://thidigk.thehidi.com/products/real-style',offers:{price:'1490',url:'https://thehidi.com/products/real-style'}})+'</script>';
  const input=Buffer.from(visible+json+'<button>Add to cart</button></body>');
  const chunks=Array.from(input,x=>Buffer.from([x]));const stream=Readable.from(chunks).pipe(seoIdentityTransform());let output='';for await(const chunk of stream)output+=chunk.toString();
  assert(output.startsWith(visible));assert(output.endsWith('<button>Add to cart</button></body>'));
  assert(output.includes('https://hidiindia.com/products/real-style'));assert(output.includes('"price":"1490"'));
});
test('malformed schema and adjacent Unicode text are preserved; client script is valid JavaScript',async()=>{
  const input='<script type="application/ld+json">broken</script>'+'🪷'.repeat(1500);let output='';for await(const chunk of Readable.from([input]).pipe(seoIdentityTransform()))output+=chunk.toString();assert.equal(output,input);
  new Function(clientMetadataScript.replace(/^<script[^>]*>|<\/script>$/g,''));
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
