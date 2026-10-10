import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {probe,categories} from './browser-probes.mjs';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME),apiRoot=resolve(process.env.HIDI_CANDIDATE_API);
const {ProductsService}=await import(pathToFileURL(join(apiRoot,'apps/api/dist/products/products.service.js')).href);
function matches(row,where){return Object.entries(where).every(([key,value])=>{
 if(key==='OR')return value.some(part=>matches(row,part));if(key==='AND')return value.every(part=>matches(row,part));
 if(value&&typeof value==='object'){
  if('in' in value)return value.in.includes(row?.[key]);if('is' in value)return row?.[key]!=null&&matches(row[key],value.is);
  if('some' in value)return Array.isArray(row?.[key])&&row[key].some(part=>matches(part,value.some));return matches(row?.[key],value);
 }return row?.[key]===value;
});}
function product(id,category,picked=false,legacy=false,status='ACTIVE'){
 const tags=[...(picked?['ananyas-pick']:[]),...(legacy?[{'casual-wear':'everyday','work-wear':'work-edit','occasional-wear':'occasion'}[category]]:[])];
 return {id,slug:id,name:'Category fixture '+id,status,featuredRank:1,createdAt:new Date(0),fabric:'Cotton',description:'Fixture kurta and dupatta.',care:'Fixture care',category:{id:'cat-'+category,slug:category,name:category,active:true},
 collections:tags.map(slug=>({collection:{id:'col-'+slug,slug,name:slug,active:true},position:0})),
 images:[],variants:['M','L','XL'].map(size=>({id:id+'-'+size,sku:'FIXTURE-'+id+'-'+size,size,color:'Cream',active:true,pricePaise:109500,mrpPaise:149900,inventory:{onHand:10,reserved:0,safetyStock:0},images:[]}))};
}
const rows=categories.slice(0,3).flatMap(([slug])=>[product('picked-'+slug,slug,true),product('plain-'+slug,slug),product('legacy-'+slug,'legacy-category',false,false)]);
for(let index=0;index<3;index++)rows[index*3+2].collections=[{collection:{id:'legacy-'+index,slug:['everyday','work-edit','occasion'][index],name:'Legacy',active:true},position:0}];
rows.push(product('draft-picked','casual-wear',true,false,'DRAFT'));
const db={product:{findMany:async query=>structuredClone(rows.filter(row=>matches(row,query.where)))},productReview:{groupBy:async()=>[]}};
const service=new ProductsService(db);let requests=0,writes=0;
for(const [slug] of categories){const values=await service.listPublished(slug);assert.equal(values.length,3);if(slug==='ananyas-pick')assert(values.every(value=>value.id.startsWith('picked-')));}
assert.equal((await service.listPublished('unknown-category')).length,0);
const upstream=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');const path=url.pathname.replace(/^\/v1/,'');
 const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
 if(!['GET','HEAD'].includes(req.method)){writes++;return send(401,{message:'Read-only fixture'});}
 if(/^\/products(?:\/(featured|best-sellers))?$/.test(path)){requests++;return send(200,await service.listPublished(url.searchParams.get('category')||undefined));}
 if(path.startsWith('/products/')){
  if(path.endsWith('/related'))return send(200,await service.listPublished());
  const all=await service.listPublished();const result=all.find(p=>p.slug===decodeURIComponent(path.split('/')[2]));return send(result?200:404,result||{});
 }
 if(path.includes('/reviews'))return send(200,{averageRating:0,reviewCount:0,verifiedReviewCount:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0},reviews:[]});
 if(path.includes('/health'))return send(200,{status:'ok'});return send(401,{message:'Admin sign-in required'});
});await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const processRuntime=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),API_URL:`http://127.0.0.1:${upstream.address().port}/v1`,INTERNAL_API_URL:`http://127.0.0.1:${upstream.address().port}/v1`,LANDING_DIST_DIR:join(root,'dist')},stdio:['ignore','pipe','pipe']});
let logs='';processRuntime.stdout.on('data',chunk=>logs+=chunk);processRuntime.stderr.on('data',chunk=>logs+=chunk);
const base='http://127.0.0.1:'+port;
try{
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/collections/casual-wear')).ok){ready=true;break;}}catch{}if(processRuntime.exitCode!==null)throw new Error('Candidate exited: '+logs.slice(-2000));await new Promise(done=>setTimeout(done,200));}assert(ready,'Combined runtime failed readiness: '+logs.slice(-2000));
 for(const [slug,title] of categories){const response=await fetch(base+'/collections/'+slug);assert.equal(response.status,200);assert((await response.text()).includes('<h1>'+title+'</h1>'));}
 const report=await probe(base,'evidence/four-categories/candidate',{candidate:true});
 assert.equal(writes,0);report.actualRetainedNextAndLanding=true;report.actualCandidateApiCategoryFilter=true;report.fixtureApiReads=requests;
 await mkdir('evidence/four-categories',{recursive:true});await writeFile('evidence/four-categories/candidate.json',JSON.stringify(report,null,2));
}catch(error){console.error(logs.slice(-3000));throw error;}
finally{processRuntime.kill('SIGTERM');await new Promise(done=>{processRuntime.once('exit',done);setTimeout(()=>{processRuntime.kill('SIGKILL');done();},5000).unref();});upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
