import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {probe} from './probe.mjs';
import {loadProducts} from './feed.mjs';
import {resolve} from 'node:path';
const images=JSON.parse(await readFile('evidence/merchant-feed/web-preservation.json','utf8'));
const products=await loadProducts('https://hidiindia.com/api/store/products'),catalogue=products,writes=[],reads=[];
await mkdir('evidence/merchant-feed',{recursive:true});
await writeFile('evidence/merchant-feed/frozen-catalogue.json',JSON.stringify(products));
const upstream=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture'),path=url.pathname.replace(/^\/v1/,'');
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(!['GET','HEAD'].includes(req.method)){writes.push(path);return send(403,{message:'Read-only fixture'});}
  reads.push({path,category:url.searchParams.get('category')});
  if(path.startsWith('/media/products/')) {
    const r=await fetch('https://hidiindia.com'+path);res.writeHead(r.status,Object.fromEntries([...r.headers].filter(([k])=>!['content-encoding','content-length','transfer-encoding','connection'].includes(k))));return res.end(Buffer.from(await r.arrayBuffer()));
  }
  if(path.includes('/health'))return send(200,{status:'ok'});
  if(path.startsWith('/carts/'))return send(200,{items:[],itemCount:0,subtotalPaise:0,shippingPaise:0,totalPaise:0});
  if(path.includes('/reviews'))return send(200,{averageRating:0,reviewCount:0,verifiedReviewCount:0,reviews:[],ratingDistribution:{1:0,2:0,3:0,4:0,5:0}});
  if(/^\/products(?:\/(featured|best-sellers))?$/.test(path))return send(200,catalogue);
  if(path.startsWith('/products/')){
    if(path.endsWith('/related'))return send(200,catalogue.slice(0,4));
    const p=products.find(p=>p.slug===decodeURIComponent(path.split('/')[2]));return send(p?200:404,p||{});
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
  const port=await freePort(),name='hidi-merchant-feed-'+process.pid+'-'+containers.length;
  docker('run','--detach','--name',name,'--add-host','host.docker.internal:host-gateway','--mount','type=bind,src='+resolve('deploy/merchant-feed')+',dst=/hidi-merchant-fixtures,readonly','-p',`127.0.0.1:${port}:3000`,'-e','PORT=3000','-e','NODE_OPTIONS=--import=/hidi-merchant-fixtures/media-preload.mjs','-e','API_URL='+api,'-e','INTERNAL_API_URL='+api,image);
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
  assert.equal((await fetch(baseline+'/google-products.xml',{headers:{'X-Forwarded-Host':'hidiindia.com'}})).status,404);
  const pw=await import(process.env.HIDI_PLAYWRIGHT_MODULE),browser=await pw.chromium.launch({headless:true});
  const baselineErrors=[];
  try {
    const context=await browser.newContext({extraHTTPHeaders:{'X-Forwarded-Host':'hidiindia.com','X-Forwarded-Proto':'https'}});
    await context.route('**/*',route=>!['GET','HEAD'].includes(route.request().method())?route.abort():route.continue());
    const page=await context.newPage();page.on('pageerror',e=>baselineErrors.push(e.message));
    await page.goto(baseline+'/products/'+products[0].slug,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('[data-hidi-react-pdp]')?.dataset.hidiHydrated==='true');
    await page.waitForTimeout(500);await context.close();
  } finally {await browser.close();}
  await writeFile('evidence/merchant-feed/baseline-hydration.json',JSON.stringify({errors:baselineErrors,merchantHelperInstalled:false},null,2));
  await probe(base,'evidence/merchant-feed/candidate',{products,preview:true});
  assert.deepEqual(writes,[]);
  assert(reads.some(r=>r.path==='/products'),'Runtime did not reach frozen inventory fixture');
}catch(error){for(const name of containers)console.error(name+'\n'+docker('logs',name).slice(-3000));console.error('FIXTURE_READS',JSON.stringify({total:reads.length,categories:[...new Set(reads.filter(r=>r.path==='/products').map(r=>r.category))]}));throw error;}
finally{
  for(const name of containers)docker('rm','--force',name);
  upstream.closeAllConnections();await new Promise(done=>upstream.close(done));
}
