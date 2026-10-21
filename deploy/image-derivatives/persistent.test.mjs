import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  PERSISTENT_DERIVATIVE_WIDTHS,
  persistentDerivativeBlobKey,
  persistentDerivativeMediaPath,
  createProductImageHandler,
} from '../collection-speed/images.mjs';
import {renderProductDerivatives} from '../../apps/web/lib/product-image-derivatives.mjs';
import {persistProductDerivatives} from '../../apps/web/lib/product-image-derivative-store.mjs';

const require=createRequire(import.meta.url);
const sharp=require(process.env.HIDI_TEST_SHARP || 'sharp');

async function temp(t,prefix='hidi-derivatives-'){
  const dir=await mkdtemp(join(tmpdir(),prefix));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return dir;
}
async function fixture(){
  return sharp({create:{width:1200,height:1800,channels:3,background:{r:147,g:127,b:108}}}).jpeg({quality:90}).toBuffer();
}
function optimizerUrl(width=640){
  const source='/media/products/_display_v2/variants/sku-a/photo.jpg?hidi_image=3';
  return '/_next/image?url='+encodeURIComponent(source)+'&w='+width+'&q=75';
}
function reply(){
  return {
    status:0,headers:{},body:undefined,
    writeHead(status,headers){this.status=status;this.headers={...headers};},
    end(body){this.body=body;},
  };
}

test('persistent derivative paths are deterministic and reject recursion',()=>{
  const key='products/variants/sku-a/photo.jpg';
  assert.equal(
    persistentDerivativeBlobKey(key,640,'webp'),
    'products/_derivatives/v1/variants/sku-a/photo/640.webp',
  );
  assert.equal(
    persistentDerivativeMediaPath('/media/products/_display_v2/variants/sku-a/photo.jpg?hidi_image=3',640,'webp'),
    '/media/products/_derivatives/v1/variants/sku-a/photo/640.webp',
  );
  assert.equal(persistentDerivativeBlobKey(key,2048,'webp'),null);
  assert.equal(persistentDerivativeBlobKey('products/_derivatives/v1/x/640.webp',640,'webp'),null);
  assert.equal(persistentDerivativeBlobKey('../products/variants/x/a.jpg',640,'webp'),null);
});

test('rendering produces every common storefront WebP without changing the original',async t=>{
  const dir=await temp(t),source=join(dir,'original.jpg'),bytes=await fixture();
  await writeFile(source,bytes);
  const rendered=await renderProductDerivatives('products/variants/sku-a/photo.jpg',source);
  assert.deepEqual(rendered.map(x=>x.width),[...PERSISTENT_DERIVATIVE_WIDTHS]);
  for(const item of rendered){
    assert.match(item.key,new RegExp('/'+item.width+'\\.webp$'));
    assert.equal(item.contentType,'image/webp');
    const meta=await sharp(item.bytes).metadata();
    assert.equal(meta.format,'webp');
    assert.ok(meta.width<=item.width);
    assert.ok(meta.height<=Math.min(item.width*2,5760));
    assert.ok(item.bytes.length<10*1024*1024);
  }
});

function fakeContainer(){
  const saved=new Map();
  return {
    saved,
    getBlockBlobClient(key){
      return {
        async uploadData(bytes,options){
          if(saved.has(key)) throw {statusCode:412};
          saved.set(key,{bytes:Buffer.from(bytes),contentType:options.blobHTTPHeaders.blobContentType,metadata:options.metadata});
        },
        async getProperties(){
          const value=saved.get(key);
          if(!value) throw {statusCode:404};
          return {contentLength:value.bytes.length,contentType:value.contentType,metadata:value.metadata};
        },
      };
    },
  };
}

test('Azure derivative persistence is immutable, idempotent, and source-hash checked',async()=>{
  const container=fakeContainer();
  const photo={path:'/tmp/not-used',sha256:'a'.repeat(64)};
  const render=async()=>[
    {key:'products/_derivatives/v1/variants/a/photo/384.webp',width:384,contentType:'image/webp',bytes:Buffer.from('one')},
    {key:'products/_derivatives/v1/variants/a/photo/640.webp',width:640,contentType:'image/webp',bytes:Buffer.from('two')},
  ];
  const first=await persistProductDerivatives(container,'products/variants/a/photo.jpg',photo,{render});
  const second=await persistProductDerivatives(container,'products/variants/a/photo.jpg',photo,{render});
  assert.deepEqual(second,first);
  assert.equal(container.saved.size,2);
  for(const saved of container.saved.values()){
    assert.equal(saved.metadata.hidi_source_sha256,'a'.repeat(64));
    assert.equal(saved.metadata.hidi_derivative_version,'v1');
  }
  await assert.rejects(
    ()=>persistProductDerivatives(container,'products/variants/a/photo.jpg',{...photo,sha256:'b'.repeat(64)},{render}),
    /differs from this source photo/,
  );
});

test('runtime image handler serves a persisted derivative before touching the original',async t=>{
  const dir=await temp(t),webp=await sharp(await fixture()).resize(640).webp({quality:75}).toBuffer();
  let originals=0,derivatives=0;
  const handler=createProductImageHandler({
    origin:'https://hidiindia.com',
    runtimeRoot:dir,
    sharp,
    cacheDir:join(dir,'cache'),
    seedDir:join(dir,'seed'),
    fetchDerivative:async path=>{
      derivatives++;
      assert.equal(path,'/media/products/_derivatives/v1/variants/sku-a/photo/640.webp');
      return webp;
    },
    fetchSource:async()=>{originals++;return await fixture();},
  });
  const response=reply();
  assert.equal(await handler.handle({method:'GET',url:optimizerUrl(),headers:{accept:'image/webp'}},response,'/_next/image'),true);
  assert.equal(response.status,200);
  assert.equal(response.headers['X-Hidi-Image-Cache'],'PERSISTED');
  assert.equal(derivatives,1);
  assert.equal(originals,0);
});

test('runtime image handler falls back to existing Sharp path when derivative is absent',async t=>{
  const dir=await temp(t);let originals=0;
  const source=await fixture();
  const handler=createProductImageHandler({
    origin:'https://hidiindia.com',
    runtimeRoot:dir,
    sharp,
    cacheDir:join(dir,'cache'),
    seedDir:join(dir,'seed'),
    fetchDerivative:async()=>null,
    fetchSource:async()=>{originals++;return source;},
  });
  const response=reply();
  await handler.handle({method:'GET',url:optimizerUrl(),headers:{accept:'image/webp'}},response,'/_next/image');
  assert.equal(response.status,200);
  assert.equal(response.headers['X-Hidi-Image-Cache'],'MISS');
  assert.equal(originals,1);
  assert.equal((await sharp(response.body).metadata()).format,'webp');
});
