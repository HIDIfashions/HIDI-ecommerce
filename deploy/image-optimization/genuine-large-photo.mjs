/** Real encoded large photo stress fixture, separate from padded byte-boundary tests. */
import {createRequire} from 'node:module';
const sharp=createRequire(new URL('../../apps/web/package.json',import.meta.url))('sharp');
import {mkdtemp,stat,rm,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readStreamedPhotoForm} from '../../apps/web/lib/photo-upload-stream.mjs';
import {resizedImage} from '../collection-speed/images.mjs';
const directory=await mkdtemp(join(tmpdir(),'hidi-real-large-'));
async function hash(path){const h=createHash('sha256');for await(const part of createReadStream(path))h.update(part);return h.digest('hex');}
let form;
try{
 const width=6000,height=6000;let pixels=Buffer.alloc(width*height*3),state=1234567;
 for(let i=0;i<pixels.length;i++){state=(Math.imul(1664525,state)+1013904223)>>>0;pixels[i]=state>>>24;}
 const path=join(directory,'genuine-noise-36mp.png');await sharp(pixels,{raw:{width,height,channels:3}}).png({compressionLevel:0}).toFile(path);pixels=null;
 const size=(await stat(path)).size,before=await hash(path);assert.ok(size>100*1024*1024);
 const boundary='hidi-genuine-photo';
 async function* body(){yield Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="genuine.png"\r\nContent-Type: image/png\r\n\r\n');for await(const part of createReadStream(path,{highWaterMark:65536}))yield part;yield Buffer.from('\r\n--'+boundary+'--\r\n');}
 form=await readStreamedPhotoForm(new Request('https://hidiindia.com/upload',{method:'POST',headers:{'content-type':'multipart/form-data; boundary='+boundary},body:Readable.toWeb(Readable.from(body())),duplex:'half'}),{directory});
 const uploaded=form.get('file');assert.equal(uploaded.size,size);assert.equal(uploaded.sha256,before);assert.equal(await hash(uploaded.path),before);
 const outputs=[];for(const requestedWidth of [384,640,1080,1920,3840]){const result=await resizedImage(sharp,uploaded.path,requestedWidth,'webp',75),meta=await sharp(result).metadata();assert.ok(meta.width<=requestedWidth);assert.equal(meta.format,'webp');outputs.push({requestedWidth,width:meta.width,height:meta.height,bytes:result.length,format:meta.format});}
 const report={passed:true,synthetic:true,padded:false,input:{bytes:size,width,height,format:'png'},multipartParserPassed:true,sha256Before:before,originalUnchanged:await hash(path)===before,outputs,scope:'Real 36 MP encoded random PNG; streamed ingestion and decode, not real garment photography or live Azure delivery'};
 console.log(JSON.stringify(report,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2));
}finally{await form?.cleanup();await rm(directory,{recursive:true,force:true});}
