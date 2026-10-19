import test from 'node:test';import assert from 'node:assert/strict';
import http from 'node:http';import {createBrotliDecompress,createGunzip} from 'node:zlib';
import {streamInitialHome} from './stream-home.mjs';
test('fresh body waits for data while unchanged head is delivered through each encoding',async()=>{
 for(const encoding of ['br','gzip','identity','br;q=0,gzip;q=0']){
  let release;const ready=new Promise(resolve=>release=resolve);
  const head='<html><head><style>body{color:red}</style><link rel="preload" as="image" type="image/avif" media="(min-width: 701px)" fetchpriority="high" href="/poster.avif"></head>',tail='<body>fresh hero</body></html>';
  const server=http.createServer((req,res)=>{void streamInitialHome(req,res,{'content-type':'text/html','cache-control':'no-cache',etag:'"old"','content-length':'3'},head+'<body>placeholder</body></html>',async()=>{await ready;return tail;});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await new Promise((resolve,reject)=>{
   const req=http.get({hostname:'127.0.0.1',port:server.address().port,headers:{'accept-encoding':encoding,'if-none-match':'"old"'}},res=>{
    assert.equal(res.statusCode,200);assert(!res.headers.etag);assert(!res.headers['content-length']);assert.match(res.headers.vary,/Accept-Encoding/);assert.match(res.headers.vary,/User-Agent/);assert.match(res.headers.vary,/Sec-CH-UA-Mobile/);assert.match(res.headers.vary,/Cookie/);assert.match(res.headers.vary,/Save-Data/);assert.match(res.headers.link,/\<\/poster\.avif\>/);assert.match(res.headers.link,/media=\"\(min-width: 701px\)\"/);
    const input=res.headers['content-encoding']==='br'?res.pipe(createBrotliDecompress()):res.headers['content-encoding']==='gzip'?res.pipe(createGunzip()):res;
    let text='',first=true;input.on('error',reject);input.on('data',chunk=>{text+=chunk.toString();if(first){first=false;assert.equal(text,head);release();}});input.on('end',()=>{assert.equal(text,head+tail);resolve();});
   });req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('Head was not flushed before public data')));
  });}finally{release();await new Promise(resolve=>server.close(resolve));}
 }
});
test('failed public rendering returns the unchanged browser fallback',async()=>{
 const {Writable}=await import('node:stream');const chunks=[];
 const response=new Writable({write(chunk,_,done){chunks.push(chunk);done();}});response.removeHeader=()=>{};response.writeHead=()=>{};
 const html='<head></head><body>original</body>';await streamInitialHome({method:'GET',headers:{}},response,{},html,async()=>{throw Error('Unavailable');});
 assert.equal(Buffer.concat(chunks).toString(),html);
});
test('fast public data coalesces exact fresh HTML through every encoding without stale validators',async()=>{let generation=0;const head='<html><head><title>HIDI</title></head>',server=http.createServer((req,res)=>{void streamInitialHome(req,res,{'content-type':'text/html','cache-control':'no-cache',etag:'"stale"'},head+'<body>old</body></html>',async()=>'<body>fresh-'+(++generation)+'</body></html>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{for(const encoding of ['br','gzip','identity','br;q=0,gzip;q=0'])for(let visit=0;visit<2;visit++){await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:server.address().port,headers:{'accept-encoding':encoding,'if-none-match':'"stale"'}},res=>{assert.equal(res.statusCode,200);assert(!res.headers.etag);assert.match(res.headers['server-timing'],/coalesced/);assert.match(res.headers.vary,/Cookie/);const input=res.headers['content-encoding']==='br'?res.pipe(createBrotliDecompress()):res.headers['content-encoding']==='gzip'?res.pipe(createGunzip()):res;let text='';input.on('data',chunk=>text+=chunk.toString());input.on('error',reject);input.on('end',()=>{assert.equal(text,head+'<body>fresh-'+generation+'</body></html>');resolve();});}).on('error',reject);});}}finally{await new Promise(resolve=>server.close(resolve));}});
