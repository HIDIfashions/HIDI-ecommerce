import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {resizedImage,createImageStore} from '../collection-speed/images.mjs';
const require=createRequire(import.meta.url);const sharp=require(process.env.HIDI_SHARP_MODULE||'sharp');sharp.concurrency(1);
test('browser-readable progressive JPEG without ending data recovers to bounded WebP',async()=>{
 const raw=Buffer.alloc(1200*1800*3);for(let i=0;i<raw.length;i++)raw[i]=(i*7+Math.floor(i/100))%256;
 const valid=await sharp(raw,{raw:{width:1200,height:1800,channels:3}}).jpeg({quality:88,progressive:true}).toBuffer();
 const incomplete=valid.subarray(0,valid.length-30);
 await assert.rejects(sharp(incomplete).resize(640).webp().toBuffer(),/VipsJpeg:/);
 const result=await resizedImage(sharp,incomplete,640,'webp',75),meta=await sharp(result).metadata();assert.equal(meta.width,640);assert.equal(meta.height,960);assert.equal(meta.format,'webp');assert(result.length<600000);
 const dir=await mkdtemp(join(tmpdir(),'hidi-jpeg-recovery-'));let reads=0;
 try{const store=createImageStore({sharp,fetchSource:async()=>{reads++;return incomplete;},cacheDir:dir,seedDir:join(dir,'absent')});const spec={source:'/media/products/variants/test/incomplete.jpg',width:640,format:'webp',quality:75};const a=await store.get(spec),b=await store.get(spec);assert.equal(reads,1);assert.equal(b.cache,'HIT');assert.deepEqual(a.bytes,b.bytes);}finally{await rm(dir,{recursive:true,force:true});}
});
test('valid JPEG retains strict decoder and normal output bytes',async()=>{
 const source=await sharp({create:{width:960,height:1440,channels:3,background:'#e4cdbb'}}).jpeg().toBuffer();const expected=await sharp(source,{limitInputPixels:100000000,sequentialRead:true}).rotate().resize({width:640,withoutEnlargement:true}).webp({quality:75,effort:2}).toBuffer();assert.deepEqual(await resizedImage(sharp,source,640,'webp',75),expected);
});
test('unrelated corruption and pixel-limit errors are rejected',async()=>{
 await assert.rejects(resizedImage(sharp,Buffer.from('invalid image'),640,'webp',75));
 const options=[];const mock=(_b,o)=>{options.push(o);throw Error('Input image exceeds pixel limit');};await assert.rejects(resizedImage(mock,Buffer.from([255,216,0]),640,'webp',75),/pixel limit/);assert.equal(options.length,1);assert.equal(options[0].failOn,'warning');
});
