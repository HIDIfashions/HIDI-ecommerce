import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createPhotoRouteFixture,NextRequest} from './photo-route.fixture.mjs';

const require=createRequire(resolve('apps/web/package.json')),sharp=require('sharp');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
process.env.MEDIA_STORAGE_PROVIDER='azure';

async function fixture(t){
 const h=await createPhotoRouteFixture(await mkdtemp(join(tmpdir(),'hidi-route-case-')));
 t.after(()=>h.cleanup());
 return h;
}
async function photo(){
 return sharp({create:{width:60,height:90,channels:3,background:'#e7d7c7'}}).jpeg().toBuffer();
}
function request(bytes,{imageSku='KUR_001',photoNumber='1',cookie='fixture-owner',mime='image/jpeg',origin='http://localhost:3219'}={}){
 const form=new FormData();
 form.set('file',new File([bytes],'fixture.jpg',{type:mime}));
 form.set('imageSku',imageSku);
 form.set('photoNumber',photoNumber);
 form.set('applyToColor','true');
 return new NextRequest('http://localhost:3219/api/admin/inventory/v1/images',{
  method:'POST',
  headers:{...(cookie?{cookie:'hidi_admin_access='+cookie}:{}),origin},
  body:form,
 });
}
const context={params:Promise.resolve({variantId:'v1'})};

test('Image-SKU upload derives an idempotent key from the exact received bytes',async t=>{
 const h=await fixture(t),bytes=await photo();
 const expected=hash(['KUR_001','1','image/jpeg',hash(bytes)].join('\u0000'));
 for(let i=0;i<2;i++){
  const response=await h.route.POST(request(bytes),context);
  assert.equal(response.status,200);
 }
 assert.equal(h.state.files.size,8);
 assert.equal(h.state.derivativeWrites,7);
 assert.match(h.state.metadata[0].url,new RegExp('/batch-'+expected+'\\.jpg$'));
 assert.equal(h.state.metadata[0].applyToColor,true);
 const saved=[...h.state.files.entries()].find(([key])=>!key.includes('/_derivatives/'))?.[1];
 assert(saved);
 assert.deepEqual(await readFile(saved.path),bytes);
 await h.assertClean();
});

test('mapping validation is retained and ordinary Azure uploads are content-addressed',async t=>{
 const h=await fixture(t),bytes=await photo();
 for(const options of [{imageSku:'../bad'},{photoNumber:'0'},{photoNumber:'0001'}]){
  const response=await h.route.POST(request(bytes,options),context);
  assert.equal(response.status,400);
  await h.assertClean();
 }
 assert.equal(h.state.writes,0);
 const response=await h.route.POST(request(bytes,{imageSku:''}),context);
 assert.equal(response.status,200);
 assert.equal(h.state.files.size,8);
 assert.equal(h.state.derivativeWrites,7);
 assert.match(h.state.metadata[0].url,new RegExp('/batch-'+hash(bytes)+'\\.jpg$'));
 await h.assertClean();
});

test('ambiguous ordinary metadata failure retains one immutable family and retry reuses it',async t=>{
 const h=await fixture(t),bytes=await photo();
 h.state.metadataStatus=503;
 const first=await h.route.POST(request(bytes,{imageSku:''}),context);
 assert.equal(first.status,503);
 assert.equal(h.state.metadata.length,0);
 assert.equal(h.state.writes,1);
 assert.equal(h.state.derivativeWrites,7);
 assert.equal(h.state.cleanupCalls,0);
 assert.equal(h.state.files.size,8);
 await h.assertClean();

 h.state.metadataStatus=200;
 const retry=await h.route.POST(request(bytes,{imageSku:''}),context);
 assert.equal(retry.status,200);
 assert.equal(h.state.writes,2);
 assert.equal(h.state.derivativeWrites,7);
 assert.equal(h.state.files.size,8);
 assert.equal(h.state.metadata.length,1);
 assert.match(h.state.metadata[0].url,new RegExp('/batch-'+hash(bytes)+'\\.jpg$'));
 await h.assertClean();
});

test('missing, expired, unauthorized and cross-origin sessions fail before reading photo bytes',async t=>{
 const h=await fixture(t),bytes=await photo();
 assert.equal((await h.route.POST(request(bytes,{cookie:''}),context)).status,401);
 h.state.authStatus=401;
 assert.equal((await h.route.POST(request(bytes),context)).status,401);
 h.state.authStatus=200;
 assert.equal((await h.route.POST(request(bytes,{origin:'https://unrelated.invalid'}),context)).status,403);
 h.state.role='SUPPORT';
 assert.equal((await h.route.POST(request(bytes),context)).status,403);
 assert.equal(h.state.reads,0);
 assert.equal(h.state.writes,0);
 assert.equal(h.state.derivativeWrites,0);
 await h.assertClean();
});

test('ticket failure writes nothing and deterministic metadata failure can be safely retried',async t=>{
 const h=await fixture(t),bytes=await photo();
 h.state.ticketStatus=403;
 const denied=await h.route.POST(request(bytes),context);
 assert.equal(denied.ok,false);
 assert.equal(h.state.writes,0);
 assert.equal(h.state.derivativeWrites,0);
 await h.assertClean();

 h.state.ticketStatus=200;
 h.state.metadataStatus=503;
 const ambiguous=await h.route.POST(request(bytes),context);
 assert.equal(ambiguous.status,503);
 assert.equal(h.state.metadata.length,0);
 assert.equal(h.state.writes,1);
 assert.equal(h.state.derivativeWrites,7);
 assert.equal(h.state.files.size,8);
 assert.equal(h.state.cleanupCalls,0);
 await h.assertClean();

 h.state.metadataStatus=200;
 const retry=await h.route.POST(request(bytes),context);
 assert.equal(retry.status,200);
 assert.equal(h.state.files.size,8);
 assert.equal(h.state.derivativeWrites,7);
 assert.equal(h.state.writes,2);
 await h.assertClean();
});
