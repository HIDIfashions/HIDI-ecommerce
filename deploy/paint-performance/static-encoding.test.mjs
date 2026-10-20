import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';
import {Writable} from 'node:stream';import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {prepareAsset} from './precompress.mjs';import {createPreparedAssetSender} from './static-encoding.mjs';
const bundle='assets/index-0123456789abcdef.js';
async function fixture(){
 const folder=await mkdtemp(join(tmpdir(),'hidi-prepared-'));await mkdir(resolve(folder,'dist/assets'),{recursive:true});
 const body=await readFile(new URL('../pricing/storefront.mjs',import.meta.url));await writeFile(resolve(folder,'dist',bundle),body);
 const report=await prepareAsset(folder,bundle),manifest=pathToFileURL(resolve(folder,'paint-performance/asset-encodings.json'));
 return {folder,body,report,manifest,send:createPreparedAssetSender(manifest)};
}
function call(send,body,accept='br',extra={},method='GET',status=200,requestHeaders={}){return new Promise(done=>{
 const chunks=[],response=new Writable({write(chunk,_,next){chunks.push(chunk);next();}});response.removeHeader=()=>{};
 response.writeHead=(status,headers)=>{response.status=status;response.headers=headers;};response.on('finish',()=>done({...response,bytes:Buffer.concat(chunks)}));
 send({url:'/'+bundle,method,headers:{'accept-encoding':accept,...requestHeaders}},response,status,{'content-type':'text/javascript','cache-control':'public, max-age=31536000, immutable',etag:'"source"',...extra},body);
});}
test('prepared build encodings preserve exact source, negotiation, cache and validators',async()=>{
 const f=await fixture();try{
  for(const [accept,encoding] of [['br','br'],['gzip','gzip'],['br;q=0, gzip;q=1','gzip']]){
   const r=await call(f.send,f.body,accept);assert.equal(r.headers['content-encoding'],encoding);assert.equal(r.bytes.length,f.report.encodings[encoding].bytes);
   assert.deepEqual((encoding==='br'?brotliDecompressSync:gunzipSync)(r.bytes),f.body);assert.equal(r.headers.etag,'W/"source"');assert.match(r.headers.vary,/Accept-Encoding/);assert.match(r.headers['cache-control'],/immutable/);assert.equal(r.headers['content-type'],'text/javascript');assert.equal(r.headers['content-length'],r.bytes.length);
  }
  assert.deepEqual(await readFile(resolve(f.folder,'dist',bundle)),f.body);assert(f.report.encodings.br.bytes<f.report.referenceBr4Bytes*.95);
 }finally{await rm(f.folder,{recursive:true,force:true});}
});
test('identity, ranges, HEAD, no-transform and private responses retain existing protocol behavior',async()=>{
 const f=await fixture();try{
  for(const [accept,extra,method,status,headers] of [['identity',{},'GET',200,{}],['br',{'cache-control':'public, immutable, no-transform'},'GET',200,{}],['br',{},'HEAD',200,{}],['br',{'content-range':'bytes 0-9/100'},'GET',206,{range:'bytes=0-9'}]]){
   const r=await call(f.send,f.body,accept,extra,method,status,headers);assert(!r.headers['content-encoding']);assert.deepEqual(r.bytes,method==='HEAD'?Buffer.alloc(0):f.body);assert.equal(r.headers.etag,'"source"');
  }
  for(const control of ['private, immutable','no-store, immutable']){const r=await call(f.send,f.body,'br',{'cache-control':control});assert.deepEqual(brotliDecompressSync(r.bytes),f.body);}
 }finally{await rm(f.folder,{recursive:true,force:true});}
});
test('changed source or corrupt prepared files fall back without serving stale code',async()=>{
 const f=await fixture();try{
  const changed=Buffer.concat([Buffer.from('// updated\n'),f.body]),r=await call(f.send,changed);assert.deepEqual(brotliDecompressSync(r.bytes),changed);
  await writeFile(resolve(f.folder,'paint-performance',f.report.encodings.br.file),'corrupt');const fallback=createPreparedAssetSender(f.manifest),r2=await call(fallback,f.body);assert.deepEqual(brotliDecompressSync(r2.bytes),f.body);
 }finally{await rm(f.folder,{recursive:true,force:true});}
});
