import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Readable} from 'node:stream';
import {mkdtemp,rm,readdir,stat,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {photoToDisk,downloadPhotoToDisk} from '../collection-speed/photo-disk.mjs';
import {readStreamedPhotoForm,acquirePhotoUploadSlot} from '../../apps/web/lib/photo-upload-stream.mjs';
import {uploadDiskPhotoToBlob} from '../../apps/web/lib/photo-azure-stream.mjs';
import {photoDigest} from '../../apps/web/lib/photo-digest.mjs';
import {resizedImage,createImageStore} from '../collection-speed/images.mjs';
const require=createRequire(import.meta.url),sharp=require(process.env.HIDI_TEST_SHARP||'sharp');
const hash=x=>createHash('sha256').update(x).digest('hex');
async function temp(t){const path=await mkdtemp(join(tmpdir(),'hidi-stream-test-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
async function fixture(format='jpeg'){return sharp({create:{width:120,height:180,channels:3,background:{r:173,g:143,b:110}}})[format]().toBuffer();}
function request(bytes,mime='image/jpeg',extras=[]){const f=new FormData();f.set('file',new File([bytes],'photo.'+({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'}[mime]||'bin'),{type:mime}));for(const [k,v]of extras)f.append(k,v);return new Request('https://hidiindia.com/api/admin/inventory/v/images',{method:'POST',body:f});}
for(const [format,mime]of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp'],['avif','image/avif']])test('streamed valid '+format+' preserves original bytes and removes temporary files',async t=>{
 const directory=await temp(t),bytes=await fixture(format),form=await readStreamedPhotoForm(request(bytes,mime,[['alt','Cream kurta']]),{directory});
 const file=form.get('file');assert.equal(file.size,bytes.length);assert.equal(file.sha256,hash(bytes));assert.deepEqual(await readFile(file.path),bytes);assert.equal(form.get('alt'),'Cream kurta');await form.cleanup();await form.cleanup();assert.deepEqual(await readdir(directory),[]);
});
for(const size of [12*1024*1024,40*1024*1024,40*1024*1024+1,60*1024*1024,100*1024*1024])test('streamed multipart accepts '+size+' bytes without the former fixed cap',async t=>{
 const directory=await temp(t),jpeg=await fixture();const boundary='hidi-test-boundary';
 async function* body(){yield Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');yield jpeg;let remaining=size-jpeg.length;const chunk=Buffer.alloc(65536);while(remaining){const n=Math.min(remaining,chunk.length);yield chunk.subarray(0,n);remaining-=n;}yield Buffer.from('\r\n--'+boundary+'--\r\n');}
 const req=new Request('https://hidiindia.com/upload',{method:'POST',headers:{'content-type':'multipart/form-data; boundary='+boundary},body:Readable.toWeb(Readable.from(body())),duplex:'half'});
 const form=await readStreamedPhotoForm(req,{directory});assert.equal(form.get('file').size,size);assert.equal((await stat(form.get('file').path)).size,size);await form.cleanup();assert.deepEqual(await readdir(directory),[]);
});
test('chunked source download also permits a photo above 40 MiB and bounds display output',async t=>{
 const directory=await temp(t),jpeg=await fixture();const size=41*1024*1024;
 async function* body(){yield jpeg;let n=size-jpeg.length;const b=Buffer.alloc(65536);while(n){const k=Math.min(n,b.length);yield b.subarray(0,k);n-=k;}}
 const file=await downloadPhotoToDisk(new Response(Readable.toWeb(Readable.from(body())),{headers:{'content-type':'image/jpeg','content-length':String(size)}}),{directory});
 const result=await resizedImage(sharp,file.path,640,'webp',75);assert.equal((await sharp(result).metadata()).format,'webp');assert.ok(result.length<100000);await file.cleanup();assert.deepEqual(await readdir(directory),[]);
});
test('cold derivative creation always cleans a disk-backed original',async t=>{
 const directory=await temp(t),cacheDir=await temp(t),bytes=await fixture();
 const store=createImageStore({sharp,cacheDir,seedDir:join(cacheDir,'none'),fetchSource:()=>photoToDisk([bytes],{directory})});
 const a=await store.get({source:'/media/products/a.jpg',width:640,quality:75,format:'webp'});assert.equal(a.cache,'MISS');assert.deepEqual(await readdir(directory),[]);
});
test('invalid source decoding also cleans the disk original',async t=>{
 const directory=await temp(t),cacheDir=await temp(t);const store=createImageStore({sharp,cacheDir,seedDir:join(cacheDir,'none'),fetchSource:()=>photoToDisk([Buffer.from('invalid')],{directory})});await assert.rejects(()=>store.get({source:'/media/products/a.jpg',width:640,quality:75,format:'webp'}));assert.deepEqual(await readdir(directory),[]);
});
for(const [label,bytes,mime]of [['empty',Buffer.alloc(0),'image/jpeg'],['corrupt',Buffer.from('not a photo'),'image/jpeg'],['SVG masquerading as JPEG',Buffer.from('<svg/>'),'image/jpeg'],['unsupported PDF',Buffer.from('%PDF'),'application/pdf']])test('rejects '+label+' and cleans temporary data',async t=>{
 const directory=await temp(t);await assert.rejects(()=>readStreamedPhotoForm(request(bytes,mime),{directory}),e=>e.status===400);assert.deepEqual(await readdir(directory),[]);
});
test('rejects a MIME mismatch without changing original bytes',async t=>{const directory=await temp(t);await assert.rejects(async()=>readStreamedPhotoForm(request(await fixture('png'),'image/jpeg'),{directory}),e=>e.status===400);assert.deepEqual(await readdir(directory),[]);});
test('rejects duplicate file fields',async t=>{const directory=await temp(t),jpeg=await fixture();await assert.rejects(()=>readStreamedPhotoForm(request(jpeg,'image/jpeg',[['file',new File([jpeg],'b.jpg',{type:'image/jpeg'})]]),{directory}),e=>e.status===400);assert.deepEqual(await readdir(directory),[]);});
test('rejects duplicate and oversized metadata',async t=>{const directory=await temp(t),jpeg=await fixture();for(const fields of [[['alt','a'],['alt','b']],[['alt','x'.repeat(8193)]]]){await assert.rejects(()=>readStreamedPhotoForm(request(jpeg,'image/jpeg',fields),{directory}),e=>e.status===400);assert.deepEqual(await readdir(directory),[]);}});
test('rejects missing multipart boundary',async()=>{const req=new Request('https://hidiindia.com/upload',{method:'POST',headers:{'content-type':'multipart/form-data'},body:'x'});await assert.rejects(()=>readStreamedPhotoForm(req),e=>e.status===400);});
test('rejects truncated multipart and deletes partial files',async t=>{const directory=await temp(t);const req=new Request('https://hidiindia.com/upload',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body:'--x\r\nContent-Disposition: form-data; name="file"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\nabc'});await assert.rejects(()=>readStreamedPhotoForm(req,{directory}));assert.deepEqual(await readdir(directory),[]);});
test('disk-reserve exhaustion fails with 507 and removes partial files',async t=>{const directory=await temp(t);let reads=0;await assert.rejects(()=>photoToDisk([Buffer.alloc(10),Buffer.alloc(10)],{directory,reserve:100,freeBytes:async()=>++reads<3?1000:105}),e=>e.status===507);assert.deepEqual(await readdir(directory),[]);});
test('abort interrupts ingestion and deletes temporary files',async t=>{const directory=await temp(t);const control=new AbortController();async function* chunks(){yield Buffer.from('some');control.abort();yield Buffer.from('more');}await assert.rejects(()=>photoToDisk(chunks(),{directory,signal:control.signal}),e=>e.status===408);assert.deepEqual(await readdir(directory),[]);});
test('declared length mismatch fails instead of saving a truncated source',async t=>{const directory=await temp(t);await assert.rejects(()=>photoToDisk([Buffer.from('abc')],{directory,expectedBytes:5}),/incomplete/);assert.deepEqual(await readdir(directory),[]);});
test('incremental browser digest matches the existing SHA-256 naming contract',async()=>{const bytes=Buffer.alloc(1000003,73);assert.equal(await photoDigest(new File([bytes],'x.jpg')),hash(bytes));});
test('upload concurrency guard releases safely after failure',()=>{const release=acquirePhotoUploadSlot();assert.throws(acquirePhotoUploadSlot,e=>e.status===429);release();const next=acquirePhotoUploadSlot();release();assert.throws(acquirePhotoUploadSlot);next();});
async function diskFixture(t){return photoToDisk([await fixture()],{directory:await temp(t)});}
const name='products/variants/fixture/batch-'+'a'.repeat(64)+'.jpg';
test('Azure SDK write uses staged blocks and bounded concurrency',async t=>{const disk=await diskFixture(t);let seen;await uploadDiskPhotoToBlob({name,uploadFile:async(path,options)=>{seen=options;assert.equal(path,disk.path);}},disk,'image/jpeg');assert.equal(seen.blockSize,4*1024*1024);assert.equal(seen.concurrency,2);assert.deepEqual(seen.conditions,{ifNoneMatch:'*'});assert.equal(seen.metadata.hidi_source_sha256,disk.sha256);});
test('identical Azure replay is verified from downloaded bytes without overwrite',async t=>{const disk=await diskFixture(t);let downloads=0;await uploadDiskPhotoToBlob({name,uploadFile:async()=>{throw {statusCode:412};},getProperties:async()=>({contentLength:disk.size,contentType:'image/jpeg'}),download:async()=>{downloads++;return {readableStreamBody:Readable.from([await readFile(disk.path)])};}},disk,'image/jpeg');assert.equal(downloads,1);});
test('same-sized different Azure replay bytes are rejected',async t=>{const disk=await diskFixture(t);await assert.rejects(()=>uploadDiskPhotoToBlob({name,uploadFile:async()=>{throw {statusCode:412};},getProperties:async()=>({contentLength:disk.size,contentType:'image/jpeg'}),download:async()=>({readableStreamBody:Readable.from([Buffer.alloc(disk.size)])})},disk,'image/jpeg'),/differs/);});
test('Azure size mismatch and arbitrary-key conflicts are not accepted as successful retries',async t=>{const disk=await diskFixture(t);await assert.rejects(()=>uploadDiskPhotoToBlob({name,uploadFile:async()=>{throw {statusCode:412};},getProperties:async()=>({contentLength:disk.size+1,contentType:'image/jpeg'})},disk,'image/jpeg'),/differs/);await assert.rejects(()=>uploadDiskPhotoToBlob({name:'products/variants/fixture/random.jpg',uploadFile:async()=>{throw {statusCode:409};}},disk,'image/jpeg'));});
