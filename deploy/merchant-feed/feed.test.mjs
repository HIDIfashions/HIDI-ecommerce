import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFeed,createMerchantFeed,imageUrl} from './feed.mjs';
const sample=()=>({id:'p1',slug:'cotton-set',name:'Cotton & blue set',description:'Kurta < cotton & pants',inStock:true,fabric:'Cotton',images:[{url:'https://thidigk.thehidi.com/media/products/blue.jpg'}],variants:[{id:'v1',sku:'SKU',size:'XXXL',color:'Blue',pricePaise:123456,available:2,images:[]}]});
test('escapes XML, preserves exact paise, stable variant identity and groups',()=>{
  const f=buildFeed([sample()]);assert.equal(f.audit.offers,1);assert.match(f.xml,/<g:id>v1<\/g:id>/);assert.match(f.xml,/<g:price>1234.56 INR/);assert.match(f.xml,/Cotton &amp; blue/);assert.match(f.xml,/<g:size>3XL/);assert.match(f.xml,/\?variant=v1/);assert.match(f.xml,/https:\/\/hidiindia.com\/_next\/image\?/);assert.doesNotMatch(f.xml,/<g:(gtin|mpn|identifier_exists)>/);
});
test('removes sold-out variants and inactive products without substitution',()=>{
  const p=sample();p.variants.push({...p.variants[0],id:'v2',size:'M',available:0});assert.equal(buildFeed([p]).audit.omittedUnavailable,1);
  assert.throws(()=>buildFeed([{...p,status:'DRAFT'}]));
});
test('never substitutes another colour photo for an unphotographed colour',()=>{
  const p=sample();p.variants[0].images=p.images;p.variants.push({...p.variants[0],id:'v2',color:'Pink',images:[]});
  const result=buildFeed([p]);assert.equal(result.audit.offers,1);assert.equal(result.audit.omittedUnverifiedColorImages,1);assert.doesNotMatch(result.xml,/<g:id>v2<\/g:id>/);
});
test('rejects invalid price, duplicate variants, duplicate size/color and missing descriptions',()=>{
  for(const patch of [{pricePaise:0},{pricePaise:1.5},{available:-1},{size:''},{color:''}]){const p=sample();Object.assign(p.variants[0],patch);assert.throws(()=>buildFeed([p]));}
  const p=sample();assert.throws(()=>buildFeed([p,p]));p.variants.push({...p.variants[0],id:'v2'});assert.throws(()=>buildFeed([p]));assert.throws(()=>buildFeed([{...sample(),description:''}]));
});
test('rejects private, signed and unexpected image locations',()=>{
  for(const url of ['https://evil.test/media/products/a.jpg','https://hidiindia.com/media/products/a.jpg?sig=secret','https://hidiindia.com/private/a.jpg','http://hidiindia.com/media/products/a.jpg'])assert.throws(()=>imageUrl(url));
});
function response(){return {status:0,headers:{},writeHead(s,h){this.status=s;this.headers=h;},end(b){this.body=b;}};}
const request=(method='GET')=>({method,headers:{host:'hidiindia.com'}});
test('coalesces loads, supports HEAD, refreshes expired stock and fails closed after errors',async()=>{
  let calls=0,time=0,fail=false,p=sample();
  const handler=createMerchantFeed({catalogueUrl:'https://api.test/products',isProductionRequest:()=>true,now:()=>time,ttl:10,fetcher:async url=>{calls++;return {ok:!fail,text:async()=>JSON.stringify(String(url).endsWith('/products')?[p]:p)};}});
  const a=response(),b=response();await Promise.all([handler(request(),a),handler(request('HEAD'),b)]);assert.equal(calls,2);assert.equal(a.status,200);assert.equal(b.body,undefined);assert.equal(Number(a.headers['Content-Length']),Buffer.byteLength(a.body));
  time=11;fail=true;const c=response();await handler(request(),c);assert.equal(c.status,503);assert.doesNotMatch(c.body,/rss/);
  fail=false;p.variants[0].pricePaise=100;const d=response();await handler(request(),d);assert.match(d.body,/1.00 INR/);
});
test('rejects writes and preview hosts before catalogue access',async()=>{
  const fetcher=()=>{throw Error('Should not fetch');};const a=response();await createMerchantFeed({catalogueUrl:'https://api.test/products',isProductionRequest:()=>false,fetcher})(request(),a);assert.equal(a.status,404);
  const b=response();await createMerchantFeed({catalogueUrl:'https://api.test/products',isProductionRequest:()=>true,fetcher})(request('POST'),b);assert.equal(b.status,405);
});
