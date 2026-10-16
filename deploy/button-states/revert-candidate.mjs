/** Launch the exact pre-button-change runtime with a disposable read-only API fixture. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { probe } from './revert-probes.mjs';
const apiPort=Number(process.env.HIDI_BUTTON_API_PORT||4107),port=Number(process.env.HIDI_BUTTON_WEB_PORT||3199);
const products=Array.from({length:3},(_,i)=>({id:'isolated-button-product-'+i,slug:'isolated-button-style-'+i,name:'Isolated candidate style '+(i+1),status:'ACTIVE',description:'Isolated regression catalogue. No real order.\nIncludes: Kurta\nFit: Relaxed\nLining: Unlined',shortDescription:'Isolated catalogue fixture.',fabric:'Fixture cotton',care:'Fixture garment care',collections:[{id:'fixture-new',slug:'new-arrivals',name:'New arrivals'}],category:{id:'fixture-kurta',name:'Kurta',slug:'kurta'},minPricePaise:100000,maxPricePaise:120000,inStock:true,images:[],variants:[{id:'isolated-button-m-'+i,sku:'FIXTURE-BUTTON-M-'+i,size:'M',color:'Ivory',available:4,pricePaise:100000,mrpPaise:140000,bustMm:1100,garmentLengthMm:1120},{id:'isolated-button-l-'+i,sku:'FIXTURE-BUTTON-L-'+i,size:'L',color:'Ivory',available:4,pricePaise:120000,mrpPaise:140000}]}));
const reviews={averageRating:0,reviewCount:0,verifiedReviewCount:0,reviews:[],ratingDistribution:{1:0,2:0,3:0,4:0,5:0}};
const attemptedWrites=[];
const upstream=createServer((req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname.replace(/^\/v1/,'');
  const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(!['GET','HEAD'].includes(req.method)){attemptedWrites.push({method:req.method,path});return send(403,{message:'Fixture permits no writes'});}
  if(path.includes('/reviews'))return send(200,reviews);
  if(/^\/products(?:\/(?:featured|best-sellers))?$/.test(path))return send(200,products);
  if(path.startsWith('/products/')){if(path.endsWith('/related'))return send(200,products.slice(1));const value=products.find(product=>product.slug===decodeURIComponent(path.split('/')[2])||product.id===decodeURIComponent(path.split('/')[2]));return send(value?200:404,value||{message:'Not found'});}
  if(path.includes('/health'))return send(200,{status:'ok'});
  if(path==='/checkout/payment-options')return send(200,{cod:true,online:true});
  if(path.startsWith('/checkout/delivery-serviceability'))return send(200,{serviceable:true,cod:true,city:'Hyderabad',stateCode:'Telangana'});
  return send(401,{message:'Authentication required'});
});
await new Promise((done,reject)=>{upstream.once('error',reject);upstream.listen(apiPort,'0.0.0.0',done);});
const container='hidi-button-states-revert-candidate';let processRuntime,logs='';
const image=process.env.WEB_IMAGE||process.env.CANDIDATE_WEB;
try{
  if(image){execFileSync('docker',['run','--detach','--name',container,'--network','host','-e','PORT='+port,'-e','API_URL=http://127.0.0.1:'+apiPort+'/v1','-e','INTERNAL_API_URL=http://127.0.0.1:'+apiPort+'/v1',image],{stdio:'inherit'});}
  else{
    assert(process.env.HIDI_CANDIDATE_RUNTIME,'Actual extracted candidate runtime or candidate image required');
    const runtime=resolve(process.env.HIDI_CANDIDATE_RUNTIME);processRuntime=spawn(process.execPath,[join(runtime,'server.mjs')],{cwd:runtime,env:{...process.env,PORT:String(port),API_URL:'http://127.0.0.1:'+apiPort+'/v1',INTERNAL_API_URL:'http://127.0.0.1:'+apiPort+'/v1'},stdio:['ignore','pipe','pipe']});
    processRuntime.stdout.on('data',chunk=>{logs+=chunk;});processRuntime.stderr.on('data',chunk=>{logs+=chunk;});
  }
  let ready=false;for(let i=0;i<60;i++){if(processRuntime?.exitCode!==null&&processRuntime?.exitCode!==undefined)throw new Error('Candidate runtime exited before readiness: '+processRuntime.exitCode);try{if((await fetch('http://127.0.0.1:'+port+'/health')).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,1000));}assert(ready,'Candidate web readiness');
  await probe('http://127.0.0.1:'+port,process.env.HIDI_BUTTON_OUTPUT||'evidence/button-states-revert/candidate');assert.deepEqual(attemptedWrites,[],'No API write escaped browser interception');
}catch(error){if(image)execFileSync('docker',['logs',container],{stdio:'inherit'});else console.error(logs.slice(-10000));throw error;}
finally{if(image)execFileSync('docker',['rm','-f',container],{stdio:'inherit'});else if(processRuntime){processRuntime.kill('SIGTERM');await new Promise(done=>{if(processRuntime.exitCode!==null)return done();processRuntime.once('exit',done);setTimeout(()=>{processRuntime.kill('SIGKILL');done();},5000).unref();});}upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
