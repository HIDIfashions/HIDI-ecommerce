import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPolicy, createPrivacyPolicyHandler} from '../privacy-policy/handler.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/privacy-metadata-before.json',import.meta.url),'utf8'));
const canonical='<link rel="canonical" href="https://hidiindia.com/privacy">';
test('published policy receives one canonical; every other HTML byte remains unchanged',()=>{
 const output=renderPolicy(fixture.draft,{version:'Version 3'});
 assert.equal(output.split(canonical).length-1,1);
 assert(output.indexOf(canonical)<output.indexOf('</head>'));
 assert.equal(output.replace(canonical,''),fixture.public);
});
test('draft and archived preview render byte-identically without a public canonical',()=>{
 const output=renderPolicy(fixture.draft,{preview:true,version:'Draft'});
 assert.equal(output,fixture.preview);
 assert(!output.includes('rel="canonical"'));
 assert(output.includes('content="noindex,nofollow"'));
});
function response(){return {status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};}
test('public GET and HEAD preserve storage reads, status, cache and policy body behavior',async()=>{
 let reads=0,writes=0;
 const store={load:async()=>{reads++;return {value:{published:{version:3,draft:fixture.draft}},etag:'fixture'};},save:()=>{writes++;throw Error('No writes');}};
 const handler=createPrivacyPolicyHandler({origin:'http://fixture',hasStorefront:true,store});
 for(const method of ['GET','HEAD']){
  const result=response();assert.equal(await handler({method,headers:{}},result,'/privacy'),true);
  assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(result.body,method==='HEAD'?undefined:renderPolicy(fixture.draft,{version:'Version 3'}));
  if(method==='GET')assert.equal(result.headers['Content-Length'],Buffer.byteLength(result.body));
 }
 assert.equal(reads,2);assert.equal(writes,0);
});
test('unpublished and failed policies keep existing error statuses without a canonical',async()=>{
 for(const state of [{published:null},null]){
  const store={load:async()=>{if(state===null)throw Error('Unavailable');return {value:state,etag:'fixture'};},save:()=>{throw Error('No writes');}};
  const handler=createPrivacyPolicyHandler({origin:'http://fixture',hasStorefront:true,store});
  const result=response();await handler({method:'GET',headers:{}},result,'/privacy');
  assert.equal(result.status,state===null?503:404);
  assert(!result.body.includes('rel="canonical"'));
  assert(result.headers['X-Robots-Tag'].includes('noindex'));
 }
});
