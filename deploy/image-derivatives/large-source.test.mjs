import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createReadStream} from 'node:fs';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readStreamedPhotoForm} from '../../apps/web/lib/photo-upload-stream.mjs';
import {renderProductDerivatives} from '../../apps/web/lib/product-image-derivatives.mjs';
import {PERSISTENT_DERIVATIVE_WIDTHS} from '../collection-speed/images.mjs';

const sharp=createRequire(new URL('../../apps/web/package.json',import.meta.url))(process.env.HIDI_TEST_SHARP || 'sharp');
async function digest(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}

test('genuine encoded photo above the former 40 MiB limit streams, remains unchanged and produces every persisted size', {timeout:120000}, async t=>{
  const directory=await mkdtemp(join(tmpdir(),'hidi-persistent-large-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const width=5000,height=5000;let pixels=Buffer.alloc(width*height*3),state=1234567;
  for(let i=0;i<pixels.length;i++){state=(Math.imul(1664525,state)+1013904223)>>>0;pixels[i]=state>>>24;}
  const source=join(directory,'genuine-25mp.png');
  await sharp(pixels,{raw:{width,height,channels:3}}).png({compressionLevel:0}).toFile(source);pixels=null;
  const size=(await stat(source)).size;assert(size>40*1024*1024,'Fixture must exceed the former 40 MiB cap');
  const before=await digest(source),boundary='hidi-persistent-large';
  async function* body(){
    yield Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="genuine.png"\r\nContent-Type: image/png\r\n\r\n');
    for await(const part of createReadStream(source,{highWaterMark:65536}))yield part;
    yield Buffer.from('\r\n--'+boundary+'--\r\n');
  }
  const request=new Request('https://hidiindia.com/api/admin/inventory/v/images',{
    method:'POST',headers:{'content-type':'multipart/form-data; boundary='+boundary},
    body:Readable.toWeb(Readable.from(body())),duplex:'half',
  });
  const form=await readStreamedPhotoForm(request,{directory});
  try{
    const photo=form.get('file');assert(photo&&typeof photo!=='string');assert.equal(photo.size,size);assert.equal(photo.sha256,before);assert.equal(await digest(photo.path),before);
    const rendered=await renderProductDerivatives('products/variants/large/genuine.png',photo.path);
    assert.deepEqual(rendered.map(item=>item.width),[...PERSISTENT_DERIVATIVE_WIDTHS]);
    for(const item of rendered){
      const meta=await sharp(item.bytes).metadata();assert.equal(meta.format,'webp');assert.ok(meta.width<=item.width);assert.ok(item.bytes.length<10*1024*1024);
    }
    assert.equal(await digest(source),before,'Source photo changed during processing');
  }finally{await form.cleanup();}
});
