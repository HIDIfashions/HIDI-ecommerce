import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {mediaPath,imageRequest,createImageStore,createProductImageHandler} from '../deploy/collection-speed/images.mjs';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const sharp=require('next/dist/server/image-optimizer.js').getSharp(1,false);
const source='/media/products/variants/example/photo.webp';
test('only owned product photo paths and bounded sizes are accepted',()=>{
  assert.equal(mediaPath('https://thidigk.thehidi.com'+source),source);
  for(const value of ['https://evil.invalid'+source,'http://hidiindia.com'+source,source+'?token=secret','/media/private/file.png','/media/products/../private/photo.jpg','//evil.invalid'+source])assert.equal(mediaPath(value),null,value);
  const url=new URL('https://hidiindia.com/_next/image?url='+encodeURIComponent(source+'?hidi_image=2')+'&w=1080&q=75');
  assert.equal(imageRequest(url,'image/webp').width,1080);
  assert.equal(imageRequest(url,'image/webp;q=0').format,'jpeg');
  url.searchParams.set('w','99999');assert.equal(imageRequest(url).error,400);
});
test('concurrent requests decode the master once and produce actual resized bytes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'hidi-images-'));let reads=0;
  const original=await sharp({create:{width:4200,height:6300,channels:3,background:'#863437'}}).webp().toBuffer();
  const store=createImageStore({sharp,cacheDir:dir,seedDir:join(dir,'no-seed'),fetchSource:async()=>{reads++;return original;}});
  try{
    const spec={source,width:1080,quality:75,format:'webp'};
    const results=await Promise.all([store.get(spec),store.get(spec),store.get({...spec,width:640})]);
    assert.equal(reads,1);assert.equal((await sharp(results[0].bytes).metadata()).width,1080);
    assert.equal((await sharp(results[2].bytes).metadata()).width,640);
    assert(results[0].bytes.length<100000);assert.equal((await store.get(spec)).cache,'HIT');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('real image HTTP supports HEAD, ETags and JPEG fallback; failures never send originals',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'hidi-image-http-'));
  const original=await sharp({create:{width:2400,height:3600,channels:3,background:'#c29e70'}}).png().toBuffer();
  const handler=createProductImageHandler({origin:new URL('http://127.0.0.1:3001'),sharp,cacheDir:dir,seedDir:join(dir,'empty'),fetchSource:async value=>{if(value.includes('missing'))throw Error('missing');return original;}});
  const server=createServer(async(req,res)=>{if(!await handler.handle(req,res,new URL(req.url,'http://fixture').pathname)){res.writeHead(404);res.end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
  const path='/_next/image?url='+encodeURIComponent(source)+'&w=640&q=75';
  try{
    const response=await fetch(base+path,{headers:{Accept:'image/webp'}});assert.equal(response.status,200);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal((await sharp(bytes).metadata()).width,640);
    assert.match(response.headers.get('cache-control'),/immutable/);
    const head=await fetch(base+path,{method:'HEAD',headers:{Accept:'image/webp'}});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(Number(head.headers.get('content-length')),bytes.length);
    assert.equal((await fetch(base+path,{headers:{Accept:'image/webp','If-None-Match':response.headers.get('etag')}})).status,304);
    assert.equal((await fetch(base+path)).headers.get('content-type'),'image/jpeg');
    const missing=await fetch(base+path.replace('photo.webp','missing.webp'));assert.equal(missing.status,503);assert.equal((await missing.arrayBuffer()).byteLength,0);
    assert.equal((await fetch(base+path.replace('w=640','w=9999'))).status,400);
    assert.equal((await fetch(base+path,{method:'POST'})).status,405);
    assert.equal((await fetch(base+'/_next/image?url=%2Fbrand%2Flogo.png&w=640&q=75')).status,404);
  }finally{server.closeAllConnections();await new Promise(done=>server.close(done));await rm(dir,{recursive:true,force:true});}
});
