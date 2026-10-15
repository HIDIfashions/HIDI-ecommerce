import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {probe} from './probes.mjs';

const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME),priorRoot=resolve(root,'../base-app');
const read=async path=>{const r=await fetch('https://hidiindia.com'+path);assert(r.ok);return r.json();};
const catalogue=await read('/api/store/products');
assert(catalogue.length>0);
const collections=Object.fromEntries(await Promise.all(['casual-wear','work-wear','occasional-wear','ananyas-pick'].map(async slug=>[slug,await read('/api/store/products?category='+slug)])));
assert(Object.values(collections).every(rows=>rows.length>0&&rows.some(p=>p.variants.some(v=>v.available>0))));
const landing=await read('/api/hidi/landing-media-config'),writes=[];
await mkdir('evidence/india-seo',{recursive:true});
await writeFile('evidence/india-seo/inventory.json',JSON.stringify({passed:true,products:catalogue.length,collections:Object.fromEntries(Object.entries(collections).map(([slug,rows])=>[slug,rows.length])),readOnly:true},null,2));
const upstream=createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture'),path=url.pathname.replace(/^\/v1/,'');
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(!['GET','HEAD'].includes(req.method)){writes.push(path);return send(403,{message:'Read-only fixture'});}
  if(path.includes('/health'))return send(200,{status:'ok'});
  if(path.startsWith('/carts/'))return send(200,{items:[],itemCount:0,subtotalPaise:0,shippingPaise:0,totalPaise:0});
  if(path.includes('/reviews'))return send(200,{averageRating:0,reviewCount:0,verifiedReviewCount:0,reviews:[],ratingDistribution:{1:0,2:0,3:0,4:0,5:0}});
  if(/^\/products(?:\/(featured|best-sellers))?$/.test(path))return send(200,collections[url.searchParams.get('category')]||catalogue);
  if(path.startsWith('/products/')){
    if(path.endsWith('/related'))return send(200,catalogue.slice(0,4));
    const p=catalogue.find(p=>p.slug===decodeURIComponent(path.split('/')[2]));return send(p?200:404,p||{});
  }
  return send(401,{message:'Authentication required'});
});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
const api='http://127.0.0.1:'+upstream.address().port+'/v1',children=[];
let logs='';
async function freePort(){
  const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));
  const port=reserve.address().port;await new Promise(done=>reserve.close(done));
  return port;
}
function launch(directory,file,env){
  const child=spawn(process.execPath,[join(directory,file)],{cwd:directory,env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',API_URL:api,INTERNAL_API_URL:api,...env},stdio:['ignore','pipe','pipe']});
  children.push(child);child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
  return child;
}
async function ready(child,port){
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<120;i++){
    try{if((await fetch(base+'/collections/all')).ok)return base;}catch{}
    assert.equal(child.exitCode,null,'Runtime exited: '+logs.slice(-1500));
    await new Promise(done=>setTimeout(done,250));
  }
  throw Error('Runtime not ready: '+logs.slice(-1500));
}
async function start(directory){
  // Each exact runtime needs its own Next server; the wrapper otherwise uses 3001.
  const storefrontPort=await freePort();
  const storefront=launch(directory,'apps/web/server.js',{PORT:String(storefrontPort)});
  const origin=await ready(storefront,storefrontPort);
  const port=await freePort();
  return ready(launch(directory,'server.mjs',{PORT:String(port),STOREFRONT_ORIGIN:origin}),port);
}
try{
  const baseline=await start(priorRoot),base=await start(root);
  await probe(base,'evidence/india-seo/candidate',{baseline,landing});
  assert.deepEqual(writes,[]);
}catch(error){console.error(logs.slice(-2000));throw error;}
finally{
  for(const child of children)child.kill('SIGTERM');
  upstream.closeAllConnections();await new Promise(done=>upstream.close(done));
  for(const child of children)await new Promise(done=>{if(child.exitCode!==null)return done();child.once('exit',done);setTimeout(()=>{child.kill('SIGKILL');done();},5000).unref();});
}
