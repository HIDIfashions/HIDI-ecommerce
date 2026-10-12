// Exercise the retained compiled Next image upload route against disposable
// localhost API, managed-identity and Azure Blob fixtures. No production writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { photoIdentity } from '../deploy/product-upload/engine.mjs';

const runtime = process.env.HIDI_CANDIDATE_RUNTIME;
assert(runtime, 'HIDI_CANDIDATE_RUNTIME must name the actual retained Web runtime.');
const LIMIT = 12 * 1024 * 1024, IMAGE_SKU = 'FIXTURE_KUR_001', NUMBER = 7;
const VARIANT = 'Fixture_Variant', ALT = 'Ivory cotton kurta, fixture front view';
// A genuine, checksum-verified 2 × 2 beige PNG.
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8/e3TfwYGBgYmBigAADxhA+bu5gNMAAAAAElFTkSuQmCC', 'base64');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const routeRelative='apps/web/.next/server/app/api/admin/inventory/[variantId]/images/route.js';
const actualRouteSource=await readFile(path.join(runtime,routeRelative),'utf8');
const helperContexts=source=>[...source.matchAll(/(?:getBlockBlobClient|uploadData)\(/g)].slice(0,40).map(match=>({offset:match.index,context:source.slice(Math.max(0,match.index-220),match.index+420)}));
const storageDiagnostic={moduleRelativePath:routeRelative,moduleSha256:digest(actualRouteSource),helperCount:[...actualRouteSource.matchAll(/getBlockBlobClient\(/g)].length,helperContexts:helperContexts(actualRouteSource),directCases:[],referencedChunks:[]};
const referencedChunks=[...new Set([...actualRouteSource.matchAll(/\.X\(0,\[([\d,]+)\]/g)].flatMap(match=>match[1].split(',')))];
for(const id of referencedChunks){
  const relative='apps/web/.next/server/chunks/'+id+'.js',source=await readFile(path.join(runtime,relative),'utf8').catch(()=>null);
  if(source&&/(?:getBlockBlobClient|uploadData)\(/.test(source))storageDiagnostic.referencedChunks.push({moduleRelativePath:relative,moduleSha256:digest(source),helperContexts:helperContexts(source)});
}
const storageMatch=actualRouteSource.match(/let (?<blob>\w+)=(?<container>\w+)\(\)\.getBlockBlobClient\((?<key>\w+)\);try\{await \k<blob>\.uploadData\((?<bytes>\w+),\{conditions:\{ifNoneMatch:"\*"\},blobHTTPHeaders:\{blobContentType:(?<mime>\w+),/);
const moduleHeaders=storageMatch?[...actualRouteSource.slice(0,storageMatch.index).matchAll(/(\d+):\([^)]*\)=>\{/g)]:[];
storageDiagnostic.helperModuleId=moduleHeaders.at(-1)?.[1]||null;
if(storageMatch){
  const result=actualRouteSource.slice(storageMatch.index).match(/return\{url:`\$\{(?<base>\w+)\}\/\$\{\w+\}`,storagePath:`azure:\/\/product-media\/\$\{\w+\}`\}/);
  if(result){
    const block=actualRouteSource.slice(storageMatch.index,storageMatch.index+result.index+result[0].length);
    storageDiagnostic.helperSha256=digest(block);storageDiagnostic.helperSnippet=block;
    storageDiagnostic.bindingContext=actualRouteSource.slice(Math.max(0,storageMatch.index-600),storageMatch.index);
    const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
    const invoke=new AsyncFunction(storageMatch.groups.key,storageMatch.groups.bytes,storageMatch.groups.mime,result.groups.base,storageMatch.groups.container,block);
    for(const directory of ['v1','fixture_variant','cmfixturevariant01234567890']){
      const reads={properties:0,bytes:0};const key='products/variants/'+directory+'/batch-'+digest('fixture-diagnostic')+'.png';
      const blob={uploadData:async()=>{throw Object.assign(new Error('Fixture object already exists.'),{statusCode:409,code:'BlobAlreadyExists'});},getProperties:async()=>{reads.properties++;return {contentLength:PHOTO.length,contentType:'image/png'};},downloadToBuffer:async()=>{reads.bytes++;return Buffer.from(PHOTO);}};
      try{const saved=await invoke(key,PHOTO,'image/png','https://fixture.invalid/media',()=>({getBlockBlobClient:()=>blob}));storageDiagnostic.directCases.push({directory,recovered:true,propertiesReads:reads.properties,byteReads:reads.bytes,url:saved.url});}
      catch(error){storageDiagnostic.directCases.push({directory,recovered:false,propertiesReads:reads.properties,byteReads:reads.bytes,error:{name:error.name,code:error.code,statusCode:error.statusCode,message:error.message}});}
    }
  }
}
await mkdir('evidence/product-upload',{recursive:true});await writeFile('evidence/product-upload/next-storage-diagnostic.json',JSON.stringify(storageDiagnostic,null,2)+'\n');
const objects = new Map(), blobCalls = [], apiCalls = [], results = [];
const sizeVariants = ['M','L','XL','XXL'].map((size,index) => ({id:index ? 'fixture-'+size : VARIANT,size,images:[]}));
let fixtureFailure, fixturePort,expectedUpload;
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
    assert.equal(body.mimeType,expectedUpload.type);assert.equal(body.sizeBytes,expectedUpload.bytes.length);
    return sendJson(response,{token:'fixture-only-upload-ticket'});
  }
  assert.equal(url.pathname,'/v1/admin/inventory/'+VARIANT+'/images');
  assert.deepEqual(Object.keys(body).filter(key=>key!=='isMain').sort(),['alt','applyToColor','storagePath','url']);
  assert.equal(body.alt,expectedUpload.alt);assert.equal(body.applyToColor,true);
  // isMain is intentionally optional on the retained BFF. Cover selection is
  // established by first-upload order and verified against the captured API.
  if(body.isMain!==undefined)assert.equal(body.isMain,expectedUpload.isMain);
  for(const variant of sizeVariants) {
    const existing=variant.images.find(image=>image.url===body.url);
    const image=existing||{id:'fixture-photo-'+variant.size,url:body.url};
    Object.assign(image,{alt:body.alt,storagePath:body.storagePath});
    if(!existing){image.position=variant.images.length;variant.images.push(image);}
  }
  return sendJson(response,{id:VARIANT,sku:'FIXTURE-SKU-M',images:sizeVariants[0].images});
}

await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));fixturePort=fixture.address().port;
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
// Discard inherited production identity/storage/API settings before launching
// the actual candidate. All dependency origins below are controlled localhost.
const inherited=Object.fromEntries(Object.entries(process.env).filter(([key])=>! /^(?:AZURE_|IDENTITY_|MSI_|MEDIA_|API_URL$|INTERNAL_API_URL$|R2_)/.test(key)));
const preloadDir=await mkdtemp(path.join(tmpdir(),'hidi-next-fixture-trace-')),preloadPath=path.join(preloadDir,'preload.cjs');
const fixtureTrace=`\n// Transparent diagnostics for this exact disposable Azure error only.\nconst HidiOriginalError=global.Error;let hidiFixtureTraceCount=0;\nfunction hidiFixtureTrace(operation,value){if(hidiFixtureTraceCount++<24)process.stderr.write('HIDI_FIXTURE_ERROR_TRACE '+JSON.stringify({operation,value,stack:new HidiOriginalError().stack.split('\\n').slice(2,9)})+'\\n');}\nglobal.Error=new Proxy(HidiOriginalError,{construct(target,args,newTarget){const error=Reflect.construct(target,args,newTarget);if(args[0]!=='Fixture object already exists.')return error;return new Proxy(error,{get(object,key,receiver){const value=Reflect.get(object,key,receiver);if(key==='statusCode')hidiFixtureTrace('read-statusCode',value);return value;},set(object,key,value,receiver){if(key==='statusCode')hidiFixtureTrace('set-statusCode',value);return Reflect.set(object,key,value,receiver);},defineProperty(object,key,descriptor){if(key==='statusCode')hidiFixtureTrace('define-statusCode',descriptor.value);return Reflect.defineProperty(object,key,descriptor);}});}});\n`;
const moduleTrace=`\nprocess.on('SIGUSR1',()=>{void(async()=>{const out={helperModuleId:process.env.HIDI_FIXTURE_HELPER_ID};try{const file=process.env.HIDI_FIXTURE_ROUTE_FILE,entry=require.cache[file];out.routeCached=!!entry;out.routeExports=Object.keys(entry?.exports||{});const app=entry?.exports?.__next_app__||entry?.exports?.default?.__next_app__;const req=app?.require||require(require('node:path').join(process.env.HIDI_FIXTURE_RUNTIME_ROOT,'apps/web/.next/server/webpack-runtime.js'));out.webpackRequireSource=app?.require?'route-export':'cached-webpack-runtime';out.webpackRequireAvailable=typeof req==='function';if(typeof req==='function'){const id=Number(process.env.HIDI_FIXTURE_HELPER_ID),fn=req(id).i,body=fn.toString(),factory=req.m?.[id]?.toString();out.loadedHelper={guardInstalled:body.includes('hidiSavedBlob'),sha256:require('node:crypto').createHash('sha256').update(body).digest('hex'),source:body};out.currentFactory={guardInstalled:factory?.includes('hidiSavedBlob'),sha256:factory?require('node:crypto').createHash('sha256').update(factory).digest('hex'):null};out.cachedFactories=Object.entries(require.cache).filter(([name])=>name.startsWith(process.env.HIDI_FIXTURE_RUNTIME_ROOT)).flatMap(([name,module])=>{const value=module.exports?.modules?.[id];return value?[{file:name.slice(process.env.HIDI_FIXTURE_RUNTIME_ROOT.length+1),guardInstalled:value.toString().includes('hidiSavedBlob')}]:[];});const SDK=req(55031),Client=SDK.wS;out.sdkExports=Object.keys(SDK);out.sdkClientType=typeof Client;if(typeof Client==='function'){const blob=new Client(process.env.HIDI_FIXTURE_BLOB_ORIGIN,{allowInsecureConnection:true,retryOptions:{maxTries:1}}).getContainerClient('product-media').getBlockBlobClient(process.env.HIDI_FIXTURE_OBJECT_KEY);try{await blob.uploadData(Buffer.from(${JSON.stringify(PHOTO.toString('base64'))},'base64'),{conditions:{ifNoneMatch:'*'},blobHTTPHeaders:{blobContentType:'image/png'}});out.bundledSdkError={unexpectedSuccess:true};}catch(error){out.bundledSdkError={name:error.name,constructor:error.constructor?.name,code:error.code,statusCode:error.statusCode,responseStatus:error.response?.status||error.response?.statusCode,keys:Object.keys(error),message:error.message,stack:String(error.stack||'').split('\\n').slice(0,8)};}}}}catch(error){out.diagnosticError={name:error.name,message:error.message};}process.stderr.write('HIDI_FIXTURE_MODULE_DIAGNOSTIC '+JSON.stringify(out)+'\\n');})()});\n`;
await writeFile(preloadPath,(await readFile(path.resolve('tests/fixtures/photo-upload-preload.cjs'),'utf8'))+fixtureTrace+moduleTrace);
const child=spawn(process.execPath,['--require',preloadPath,path.join(runtime,'apps/web/server.js')],{
  cwd:path.join(runtime,'apps/web'),
  env:{...inherited,NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1',
    API_URL:'http://127.0.0.1:'+fixturePort+'/v1',INTERNAL_API_URL:'http://127.0.0.1:'+fixturePort+'/v1',
    MEDIA_STORAGE_PROVIDER:'azure',AZURE_STORAGE_ACCOUNT:'fixtureaccount',MEDIA_PUBLIC_BASE_URL:'https://fixture.invalid/media',ALLOW_PUBLIC_DOMAIN:'true',
    IDENTITY_ENDPOINT:'http://127.0.0.1:'+fixturePort+'/fixture-msi/token',IDENTITY_HEADER:'fixture-only-identity-header',HIDI_PHOTO_FIXTURE_PORT:String(fixturePort),
    HIDI_FIXTURE_HELPER_ID:storageDiagnostic.helperModuleId||'',HIDI_FIXTURE_ROUTE_FILE:path.join(runtime,routeRelative),HIDI_FIXTURE_RUNTIME_ROOT:runtime,HIDI_FIXTURE_BLOB_ORIGIN:'http://127.0.0.1:'+fixturePort+'/fixture-blob',HIDI_FIXTURE_OBJECT_KEY:'products/variants/fixture_variant/batch-'+digest(Buffer.from([IMAGE_SKU,String(NUMBER),'image/png',digest(PHOTO)].join('\u0000')))+'.png'},
  stdio:['ignore','pipe','pipe'],
});
let log='';const append=bytes=>{log=(log+bytes.toString()).slice(-10000);};child.stdout.on('data',append);child.stderr.on('data',append);
const base='http://127.0.0.1:'+port;
async function post({code=IMAGE_SKU,number=String(NUMBER),type='image/png',bytes=PHOTO,alt=ALT,isMain=true,cookie='fixture-photo-admin'}={}) {
  expectedUpload={type,bytes,alt,isMain};
  const form=new FormData();form.set('file',new File([bytes],'fixture.png',{type}));
  form.set('imageSku',code);form.set('photoNumber',number);form.set('alt',alt);form.set('isMain',String(isMain));form.set('applyToColor','true');
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
  pass('Authenticated colour sharing and alt text reach all four sizes; the first chosen photo is their cover');

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

  const additional=await post({number:'1',alt:'Gallery photo after the chosen cover',isMain:false});
  assert.equal(additional.response.status,200,JSON.stringify(additional.body));
  const additionalIdentity=await photoIdentity({imageSku:IMAGE_SKU,sequence:1,file:image});
  assert.equal(objects.size,2);assert(objects.has('products/variants/fixture_variant'+additionalIdentity.suffix));
  assert(sizeVariants.every(v=>v.images.length===2&&v.images[0].url===attachment.url&&v.images[0].position===0&&v.images[1].position===1&&v.images[1].alt==='Gallery photo after the chosen cover'));
  pass('Uploading the chosen numbered cover first preserves it when lower-numbered gallery photos append later');

  const beforeJsonApi=apiCalls.length,beforeJsonBlob=blobCalls.length,coverIds=sizeVariants.map(v=>v.images[0].id);
  expectedUpload={alt:'Updated alternative text for the retained cover'};
  const jsonResponse=await fetch(base+'/api/admin/inventory/'+VARIANT+'/images',{method:'POST',headers:{cookie:'hidi_admin_access=fixture-photo-admin','content-type':'application/json'},body:JSON.stringify({url:attachment.url,storagePath:attachment.storagePath,alt:expectedUpload.alt,applyToColor:true}),signal:AbortSignal.timeout(30000)});
  const jsonBody=await jsonResponse.json();if(fixtureFailure)throw fixtureFailure;assert.equal(jsonResponse.status,200,JSON.stringify(jsonBody));
  assert.equal(apiCalls.length,beforeJsonApi+1);assert.equal(blobCalls.length,beforeJsonBlob,'Known-cover alt refresh must not upload another Blob or obtain an image ticket.');
  assert.deepEqual(sizeVariants.map(v=>v.images[0].id),coverIds);
  assert(sizeVariants.every(v=>v.images.length===2&&v.images[0].url===attachment.url&&v.images[0].position===0&&v.images[0].alt===expectedUpload.alt));
  pass('Existing JSON image route refreshes known-cover alt on every size without changing row IDs, order or Blob objects');

  for(const [size,type]of [[5*1024*1024+1,'image/jpeg'],[8*1024*1024+1,'image/jpeg'],[10*1024*1024+1,'image/jpeg'],[LIMIT,'image/jpeg'],[LIMIT,'image/png'],[LIMIT,'image/webp'],[LIMIT,'image/avif']]) {
    const bytes=Buffer.alloc(size);PHOTO.copy(bytes);const code='LIMIT_'+type.split('/')[1].toUpperCase()+'_'+size;
    const beforeApi=apiCalls.length,beforeBlob=blobCalls.length,accepted=await post({code,number:'1',type,bytes,alt:'Fixture limit image',isMain:false});
    assert.equal(accepted.response.status,200,JSON.stringify(accepted.body));assert.equal(apiCalls.length,beforeApi+2);assert.equal(blobCalls.length,beforeBlob+1);
    const upload=blobCalls.at(-1);assert.equal(upload.bytes,size);assert(objects.get(upload.name).bytes.equals(bytes));assert.equal(objects.get(upload.name).type,type);
    pass('Retained Next accepts '+type+' '+size+' bytes and preserves the entire image in the fixture Blob');
  }
  const config=JSON.parse(await readFile(path.join(runtime,'apps/web/.next/required-server-files.json'),'utf8'));
  assert.equal(config.config.experimental.proxyClientMaxBodySize,14*1024*1024);
  pass('Retained Next request-body allowance remains 14 MiB for the 12 MiB photo limit');

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
  const report={passed:true,actualNextHttp:true,contentHashVerified:true,mainAltVerified:true,duplicateRetryVerified:true,jsonAltRefreshVerified:true,coverByFirstUploadVerified:true,photoLimitVerified:true,requestBodyLimitVerified:true,photoLimitBytes:LIMIT,requestBodyBytes:14*1024*1024,collisionBytesRejected:true,malformedInputDenied:true,anonymousDenied:true,
    checks:results,checkCount:results.length,results,fixtureBlobObjects:objects.size,fixtureMetadataAttachments:sizeVariants.reduce((n,v)=>n+v.images.length,0),productionDatabaseWrites:0,productionBlobWrites:0};
  await mkdir('evidence/product-upload',{recursive:true});await writeFile('evidence/product-upload/next-hash.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} catch(error) {
  const traceBefore=log.indexOf('HIDI_FIXTURE_MODULE_DIAGNOSTIC ');child.kill('SIGUSR1');
  for(let attempt=0;attempt<40&&!log.includes('HIDI_FIXTURE_MODULE_DIAGNOSTIC ',Math.max(0,traceBefore+1));attempt++)await new Promise(resolve=>setTimeout(resolve,50));
  let nativeSdkError;
  try{
    const requireActual=createRequire(path.join(runtime,'apps/web/server.js')),{BlobServiceClient}=requireActual('@azure/storage-blob');
    const client=new BlobServiceClient('http://127.0.0.1:'+fixturePort+'/fixture-blob',{allowInsecureConnection:true,retryOptions:{maxTries:1}});
    const key=[...objects.keys()][0];if(key)try{await client.getContainerClient('product-media').getBlockBlobClient(key).uploadData(PHOTO,{conditions:{ifNoneMatch:'*'},blobHTTPHeaders:{blobContentType:'image/png'}});}catch(sdkError){nativeSdkError={available:true,name:sdkError.name,code:sdkError.code,statusCode:sdkError.statusCode,keys:Object.keys(sdkError),message:sdkError.message};}
  }catch(sdkError){nativeSdkError={available:false,message:sdkError.code==='MODULE_NOT_FOUND'?'Actual standalone SDK is bundled rather than separately resolvable.':sdkError.message};}
  const sanitizedLog=log.split('\n').filter(line=>!/(?:authorization|bearer|access_token|identity-header|identity_header|secret|password)/i.test(line)).join('\n');
  const moduleLine=log.split('\n').find(line=>line.startsWith('HIDI_FIXTURE_MODULE_DIAGNOSTIC ')),loadedModuleDiagnostic=moduleLine?JSON.parse(moduleLine.slice('HIDI_FIXTURE_MODULE_DIAGNOSTIC '.length)):null;
  const failure={passed:false,actualNextHttp:true,failure:{name:error.name,message:error.message},storageDiagnostic,loadedModuleDiagnostic,nativeSdkError,blobCalls,apiCalls:apiCalls.map(call=>({path:call.path,method:call.method,bodyKeys:Object.keys(call.body),photoUrl:call.body.url||null})),completedChecks:results,childLog:sanitizedLog,productionDatabaseWrites:0,productionBlobWrites:0};
  await writeFile('evidence/product-upload/next-http-failure.json',JSON.stringify(failure,null,2)+'\n');
  console.error(JSON.stringify({failure:error.message,actualHelperCases:storageDiagnostic.directCases,loadedModuleDiagnostic,nativeSdkError,blobCalls,apiCalls:failure.apiCalls,fixtureErrorTrace:sanitizedLog.split('\n').filter(line=>line.startsWith('HIDI_FIXTURE_ERROR_TRACE '))}));
  throw error;
} finally {
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));
  await rm(preloadDir,{recursive:true,force:true});
}
