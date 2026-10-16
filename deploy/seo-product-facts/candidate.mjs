import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {probe} from './probes.mjs';
import {verifyFacts} from './parity.mjs';
import {resolve} from 'node:path';

const images=JSON.parse(await readFile('evidence/seo-product-facts/web-preservation.json','utf8'));
const read=async path=>{const r=await fetch('https://hidiindia.com'+path);assert(r.ok);return r.json();};
const {loadProducts}=await import('../merchant-feed/feed.mjs');
const catalogueSummary=await read('/api/store/products');
const catalogue=await loadProducts('https://hidiindia.com/api/store/products');
assert(catalogue.length>0);
const collections=Object.fromEntries(await Promise.all(['casual-wear','work-wear','occasional-wear','ananyas-pick'].map(async slug=>[slug,await read('/api/store/products?category='+slug)])));
assert(Object.values(collections).every(rows=>rows.length>0&&rows.some(p=>p.variants.some(v=>v.available>0))));
const landing=await read('/api/hidi/landing-media-config'),writes=[],reads=[];
await mkdir('evidence/seo-product-facts',{recursive:true});
await writeFile('evidence/seo-product-facts/inventory.json',JSON.stringify({passed:true,products:catalogue.length,collections:Object.fromEntries(Object.entries(collections).map(([slug,rows])=>[slug,rows.length])),readOnly:true},null,2));
const upstream=createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture'),path=url.pathname.replace(/^\/v1/,'');
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(!['GET','HEAD'].includes(req.method)){writes.push(path);return send(403,{message:'Read-only fixture'});}
  reads.push({path,category:url.searchParams.get('category')});
  if(path.includes('/health'))return send(200,{status:'ok'});
  if(path.startsWith('/carts/'))return send(200,{items:[],itemCount:0,subtotalPaise:0,shippingPaise:0,totalPaise:0});
  if(path.includes('/reviews'))return send(200,{averageRating:0,reviewCount:0,verifiedReviewCount:0,reviews:[],ratingDistribution:{1:0,2:0,3:0,4:0,5:0}});
  if(/^\/products(?:\/(featured|best-sellers))?$/.test(path))return send(200,collections[url.searchParams.get('category')]||catalogueSummary);
  if(path.startsWith('/products/')){
    if(path.endsWith('/related'))return send(200,catalogue.slice(0,4));
    const p=catalogue.find(p=>p.slug===decodeURIComponent(path.split('/')[2]));return send(p?200:404,p||{});
  }
  return send(401,{message:'Authentication required'});
});
await new Promise(done=>upstream.listen(0,'0.0.0.0',done));
const api='http://host.docker.internal:'+upstream.address().port+'/v1',containers=[];
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8'});
async function freePort(){
  const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));
  const port=reserve.address().port;await new Promise(done=>reserve.close(done));
  return port;
}
async function start(image){
  const port=await freePort(),name='hidi-seo-product-facts-'+process.pid+'-'+containers.length;
  docker('run','--detach','--name',name,'--add-host','host.docker.internal:host-gateway','--mount','type=bind,src='+resolve('deploy/merchant-feed')+',dst=/merchant-feed,readonly','--mount','type=bind,src='+resolve('deploy/seo-product-facts')+',dst=/hidi-product-facts-fixtures,readonly','-e','NODE_OPTIONS=--import=/hidi-product-facts-fixtures/media-preload.mjs','-p',`127.0.0.1:${port}:3000`,'-e','PORT=3000','-e','API_URL='+api,'-e','INTERNAL_API_URL='+api,image);
  containers.push(name);
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<120;i++){
    try{if((await fetch(base+'/collections/all')).ok)return base;}catch{}
    assert.equal(docker('inspect','--format','{{.State.Running}}',name).trim(),'true','Runtime exited: '+docker('logs',name).slice(-1500));
    await new Promise(done=>setTimeout(done,250));
  }
  throw Error('Runtime not ready: '+docker('logs',name).slice(-1500));
}
try{
  // Separate containers preserve the exact image entrypoint and environment,
  // while isolating each runtime's internal storefront port.
  const baseline=await start(images.baseImage),base=await start(images.candidateTag);
  const headers={'X-Forwarded-Host':'hidiindia.com','X-Forwarded-Proto':'https'};
  const original=await (await fetch(baseline+'/google-products.xml',{headers})).text();
  const updated=await (await fetch(base+'/google-products.xml',{headers})).text();
  assert.equal(updated,original,'Merchant feed changed');
  for(const slug of ['all','casual-wear','work-wear','occasional-wear']) {const raw=await (await fetch(base+'/collections/'+slug,{headers})).text();assert(raw.includes('<h1'));assert(raw.includes('/products/'));}
  await verifyFacts(resolve(process.env.HIDI_CANDIDATE_RUNTIME,'../base-app'),resolve(process.env.HIDI_CANDIDATE_RUNTIME),catalogue,'evidence/seo-product-facts/facts-parity.json');
  await probe(base,'evidence/seo-product-facts/candidate',{baseline,landing,inventory:{all:catalogue,...collections}});
  assert.deepEqual(writes,[]);
  assert(reads.some(r=>r.path==='/products'),'Runtime did not reach frozen inventory fixture');
}catch(error){for(const name of containers)console.error(name+'\n'+docker('logs',name).slice(-3000));console.error('FIXTURE_READS',JSON.stringify({total:reads.length,categories:[...new Set(reads.filter(r=>r.path==='/products').map(r=>r.category))]}));throw error;}
finally{
  for(const name of containers)docker('rm','--force',name);
  upstream.closeAllConnections();await new Promise(done=>upstream.close(done));
}
