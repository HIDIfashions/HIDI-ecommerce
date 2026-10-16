/** Prepare existing public catalogue derivatives before the revision receives traffic. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {createImageStore,mediaPath} from './images.mjs';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME);
const require=createRequire(join(root,'apps/web/server.js'));
const sharp=require('next/dist/server/image-optimizer.js').getSharp(1,false);
const seedDir=process.env.HIDI_IMAGE_SEED_DIR||join(root,'product-images/seed');await mkdir(seedDir,{recursive:true});
const products=await (await fetch('https://hidiindia.com/api/store/products',{signal:AbortSignal.timeout(30000)})).json();
assert(Array.isArray(products));
const sources=new Set();
for(const product of products){
  for(const image of [...product.images||[],...(product.variants||[]).flatMap(v=>v.images||[])]){
    const path=mediaPath(image.url);if(path)sources.add(path);
  }
}
assert(sources.size>0&&sources.size<=400,'Bounded published product photos required');
const originals=new Map();
const store=createImageStore({sharp,seedDir:join(seedDir,'absent'),cacheDir:seedDir,fetchSource:async path=>{
  const response=await fetch('https://hidiindia.com'+path,{signal:AbortSignal.timeout(40000)});
  assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());assert(bytes.length<=14*1024*1024);
  const metadata=await sharp(bytes).metadata();originals.set(path,{bytes:bytes.length,width:metadata.width,height:metadata.height});return bytes;
}});
const report=[];
for(const source of sources){
  await store.master(source);
  const derivatives=[];
  for(const width of [384,640,750,828,1080,1200]){
    for(const format of ['webp','jpeg']){
      const spec={source,width,format,quality:75};
      const {bytes}=await store.get(spec);const metadata=await sharp(bytes).metadata();
      assert(metadata.width<=width&&bytes.length<600000,'Bounded resized derivative required');
      derivatives.push({width,format,bytes:bytes.length});
    }
  }
  report.push({source,original:originals.get(source),derivatives});
}
await mkdir('evidence/collection-speed',{recursive:true});
await writeFile('evidence/collection-speed/seed.json',JSON.stringify({passed:true,photos:report.length,results:report},null,2));
console.log(JSON.stringify({passed:true,photos:report.length,sourceBytes:report.reduce((n,x)=>n+x.original.bytes,0),webp1080Bytes:report.reduce((n,x)=>n+x.derivatives.find(d=>d.width===1080&&d.format==='webp').bytes,0)}));
