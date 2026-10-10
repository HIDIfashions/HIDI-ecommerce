/** Display-sized product images. Originals and all commerce routes remain untouched. */
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,rename,readdir,stat,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

export const IMAGE_VERSION='2';
const WIDTHS=new Set([16,32,48,64,96,128,256,384,640,750,828,1080,1200,1920,2048,3840]);
const HOSTS=new Set(['thehidi.com','www.thehidi.com','hidiindia.com','www.hidiindia.com','thidigk.thehidi.com','azure-preview.thehidi.com']);
const SOURCE_LIMIT=14*1024*1024;
const MASTER_WIDTH=1920;
const ROOT=dirname(fileURLToPath(import.meta.url));

export function mediaPath(value) {
  if(typeof value!=='string'||value.length>2000)return null;
  let url;
  try{url=new URL(value,'https://hidiindia.com');}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||!HOSTS.has(url.hostname)||url.port||url.hash)return null;
  if(!/^\/media\/products\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(url.pathname))return null;
  if([...url.searchParams.keys()].some(key=>key!=='hidi_image'))return null;
  return url.pathname;
}
export function imageRequest(url,accept='') {
  if(url.pathname!=='/_next/image')return null;
  const source=mediaPath(url.searchParams.get('url'));
  if(!source)return null;
  if(['url','w','q'].some(key=>url.searchParams.getAll(key).length!==1))return {error:400};
  if(!/^\d+$/.test(url.searchParams.get('w')||'')||!WIDTHS.has(Number(url.searchParams.get('w')))||url.searchParams.get('q')!=='75')return {error:400};
  const webp=accept.split(',').some(value=>/^image\/webp(?:;|$)/i.test(value.trim())&&!/;\s*q=0(?:\.0*)?\s*$/.test(value));
  return {source,width:Number(url.searchParams.get('w')),format:webp?'webp':'jpeg',quality:75};
}
function hash(value){return createHash('sha256').update(value).digest('hex');}
export function derivativeKey({source,width,format,quality=75}){return hash([IMAGE_VERSION,source,width,format,quality].join('|'))+'.'+format;}
export function masterKey(source){return hash(IMAGE_VERSION+'|'+source)+'.jpg';}
async function atomic(file,bytes){await mkdir(dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.'+Math.random().toString(16).slice(2);await writeFile(temp,bytes);await rename(temp,file);}
async function existing(file){try{return await readFile(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function boundedBody(response){
  if(!response.ok)throw new Error('Product media unavailable');
  if(Number(response.headers.get('content-length'))>SOURCE_LIMIT)throw new Error('Product media exceeds upload limit');
  const reader=response.body.getReader(),parts=[];let count=0;
  try{for(;;){const{value,done}=await reader.read();if(done)break;count+=value.length;if(count>SOURCE_LIMIT)throw new Error('Product media exceeds upload limit');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(parts,count);
}

/** Each full photo is decoded once; smaller derivatives reuse the bounded master. */
export function createImageStore({sharp,fetchSource,cacheDir=join(tmpdir(),'hidi-product-images-v2'),seedDir=join(ROOT,'seed')}) {
  const jobs=new Map();let tail=Promise.resolve();let pending=0;
  let writes=0;
  async function save(key,bytes){
    await atomic(join(cacheDir,key),bytes);
    if(++writes%25)return;
    const entries=await Promise.all((await readdir(cacheDir)).filter(name=>/^[a-f0-9]{64}\.(?:jpg|jpeg|webp)$/.test(name)).map(async name=>({name,...await stat(join(cacheDir,name))})));
    let total=entries.reduce((n,file)=>n+file.size,0);
    for(const file of entries.sort((a,b)=>a.mtimeMs-b.mtimeMs)){
      if(total<=256*1024*1024)break;
      await unlink(join(cacheDir,file.name)).catch(()=>{});total-=file.size;
    }
  }
  function single(key,work){
    if(jobs.has(key))return jobs.get(key);
    if(pending>=40)return Promise.reject(new Error('Image queue busy'));
    pending++;
    const task=tail.catch(()=>{}).then(work);
    tail=task.catch(()=>{});
    jobs.set(key,task);
    task.finally(()=>{jobs.delete(key);pending--;}).catch(()=>{});
    return task;
  }
  async function master(source){
    const key=masterKey(source),cached=await existing(join(seedDir,key))||await existing(join(cacheDir,key));
    if(cached)return cached;
    return single('master:'+source,async()=>{
      const prior=await existing(join(cacheDir,key));if(prior)return prior;
      const original=await fetchSource(source);
      const bytes=await sharp(original,{limitInputPixels:100000000,sequentialRead:true}).rotate().resize({width:MASTER_WIDTH,withoutEnlargement:true}).jpeg({quality:88}).timeout({seconds:30}).toBuffer();
      await save(key,bytes);return bytes;
    });
  }
  async function get(spec){
    const key=derivativeKey(spec),cached=await existing(join(seedDir,key))||await existing(join(cacheDir,key));
    if(cached)return {bytes:cached,cache:'HIT'};
    // Acquire the master before joining the derivative queue to avoid nested waits.
    const input=spec.width<=MASTER_WIDTH?await master(spec.source):await fetchSource(spec.source);
    const bytes=await single(key,async()=>{
      const prior=await existing(join(cacheDir,key));if(prior)return prior;
      const pipeline=sharp(input,{limitInputPixels:100000000,sequentialRead:true}).rotate().resize({width:spec.width,withoutEnlargement:true}).timeout({seconds:30});
      const output=await (spec.format==='webp'?pipeline.webp({quality:spec.quality,effort:2}):pipeline.jpeg({quality:spec.quality})).toBuffer();
      // A processing failure is an error, never a multi-megabyte original thumbnail.
      const metadata=await sharp(output).metadata();
      if(!metadata.width||metadata.width>spec.width)throw new Error('Image resizing failed');
      await save(key,output);return output;
    });
    return {bytes,cache:'MISS'};
  }
  return {get,master};
}

export function createProductImageHandler({origin,runtimeRoot=resolve(ROOT,'..'),sharp:providedSharp,fetchSource:providedFetch,cacheDir,seedDir}) {
  const require=createRequire(join(runtimeRoot,'apps/web/server.js'));
  const sharp=providedSharp||require('next/dist/server/image-optimizer.js').getSharp(1,false);
  const fetchSource=providedFetch||(async source=>boundedBody(await fetch(new URL(source,origin),{signal:AbortSignal.timeout(30000)})));
  const store=createImageStore({sharp,fetchSource,cacheDir,seedDir});
  async function handle(request,response,pathname){
    if(pathname!=='/_next/image')return false;
    const spec=imageRequest(new URL(request.url,'https://hidiindia.com'),request.headers.accept||'');
    if(!spec)return false;
    if(!['GET','HEAD'].includes(request.method)||spec.error){response.writeHead(spec.error||405,{'Cache-Control':'no-store'});response.end();return true;}
    const start=performance.now();
    try{
      const{bytes,cache}=await store.get(spec);const etag='"'+hash(bytes)+'"';
      const headers={'Content-Type':'image/'+spec.format,'Content-Length':bytes.length,'Cache-Control':'public, max-age=31536000, immutable','Vary':'Accept','ETag':etag,'X-Content-Type-Options':'nosniff','X-Hidi-Image-Cache':cache,'Server-Timing':'product-image;dur='+(performance.now()-start).toFixed(1)};
      if(request.headers['if-none-match']===etag){delete headers['Content-Length'];response.writeHead(304,headers);response.end();}
      else{response.writeHead(200,headers);response.end(request.method==='HEAD'?undefined:bytes);}
    }catch{response.writeHead(503,{'Cache-Control':'no-store','Retry-After':'5'});response.end();}
    return true;
  }
  const prepared=new Set();let timer;
  async function warm(){
    try{
      const response=await fetch(new URL('/api/store/products',origin),{signal:AbortSignal.timeout(15000)});
      if(!response.ok)return;
      const products=await response.json();if(!Array.isArray(products))return;
      const paths=new Set();
      for(const product of products.slice(0,200))for(const image of [...(product.images||[]),...(product.variants||[]).flatMap(v=>v.images||[])]){const path=mediaPath(image.url);if(path)paths.add(path);}
      for(const source of [...paths].slice(0,400)){
        if(prepared.has(source))continue;
        try{for(const width of [384,640,750,828,1080,1200])await store.get({source,width,format:'webp',quality:75});prepared.add(source);}catch{}
      }
    }catch{}
    finally{timer=setTimeout(warm,30000);timer.unref();}
  }
  function startWarm(){if(!timer){timer=setTimeout(warm,2500);timer.unref();}}
  return {handle,store,startWarm};
}
