import test from 'node:test';import assert from 'node:assert/strict';import {createServer,get} from 'node:http';import {Readable} from 'node:stream';import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {compressCatalogue} from './compression.mjs';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const body=Buffer.from(JSON.stringify({products:Array.from({length:500},(_,id)=>({id,name:'HIDI catalogue product',price:225000}))}));
test('catalogue compression retains bytes, privacy, validators and negotiation',async()=>{
 const server=createServer((req,res)=>{const headers={'content-type':'application/json','content-length':String(body.length),'cache-control':'private, no-store',etag:'"original"'};const incoming=Readable.from([body]);if(!compressCatalogue(req,res,incoming,200,headers,'/api/store/products')){res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:body);}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 try{for(const [accept,wanted] of [['br, gzip','br'],['gzip','gzip'],['br;q=0, gzip','gzip'],['identity',undefined]]){
  const r=await new Promise(resolve=>get({host:'127.0.0.1',port:server.address().port,headers:{'accept-encoding':accept}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({headers:res.headers,body:Buffer.concat(chunks)}));}));
  assert.equal(r.headers['content-encoding'],wanted);assert.equal(r.headers['cache-control'],'private, no-store');assert.deepEqual(wanted==='br'?brotliDecompressSync(r.body):wanted==='gzip'?gunzipSync(r.body):r.body,body);if(wanted){assert.match(r.headers.vary,/Accept-Encoding/);assert.equal(r.headers['content-length'],undefined);assert.equal(r.headers.etag,'W/"original"');assert(r.body.length<body.length/4);}
 }}finally{await new Promise(done=>server.close(done));}
});
test('compression excludes writes, errors, ranges, private endpoints and already encoded bodies',()=>{
 for(const row of [{method:'POST'},{status:401},{range:'bytes=0-10'},{path:'/api/store/cart'},{encoding:'gzip'}]){
  const request={method:row.method||'GET',headers:{'accept-encoding':'br',...(row.range?{range:row.range}:{})}},headers={'content-type':'application/json',...(row.encoding?{'content-encoding':row.encoding}:{})};
  assert.equal(compressCatalogue(request,{},null,row.status||200,headers,row.path||'/api/store/products'),false);
 }
});
test('optimized media retains future unrecognized uploads and selects the correct device variant',()=>{
 for(const mobile of [true,false]){
  const scope={URL,location:{origin:'https://hidiindia.com'},matchMedia:()=>({matches:mobile}),HidiMediaManifest:{images:{},videos:{'/selected.mp4':{mobile:{url:'/small.mp4',poster:'/small.webp'},desktop:{url:'/large.mp4',poster:'/large.webp'}}}}};
  runInNewContext(readFileSync(new URL('./client.js',import.meta.url),'utf8'),scope);
  assert.equal(scope.HidiMediaVideo('/future.mp4'),'/future.mp4');assert.equal(scope.HidiMediaPoster('/future.mp4'),undefined);assert.equal(scope.HidiMediaVideo('/selected.mp4'),mobile?'/small.mp4':'/large.mp4');assert.equal(scope.HidiMediaPoster('/selected.mp4'),mobile?'/small.webp':'/large.webp');
  const image={src:'/new-upload.webp',alt:'Original text',style:{objectPosition:'30% 70%'}};assert.equal(scope.HidiMediaImageProps(image),image);
 }
});
test('landing collection cards use their fitted desktop width while other media keeps its reviewed default',()=>{
 const scope={URL,location:{origin:'https://hidiindia.com'},HidiMediaManifest:{images:{'/landing.png':{variants:[{width:320,url:'/landing-320.webp'},{width:640,url:'/landing-640.webp'},{width:960,url:'/landing-960.webp'}]}}}};
 runInNewContext(readFileSync(new URL('./client.js',import.meta.url),'utf8'),scope);
 const landing=scope.HidiMediaImageProps({src:'/landing.png','data-landing-media-slot':'range-occasion'});
 const ordinary=scope.HidiMediaImageProps({src:'/landing.png'});
 assert.equal(landing.sizes,'(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 25vw');
 assert.equal(ordinary.sizes,'(max-width: 700px) 100vw, (max-width: 1100px) 60vw, 50vw');
});
