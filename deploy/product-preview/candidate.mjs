import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {probe} from './probe.mjs';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME),writes=[];
const products=Array.from({length:3},(_,i)=>({id:'copy-fixture-'+i,name:'Embroidered cotton kurta '+i,slug:'copy-fixture-'+i,status:'ACTIVE',shortDescription:'**Cotton** three piece set',description:"A woman's **cotton** kurta.\n\n# Details\n- Fine embroidery\n- Coordinated dupatta\nIncludes: Kurta, bottom and dupatta",fabric:'**Cotton**',care:'Gentle hand wash\n\nDry flat',category:{id:'casual',slug:'casual-wear',name:'Casual Wear'},collections:[],images:[{id:'image-'+i,url:'/brand/hidi-logo-header.svg',alt:'Fixture',position:0}],minPricePaise:182750,maxPricePaise:182750,inStock:true,variants:['M','L'].map(size=>({id:i+size,sku:'COPY-'+i+size,color:'Royal blue',size,available:3,pricePaise:182750,mrpPaise:215000,images:[]}))}));
const upstream=createServer((req,res)=>{const path=new URL(req.url,'http://fixture').pathname.replace(/^\/v1/,'');const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(!['GET','HEAD'].includes(req.method)){writes.push(req.method+' '+path);return send(403,{message:'Read-only fixture'});}
 if(path.includes('/health'))return send(200,{status:'ok'});
 if(path.includes('/reviews'))return send(200,{averageRating:0,reviewCount:0,verifiedReviewCount:0,reviews:[],ratingDistribution:{1:0,2:0,3:0,4:0,5:0}});
 if(path.startsWith('/carts/'))return send(200,{items:[],itemCount:0,subtotalPaise:0,totalPaise:0});
 if(/^\/products(?:\/(?:featured|best-sellers))?$/.test(path))return send(200,products);
 if(path.startsWith('/products/')){if(path.endsWith('/related'))return send(200,products.slice(1));const p=products.find(p=>p.slug===decodeURIComponent(path.split('/')[2]));return send(p?200:404,p||{});}
 return send(401,{message:'Authentication required'});});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const url='http://127.0.0.1:'+upstream.address().port+'/v1';const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),API_URL:url,INTERNAL_API_URL:url},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const base='http://127.0.0.1:'+port;
try{let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(logs.slice(-3000));try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,200));}assert(ready);await probe(base,'evidence/product-preview-release/candidate');assert.deepEqual(writes,[]);}
catch(error){console.error(logs.slice(-3000));throw error;}
finally{child.kill('SIGTERM');await new Promise(done=>{if(child.exitCode!==null)return done();child.once('exit',done);setTimeout(()=>{child.kill('SIGKILL');done();},5000).unref();});upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
