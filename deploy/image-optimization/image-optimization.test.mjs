import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mediaPath,imageRequest,acceptsWebp,derivativeKey,masterKey,boundedBody,resizedImage,createImageStore,createProductImageHandler,SOURCE_LIMIT} from '../collection-speed/images.mjs';
import {readPhotoForm,acquirePhotoUploadSlot,MAX_PHOTO_BODY_BYTES} from '../../apps/web/lib/product-photo-upload.mjs';
const require = createRequire(import.meta.url);
const sharp = require(process.env.HIDI_TEST_SHARP || 'sharp');
const source = '/media/products/variants/sku-one/photo.jpg';
const digest = value => createHash('sha256').update(value).digest('hex');
const spec = (width = 640,format = 'webp') => ({source,width,format,quality:75});
const imageUrl = (extra='') => new URL('https://hidiindia.com/_next/image?url='+encodeURIComponent(source)+'&w=640&q=75'+extra);
async function fixture() {return sharp({create:{width:900,height:1350,channels:3,background:{r:156,g:112,b:73}}}).jpeg({quality:94}).toBuffer();}
async function temp(t) {const directory = await mkdtemp(join(tmpdir(),'hidi-image-test-'));t.after(() => rm(directory,{recursive:true,force:true}));return directory;}
function reply() {return {status:0,headers:{},body:undefined,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};}

for (const value of [source,'https://hidiindia.com'+source,'https://thehidi.com'+source,source.replace('/products/','/products/_display_v2/'),source.replace('/products/','/products/_display_v3/')]) {
  test('normalizes approved photo '+value,()=>assert.equal(mediaPath(value),source));
}
for (const value of ['//evil.com/media/products/a.jpg','https://evil.com'+source,'http://hidiindia.com'+source,'https://u:p@hidiindia.com'+source,'/media/products/../private/a.jpg','/media/products/a.svg',source+'?token=secret',source+'?hidi_image=1&hidi_image=2','/media/products/%2e%2e/a.jpg']) {
  test('rejects unapproved source '+value,()=>assert.equal(mediaPath(value),null));
}
test('keeps approved legacy cache hint',()=>assert.equal(mediaPath(source+'?hidi_image=2'),source));
test('negotiates WebP and honours q=0',()=>{assert.equal(acceptsWebp('image/avif,image/webp,*/*'),true);for(const a of ['image/webp;q=0','image/webp;q=0;foo=bar','image/webp;q=nan','image/webp;q=2','*/*'])assert.equal(acceptsWebp(a),false);assert.equal(acceptsWebp('image/webp;q=0.5'),true);});
test('parses a valid optimizer request',()=>assert.deepEqual(imageRequest(imageUrl(),'image/webp'),spec()));
for (const extra of ['&w=750','&q=90','&url='+encodeURIComponent(source),'&surprise=1']) test('rejects duplicate/extra parameters '+extra,()=>assert.equal(imageRequest(imageUrl(extra),'image/webp').error,400));
test('cache keys isolate widths, formats, and display/zoom masters',()=>{assert.notEqual(derivativeKey(spec(640)),derivativeKey(spec(750)));assert.notEqual(derivativeKey(spec()),derivativeKey(spec(640,'jpeg')));assert.notEqual(masterKey(source),masterKey(source,3840));});
test('bounds an upstream response with no Content-Length',async()=>assert.deepEqual(await boundedBody(new Response(Buffer.from('abc'),{headers:{'content-type':'image/jpeg'}})),Buffer.from('abc')));
test('rejects oversized declared response and cancels body',async()=>{let cancelled=false;const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-length':String(SOURCE_LIMIT+1)}});await assert.rejects(()=>boundedBody(response),/limit/);assert.equal(cancelled,true);});
test('rejects an oversized chunked response',async()=>{const response=new Response(new ReadableStream({start(c){for(let n=0;n<41;n++)c.enqueue(Buffer.alloc(1024*1024));c.close();}}));await assert.rejects(()=>boundedBody(response),/limit/);});
test('rejects HTML upstream, missing source, and empty bytes',async()=>{await assert.rejects(()=>boundedBody(new Response('x',{headers:{'content-type':'text/html'}})));await assert.rejects(()=>boundedBody(new Response('x',{status:404})));await assert.rejects(()=>boundedBody(new Response(Buffer.alloc(0))));});
test('returns correctly sized WebP with original pixels untouched',async()=>{const input=await fixture(),before=digest(input);const output=await resizedImage(sharp,input,640,'webp',75);const meta=await sharp(output).metadata();assert.equal(meta.width,640);assert.equal(meta.height,960);assert.equal(meta.format,'webp');assert.equal(meta.hasProfile,true);assert.equal(digest(input),before);});
test('does not upscale a small photo',async()=>{const input=await sharp({create:{width:60,height:90,channels:3,background:'white'}}).png().toBuffer();const meta=await sharp(await resizedImage(sharp,input,640,'webp',75)).metadata();assert.equal(meta.width,60);assert.equal(meta.height,90);});
test('normalizes EXIF orientation without retaining EXIF metadata',async()=>{const input=await sharp({create:{width:900,height:600,channels:3,background:'white'}}).withMetadata({orientation:6}).jpeg().toBuffer();const meta=await sharp(await resizedImage(sharp,input,640,'webp',75)).metadata();assert.equal(meta.width,600);assert.equal(meta.height,900);assert.equal(meta.orientation,undefined);assert.equal(meta.exif,undefined);});
test('preserves alpha in WebP output',async()=>{const input=await sharp({create:{width:60,height:90,channels:4,background:{r:255,g:0,b:0,alpha:0.2}}}).png().toBuffer();assert.equal((await sharp(await resizedImage(sharp,input,640,'webp',75)).metadata()).hasAlpha,true);});
test('bounds very tall photo output without cropping',async()=>{const input=await sharp({create:{width:10,height:10000,channels:3,background:'white'}}).png().toBuffer();const meta=await sharp(await resizedImage(sharp,input,640,'webp',75)).metadata();assert.ok(meta.height<=1280);assert.ok(meta.width<=640);});
test('rejects corrupt images rather than serving the original',async()=>assert.rejects(()=>resizedImage(sharp,Buffer.from('not an image'),640,'webp',75)));
test('rejects oversized bytes before decoding',async()=>assert.rejects(()=>resizedImage(sharp,Buffer.alloc(SOURCE_LIMIT+1),640,'webp',75)));
test('caches derivatives, deduplicates visitors, and shares the display master',async t=>{const cacheDir=await temp(t),input=await fixture();let reads=0;const store=createImageStore({sharp,cacheDir,seedDir:join(cacheDir,'none'),fetchSource:async()=>{reads++;return input;}});await Promise.all(Array.from({length:8},()=>store.get(spec())));await store.get(spec(750));assert.equal(reads,1);assert.equal((await store.get(spec())).cache,'HIT');});
test('fetches zoom only on demand and caches its master',async t=>{const cacheDir=await temp(t),input=await fixture();let reads=0;const store=createImageStore({sharp,cacheDir,seedDir:join(cacheDir,'none'),fetchSource:async()=>{reads++;return input;}});await store.get(spec());assert.equal(reads,1);await Promise.all([store.get(spec(2048)),store.get(spec(3840))]);assert.equal(reads,2);await store.get(spec(2048));assert.equal(reads,2);});
test('serializes source fetching even for simultaneous zoom requests',async t=>{const cacheDir=await temp(t),input=await fixture();let active=0,max=0;const store=createImageStore({sharp,cacheDir,seedDir:join(cacheDir,'none'),fetchSource:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,10));active--;return input;}});await Promise.all([1,2,3].map(n=>store.get({...spec(3840),source:source.replace('photo.jpg',n+'.jpg')})));assert.equal(max,1);});
test('HTTP GET, HEAD, ETag, and unsupported method retain correct semantics',async t=>{const cacheDir=await temp(t),input=await fixture();const handler=createProductImageHandler({origin:'http://127.0.0.1:3000',sharp,cacheDir,seedDir:join(cacheDir,'none'),fetchSource:async()=>input});const req={method:'GET',url:imageUrl().pathname+imageUrl().search,headers:{accept:'image/webp'}};const a=reply();assert.equal(await handler.handle(req,a,'/_next/image'),true);assert.equal(a.status,200);assert.equal(a.headers['Content-Type'],'image/webp');assert.equal(a.headers.Vary,'Accept');assert.equal(a.headers['X-Hidi-Image-Version'],'3');const b=reply();await handler.handle({...req,method:'HEAD'},b,'/_next/image');assert.equal(b.status,200);assert.equal(b.body,undefined);const c=reply();await handler.handle({...req,headers:{...req.headers,'if-none-match':'W/'+a.headers.ETag}},c,'/_next/image');assert.equal(c.status,304);assert.equal(c.body,undefined);const d=reply();await handler.handle({...req,method:'POST'},d,'/_next/image');assert.equal(d.status,405);assert.equal(d.headers.Allow,'GET, HEAD');assert.equal(await handler.handle(req,reply(),'/checkout'),false);});
test('processing failure never returns multi-megabyte originals',async t=>{const cacheDir=await temp(t);const handler=createProductImageHandler({origin:'http://127.0.0.1:3000',sharp,cacheDir,seedDir:join(cacheDir,'none'),fetchSource:async()=>{throw new Error('unavailable');}});const response=reply();await handler.handle({method:'GET',url:imageUrl().href,headers:{}},response,'/_next/image');assert.equal(response.status,503);assert.equal(response.body,undefined);assert.equal(response.headers['Cache-Control'],'no-store');});
test('reads exactly one multipart photo',async()=>{const form=new FormData();form.set('file',new File([Buffer.from('image bytes')],'a.jpg',{type:'image/jpeg'}));form.set('applyToColor','true');const parsed=await readPhotoForm(new Request('https://hidiindia.com/upload',{method:'POST',body:form}));assert.equal(parsed.get('file').name,'a.jpg');assert.equal(parsed.get('applyToColor'),'true');});
test('rejects multiple file fields',async()=>{const form=new FormData();form.append('file',new File(['x'],'a.jpg'));form.append('file',new File(['x'],'b.jpg'));await assert.rejects(()=>readPhotoForm(new Request('https://hidiindia.com/upload',{method:'POST',body:form})),/one photo/);});
test('enforces multipart request cap before parsing',async()=>{const request=new Request('https://hidiindia.com/upload',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x','content-length':String(MAX_PHOTO_BODY_BYTES+1)},body:'x'});await assert.rejects(()=>readPhotoForm(request),error=>error.status===413);});
test('upload slot cannot be prematurely reopened by double release',()=>{const first=acquirePhotoUploadSlot();assert.throws(acquirePhotoUploadSlot,error=>error.status===429);first();const second=acquirePhotoUploadSlot();first();assert.throws(acquirePhotoUploadSlot);second();const third=acquirePhotoUploadSlot();third();});

test('retains recovery for the existing browser-readable truncated JPEG case',async()=>{
 const raw=Buffer.alloc(1200*1800*3);for(let i=0;i<raw.length;i++)raw[i]=(i*7+Math.floor(i/100))%256;
 const valid=await sharp(raw,{raw:{width:1200,height:1800,channels:3}}).jpeg({quality:88,progressive:true}).toBuffer();
 const incomplete=valid.subarray(0,valid.length-30);
 await assert.rejects(sharp(incomplete).resize(640).webp().toBuffer(),/VipsJpeg:/);
 const output=await resizedImage(sharp,incomplete,640,'webp',75),meta=await sharp(output).metadata();
 assert.equal(meta.width,640);assert.equal(meta.height,960);assert.equal(meta.format,'webp');assert.ok(output.length<600000);
});
test('retains the 100 MP input limit and does not retry pixel-limit errors',async()=>{
 const calls=[];const mock=(_input,options)=>{calls.push(options);throw new Error('Input image exceeds pixel limit');};
 await assert.rejects(()=>resizedImage(mock,Buffer.from([255,216,0]),640,'webp',75),/pixel limit/);
 assert.equal(calls.length,1);assert.equal(calls[0].limitInputPixels,100000000);assert.equal(calls[0].failOn,'warning');
});
