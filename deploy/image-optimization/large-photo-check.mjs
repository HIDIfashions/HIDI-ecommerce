/** Synthetic stress evidence, not a visual-quality benchmark for HIDI garments. */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {createImageStore,resizedImage,SOURCE_LIMIT} from '../collection-speed/images.mjs';
import {readPhotoForm} from '../../apps/web/lib/product-photo-upload.mjs';
const require=createRequire(import.meta.url),sharp=require(process.env.HIDI_TEST_SHARP||'sharp');
const pixels=Buffer.alloc(6000*4000*3);let state=1234567;
for(let i=0;i<pixels.length;i++){state=(Math.imul(1664525,state)+1013904223)>>>0;pixels[i]=state>>>24;}
let input=await sharp(pixels,{raw:{width:6000,height:4000,channels:3}}).jpeg({quality:99,chromaSubsampling:'4:2:0'}).toBuffer();
assert.ok(input.length>=30_000_000&&input.length<=40_000_000,`Expected a 30–40 MB JPEG, got ${input.length}`);
const hash=buffer=>createHash('sha256').update(buffer).digest('hex'),before=hash(input);
const cacheDir=await mkdtemp(join(tmpdir(),'hidi-large-image-'));
const evidence={synthetic:true,description:'Deterministic 24-megapixel noise image; bytes and safety test, not fabric/colour approval.',sharp:sharp.versions.sharp,input:{bytes:input.length,width:6000,height:4000,sha256:before},outputs:[],sourceReads:0,passed:false};
try{
 const store=createImageStore({sharp,cacheDir,seedDir:join(cacheDir,'none'),fetchSource:async()=>{evidence.sourceReads++;return input;}});
 for(const width of [384,640,1080,1920,2048]){
  const start=performance.now();
  const result=await store.get({source:'/media/products/stress-24mp.jpg',width,format:'webp',quality:75});
  const meta=await sharp(result.bytes).metadata();
  evidence.outputs.push({requestedWidth:width,width:meta.width,height:meta.height,bytes:result.bytes.length,format:meta.format,milliseconds:Math.round(performance.now()-start)});
  assert.ok(meta.width<=width);assert.equal(meta.format,'webp');assert.ok(result.bytes.length<input.length);
 }
 assert.equal(evidence.sourceReads,2);assert.equal(hash(input),before);
 const padded=Buffer.alloc(SOURCE_LIMIT);input.copy(padded);
 const boundary=await resizedImage(sharp,padded,640,'webp',75);
 assert.equal((await sharp(boundary).metadata()).width,640);
 const form=new FormData();form.set('file',new File([padded],'exact-40-MiB.jpg',{type:'image/jpeg'}));
 const parsed=await readPhotoForm(new Request('https://hidiindia.com/upload',{method:'POST',body:form}));
 assert.equal(parsed.get('file').size,SOURCE_LIMIT);
 const excess=new FormData();excess.set('file',new File([Buffer.alloc(SOURCE_LIMIT+1)],'too-large.jpg',{type:'image/jpeg'}));
 await assert.rejects(()=>readPhotoForm(new Request('https://hidiindia.com/upload',{method:'POST',body:excess})),error=>error.status===413);
 evidence.exact40MiBBoundary={bytes:SOURCE_LIMIT,method:'Valid JPEG with trailing padding to test the exact byte boundary',processingPassed:true,multipartPassed:true,overLimitRejected:true};
 evidence.originalUnchanged=hash(input)===before;evidence.passed=true;
 console.log(JSON.stringify(evidence,null,2));
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(evidence,null,2)+'\n');
}finally{await rm(cacheDir,{recursive:true,force:true});}
