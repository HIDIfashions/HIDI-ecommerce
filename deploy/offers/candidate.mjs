import assert from 'node:assert/strict';import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {probe} from './probes.mjs';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME);let state=null,etag=null,offerWrites=0;const unexpectedWrites=[],reads=[];
const products=Array.from({length:3},(_,i)=>({id:'offer-fixture-'+i,slug:'offer-fixture-'+i,name:'Offer fixture style '+i,status:'ACTIVE',description:'Fixture cotton. Includes: Kurta',shortDescription:'Fixture',fabric:'Cotton',care:'Fixture',collections:[],category:{id:'casual',slug:'casual-wear',name:'Casual Wear'},images:[],minPricePaise:100000,maxPricePaise:100000,inStock:true,variants:['M','L'].map(size=>({id:'offer-variant-'+i+size,sku:'OFFER-'+i+size,size,color:'Ivory',available:4,pricePaise:100000,mrpPaise:140000}))}));
const upstream=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture'),path=url.pathname.replace(/^\/v1/,'');const send=(status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(req.method==='HEAD'?undefined:JSON.stringify(value));};
  if(path==='/identity')return send(200,{access_token:'isolated-managed-token',expires_in:3600});
  if(path.startsWith('/private-blob/')){
    if(url.searchParams.get('restype')==='container')return send(200,{});
    if(path!=='/private-blob/hidi-private-offers/state.json')return send(404,{});
    if(req.method==='GET')return state?send(200,state,{ETag:etag}):send(404,{});
    if(req.method==='PUT'){if(state?req.headers['if-match']!==etag:req.headers['if-none-match']!=='*')return send(412,{});let text='';for await(const chunk of req)text+=chunk;state=JSON.parse(text);etag='"offer-'+(++offerWrites)+'"';return send(201,{},{ETag:etag});}
  }
  if(!['GET','HEAD'].includes(req.method)){unexpectedWrites.push(path);return send(403,{message:'Read-only fixture'});}
  if(path==='/admin/me'){
    const token=req.headers.authorization;if(!['Bearer owner','Bearer staff'].includes(token))return send(401,{message:'Staff sign-in required'});
    return send(200,{admin:{id:'fixture-owner',displayName:'Fixture Owner',role:token==='Bearer owner'?'OWNER':'STAFF',permissions:['*']}});
  }
  if(path==='/auth/offers-identity'){
    if(req.headers.authorization==='Bearer selected')return send(200,{phoneVerified:true,phone:'+919000000001'});
    if(req.headers.authorization==='Bearer other')return send(200,{phoneVerified:true,phone:'+919000000002'});
    if(req.headers.authorization==='Bearer unverified')return send(200,{phoneVerified:false,phone:'+919000000001'});
    return send(401,{message:'Expired or invalid session'});
  }
  if(path.includes('/health'))return send(200,{status:'ok'});
  if(path.startsWith('/carts/'))return send(200,{items:[],itemCount:0,subtotalPaise:0,totalPaise:0});
  if(path.includes('/reviews'))return send(200,{averageRating:0,reviewCount:0,verifiedReviewCount:0,reviews:[],ratingDistribution:{1:0,2:0,3:0,4:0,5:0}});
  if(/^\/products(?:\/(featured|best-sellers))?$/.test(path)){reads.push(path);return send(200,products);}
  if(path.startsWith('/products/')){if(path.endsWith('/related'))return send(200,products.slice(1));const product=products.find(p=>p.slug===decodeURIComponent(path.split('/')[2]));return send(product?200:404,product||{});}
  return send(401,{message:'Authentication required'});
});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const fixture='http://127.0.0.1:'+upstream.address().port;
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
let logs='';const runtime=spawn(process.execPath,['--import',pathToFileURL(new URL('./fixture-preload.mjs',import.meta.url).pathname).href,join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),API_URL:fixture+'/v1',INTERNAL_API_URL:fixture+'/v1',AZURE_STORAGE_ACCOUNT:'offerstestfixture',IDENTITY_ENDPOINT:fixture+'/identity',IDENTITY_HEADER:'isolated-fixture',HIDI_OFFERS_FIXTURE:fixture},stdio:['ignore','pipe','pipe']});runtime.stdout.on('data',d=>logs+=d);runtime.stderr.on('data',d=>logs+=d);
const base='http://127.0.0.1:'+port;
try{let ready=false;for(let i=0;i<100;i++){if(runtime.exitCode!==null)throw Error(logs.slice(-3000));try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(ready);
  await probe(base,'evidence/offers/candidate',{offerWrites:()=>offerWrites});assert.deepEqual(unexpectedWrites,[]);
  const purchase=await import('../purchase-actions/probes.mjs');await purchase.probe(base,'evidence/offers/purchase-regression');assert(reads.length>0);assert.deepEqual(unexpectedWrites,[]);
}catch(error){console.error(logs.slice(-3000));throw error;}finally{runtime.kill('SIGTERM');await new Promise(r=>{if(runtime.exitCode!==null)return r();runtime.once('exit',r);setTimeout(()=>{runtime.kill('SIGKILL');r();},5000).unref();});upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
