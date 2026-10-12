// Exercise the retained compiled Next image upload route against disposable
// localhost API, managed-identity and Azure Blob fixtures. No production writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { photoIdentity } from '../deploy/product-upload/engine.mjs';

const runtime = process.env.HIDI_CANDIDATE_RUNTIME;
assert(runtime, 'HIDI_CANDIDATE_RUNTIME must name the actual retained Web runtime.');
const LIMIT = 12 * 1024 * 1024, IMAGE_SKU = 'FIXTURE_KUR_001', NUMBER = 7;
const VARIANT = 'Fixture_Variant', ALT = 'Ivory cotton kurta, fixture front view';
// A genuine, checksum-verified 2 × 2 beige PNG.
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8/e3TfwYGBgYmBigAADxhA+bu5gNMAAAAAElFTkSuQmCC', 'base64');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const objects = new Map(), blobCalls = [], apiCalls = [], results = [];
const sizeVariants = ['M','L','XL','XXL'].map((size,index) => ({id:index ? 'fixture-'+size : VARIANT,size,images:[]}));
let fixtureFailure, fixturePort;
const fixture = createServer((request,response) => {
  void handle(request,response).catch(error => {
    fixtureFailure = error;
    if (!response.headersSent) response.writeHead(500, {'content-type':'application/json'});
    response.end(JSON.stringify({message:'Disposable fixture assertion failed.'}));
  });
});
const sendJson = (response,body,status=200) => {response.writeHead(status, {'content-type':'application/json'});response.end(JSON.stringify(body));};
const blobHeaders = value => ({
  'content-type':value.type, 'content-length':String(value.bytes.length),
  'etag':'"fixture-immutable-blob"', 'last-modified':'Mon, 12 Oct 2026 00:00:00 GMT',
  'x-ms-request-id':'fixture-only', 'x-ms-version':'2025-11-05',
  'x-ms-blob-type':'BlockBlob', 'x-ms-server-encrypted':'true',
  'x-ms-creation-time':'Mon, 12 Oct 2026 00:00:00 GMT',
});
function blobConflict(response) {
  const xml='<?xml version="1.0" encoding="utf-8"?><Error><Code>BlobAlreadyExists</Code><Message>Fixture object already exists.</Message></Error>';
  response.writeHead(409, {'content-type':'application/xml','content-length':String(Buffer.byteLength(xml)),'x-ms-error-code':'BlobAlreadyExists','x-ms-request-id':'fixture-conflict','x-ms-version':'2025-11-05'});
  response.end(xml);
}
async function handle(request,response) {
  const url=new URL(request.url,'http://127.0.0.1:'+fixturePort);
  if (url.pathname==='/fixture-msi/token') {
    assert.equal(request.headers['x-identity-header'],'fixture-only-identity-header');
    assert.equal(url.searchParams.get('resource'),'https://storage.azure.com');
    return sendJson(response,{access_token:'fixture-managed-identity-token',token_type:'Bearer',expires_on:String(Math.floor(Date.now()/1000)+3600),resource:'https://storage.azure.com'});
  }
  if (url.pathname.startsWith('/fixture-blob/')) {
    const name=decodeURIComponent(url.pathname.slice('/fixture-blob/product-media/'.length));
    assert(url.pathname.startsWith('/fixture-blob/product-media/products/variants/'),'Only disposable product-media object paths are permitted.');
    const chunks=[];for await(const chunk of request)chunks.push(chunk);const bytes=Buffer.concat(chunks);
    blobCalls.push({method:request.method,name,bytes:bytes.length});
    if(request.method==='PUT') {
      assert.equal(request.headers['if-none-match'],'*','Actual Azure SDK must retain the no-overwrite condition.');
      assert.equal(request.headers['x-ms-blob-type'],'BlockBlob');
      assert(!url.searchParams.has('comp'),'The tiny image uses a single conditional Put Blob.');
      if(objects.has(name))return blobConflict(response);
      objects.set(name,{bytes,type:request.headers['x-ms-blob-content-type']});
      response.writeHead(201,{'etag':'"fixture-immutable-blob"','last-modified':'Mon, 12 Oct 2026 00:00:00 GMT','x-ms-request-id':'fixture-created','x-ms-version':'2025-11-05'});response.end();return;
    }
    const value=objects.get(name);assert(value,'Fixture object must exist before its properties or content are read.');
    if(request.method==='HEAD') {response.writeHead(200,blobHeaders(value));response.end();return;}
    assert.equal(request.method,'GET','Only exact Blob properties/download reads are allowed.');
    const range=request.headers.range||request.headers['x-ms-range'];
    if(range) {
      const match=/^bytes=(\d+)-(\d*)$/.exec(range);assert(match,'SDK Blob range is explicit.');
      const start=Number(match[1]),end=match[2]?Number(match[2]):value.bytes.length-1;
      assert.equal(start,0);assert.equal(end,value.bytes.length-1);
      response.writeHead(206,{...blobHeaders(value),'content-range':'bytes '+start+'-'+end+'/'+value.bytes.length});
    } else response.writeHead(200,blobHeaders(value));
    response.end(value.bytes);return;
  }
  assert(url.pathname.startsWith('/v1/admin/inventory/'),'Only the disposable Admin inventory API is permitted.');
  if(request.headers.authorization!=='Bearer fixture-photo-admin')return sendJson(response,{message:'Fixture staff session unavailable'},401);
  assert.equal(request.method,'POST');
  let raw='';for await(const chunk of request)raw+=chunk;
  const body=JSON.parse(raw),call={path:url.pathname,method:request.method,body};apiCalls.push(call);
  if(url.pathname.endsWith('/images/ticket')) {
    assert.deepEqual(Object.keys(body).sort(),['mimeType','sizeBytes']);
    assert.equal(body.mimeType,'image/png');assert.equal(body.sizeBytes,PHOTO.length);
    return sendJson(response,{token:'fixture-only-upload-ticket'});
  }
  assert.equal(url.pathname,'/v1/admin/inventory/'+VARIANT+'/images');
  assert.deepEqual(Object.keys(body).sort(),['alt','applyToColor','isMain','storagePath','url']);
  assert.equal(body.alt,ALT);assert.equal(body.applyToColor,true);assert.equal(body.isMain,true);
  for(const variant of sizeVariants) {
    const existing=variant.images.find(image=>image.url===body.url);
    const image=existing||{id:'fixture-photo-'+variant.size,url:body.url};
    Object.assign(image,{alt:body.alt,storagePath:body.storagePath,position:0});
    variant.images=[image,...variant.images.filter(other=>other.url!==image.url)];
  }
  return sendJson(response,{id:VARIANT,sku:'FIXTURE-SKU-M',images:sizeVariants[0].images});
}

await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));fixturePort=fixture.address().port;
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
// Discard inherited production identity/storage/API settings before launching
// the actual candidate. All dependency origins below are controlled localhost.
const inherited=Object.fromEntries(Object.entries(process.env).filter(([key])=>! /^(?:AZURE_|IDENTITY_|MSI_|MEDIA_|API_URL$|INTERNAL_API_URL$|R2_)/.test(key)));
const child=spawn(process.execPath,['--require',path.resolve('tests/fixtures/photo-upload-preload.cjs'),path.join(runtime,'apps/web/server.js')],{
  cwd:path.join(runtime,'apps/web'),
  env:{...inherited,NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1',
    API_URL:'http://127.0.0.1:'+fixturePort+'/v1',INTERNAL_API_URL:'http://127.0.0.1:'+fixturePort+'/v1',
    MEDIA_STORAGE_PROVIDER:'azure',AZURE_STORAGE_ACCOUNT:'fixtureaccount',MEDIA_PUBLIC_BASE_URL:'https://fixture.invalid/media',ALLOW_PUBLIC_DOMAIN:'true',
    IDENTITY_ENDPOINT:'http://127.0.0.1:'+fixturePort+'/fixture-msi/token',IDENTITY_HEADER:'fixture-only-identity-header',HIDI_PHOTO_FIXTURE_PORT:String(fixturePort)},
  stdio:['ignore','pipe','pipe'],
});
let log='';const append=bytes=>{log=(log+bytes.toString()).slice(-10000);};child.stdout.on('data',append);child.stderr.on('data',append);
const base='http://127.0.0.1:'+port;
async function post({code=IMAGE_SKU,number=String(NUMBER),type='image/png',bytes=PHOTO,cookie='fixture-photo-admin'}={}) {
  const form=new FormData();form.set('file',new File([bytes],'fixture.png',{type}));
  form.set('imageSku',code);form.set('photoNumber',number);form.set('alt',ALT);form.set('isMain','true');form.set('applyToColor','true');
  const response=await fetch(base+'/api/admin/inventory/'+VARIANT+'/images',{method:'POST',headers:cookie?{cookie:'hidi_admin_access='+cookie}:{},body:form,signal:AbortSignal.timeout(30000)});
  const body=await response.json().catch(()=>({}));if(fixtureFailure)throw fixtureFailure;return {response,body};
}
const pass=name=>results.push({name,status:'PASS'});
try {
  let ready=false;
  for(let attempt=0;attempt<120;attempt++) {
    try{const response=await fetch(base+'/api/admin/inventory/'+VARIANT+'/images',{method:'POST',signal:AbortSignal.timeout(2000)});if(response.status===401){ready=true;break;}}catch{}
    if(child.exitCode!==null)throw new Error('Actual candidate exited: '+log.slice(-1600));
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert(ready,'Actual retained Next server did not start: '+log.slice(-1600));
  const image=new File([PHOTO],'fixture.png',{type:'image/png'}),identity=await photoIdentity({imageSku:IMAGE_SKU,sequence:NUMBER,file:image});
  const key='products/variants/fixture_variant'+identity.suffix;
  assert.equal(identity.key,digest(Buffer.from([IMAGE_SKU,String(NUMBER),'image/png',digest(PHOTO)].join('\u0000'))));
  const initial=await post();assert.equal(initial.response.status,200,JSON.stringify(initial.body));
  assert.deepEqual([...objects.keys()],[key]);assert(objects.get(key).bytes.equals(PHOTO));assert.equal(objects.get(key).type,'image/png');
  assert.equal(apiCalls.length,2);assert(apiCalls[0].path.endsWith('/images/ticket'));
  const attachment=apiCalls[1].body;
  assert.equal(attachment.url,'https://fixture.invalid/media/'+key);assert.equal(attachment.storagePath,'azure://product-media/'+key);
  assert(sizeVariants.every(variant=>variant.images.length===1&&variant.images[0].url===attachment.url&&variant.images[0].alt===ALT&&variant.images[0].position===0));
  pass('Actual Next content-derived Blob key, ticket bytes and metadata URL/storage path');
  pass('Authenticated applyToColor, main-photo and alt fields reach all four fixture sizes');

  const beforeRetry=blobCalls.length,retry=await post();assert.equal(retry.response.status,200,JSON.stringify(retry.body));
  assert.deepEqual(blobCalls.slice(beforeRetry).map(call=>call.method),['PUT','HEAD','GET']);
  assert(blobCalls.slice(beforeRetry).every(call=>call.name===key));
  assert.equal(objects.size,1);assert(objects.get(key).bytes.equals(PHOTO));
  assert.equal(apiCalls.length,4);assert.equal(apiCalls[3].body.url,attachment.url);
  assert(sizeVariants.every(variant=>variant.images.length===1&&variant.images[0].url===attachment.url&&variant.images[0].alt===ALT));
  pass('Duplicate upload confirms existing Blob properties and exact bytes with one object and one attachment per size');

  // Corrupt only the disposable fixture object, at the same length/type. The
  // genuine candidate must reject it rather than trust a colliding object key.
  const corrupted=Buffer.from(PHOTO);corrupted[corrupted.length-1]^=1;objects.get(key).bytes=corrupted;
  const beforeMismatch=apiCalls.length,mismatch=await post();assert.equal(mismatch.response.status,502,JSON.stringify(mismatch.body));
  assert.match(mismatch.body.message,/Saved batch image differs/);assert.equal(apiCalls.length,beforeMismatch+1,'A mismatched saved Blob can obtain a ticket but must never attach metadata.');
  assert.equal(objects.size,1);assert(objects.get(key).bytes.equals(corrupted),'The no-overwrite condition must keep a conflicting object unchanged.');
  objects.get(key).bytes=Buffer.from(PHOTO);
  pass('Same-key mismatched saved bytes fail before attachment and cannot overwrite the fixture object');

  for(const [name,options]of [
    ['nonletter Image SKU',{code:'123_BAD'}],['lowercase Image SKU',{code:'fixture_kur'}],['path Image SKU',{code:'BAD/CODE'}],
    ['photo number zero',{number:'0'}],['leading-zero photo number',{number:'07'}],['photo number above 9999',{number:'10000'}],
    ['unsupported image MIME',{type:'image/gif'}],['empty image',{bytes:Buffer.alloc(0)}],['oversize image',{bytes:Buffer.alloc(LIMIT+1)}],
  ]) {
    const beforeApi=apiCalls.length,beforeBlob=blobCalls.length,result=await post(options);
    if(options.code!==undefined||options.number!==undefined) {
      // The retained Image SKU overlay throws into the old BFF's 502 catch;
      // newer native builds return 400. Both must reject before side effects.
      assert([400,502].includes(result.response.status),name+': '+JSON.stringify(result.body));
      assert.equal(result.body.message,'Invalid Image SKU or photo number');
    } else assert.equal(result.response.status,400,name+': '+JSON.stringify(result.body));
    assert.equal(apiCalls.length,beforeApi,name+' must fail before any upload ticket.');assert.equal(blobCalls.length,beforeBlob,name+' must fail before Blob access.');pass('Reject '+name+' before ticket and Blob writes');
  }
  const beforeAnonymous=apiCalls.length,beforeAnonymousBlob=blobCalls.length,anonymous=await post({cookie:null});
  assert.equal(anonymous.response.status,401);assert.equal(apiCalls.length,beforeAnonymous);assert.equal(blobCalls.length,beforeAnonymousBlob);pass('Anonymous upload is denied before ticket and Blob access');
  if(fixtureFailure)throw fixtureFailure;
  const report={passed:true,actualNextHttp:true,contentHashVerified:true,mainAltVerified:true,duplicateRetryVerified:true,collisionBytesRejected:true,malformedInputDenied:true,anonymousDenied:true,
    checks:results,checkCount:results.length,results,fixtureBlobObjects:objects.size,fixtureMetadataAttachments:sizeVariants.reduce((n,v)=>n+v.images.length,0),productionDatabaseWrites:0,productionBlobWrites:0};
  await mkdir('evidence/product-upload',{recursive:true});await writeFile('evidence/product-upload/next-hash.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));
}
