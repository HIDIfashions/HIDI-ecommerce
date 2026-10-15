/** Test the exact composed images and compiled API services before any Azure update. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {probe} from './probes.mjs';
const work=resolve(process.env.RUNNER_TEMP,'hidi-refinements-private');
for(const name of ['wallet-checkout','cart-size-edit','shipping-policy','free-shipping-offers']){
 let source=await readFile('tests/'+name+'.test.ts','utf8');source=source.replaceAll('../apps/api/src/',work+'/api/candidate-app/apps/api/dist/');
 const file='tests/refinements-compiled-'+name+'.fixture.ts';await writeFile(file,source);execFileSync(process.execPath,['--import','tsx','--test','../../'+file],{cwd:resolve('apps/api'),stdio:'inherit'});
}
execFileSync(process.execPath,['--test','tests/image-sku-runtime-keys.test.mjs'],{env:{...process.env,HIDI_CANDIDATE_RUNTIME:work+'/web/candidate-app'},stdio:'inherit'});
const product={id:'isolated-product',slug:'isolated-style',name:'Isolated candidate style',status:'ACTIVE',fabric:'Fixture fabric',care:'Fixture care',collections:[],minPricePaise:100000,maxPricePaise:100000,inStock:true,images:[],variants:[{id:'fixture-m',sku:'FIXTURE-M',size:'M',color:'Ivory',available:4,pricePaise:100000,mrpPaise:120000},{id:'fixture-l',sku:'FIXTURE-L',size:'L',color:'Ivory',available:0,pricePaise:100000,mrpPaise:120000}]};
const mock=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;res.setHeader('Content-Type','application/json');
 let body={status:'ok'};
 if(path.includes('/carts/'))body={items:[],itemCount:0,subtotalPaise:0,shippingPaise:0,totalPaise:0};
 else if(path.includes('/reviews'))body={averageRating:0,reviewCount:0,verifiedReviewCount:0,reviews:[],ratingDistribution:{1:0,2:0,3:0,4:0,5:0}};
 else if(path.includes('/products'))body=path.endsWith('/related')?[]:path.endsWith('/isolated-style')?product:[product];
 else if(path.endsWith('/payment-options'))body={online:true,cod:true};
 res.end(JSON.stringify(body));
});
await new Promise(done=>mock.listen(4107,'0.0.0.0',done));const name='hidi-refinements-candidate';
try{
 execFileSync('docker',['run','--detach','--name',name,'--network','host','-e','PORT=3199','-e','API_URL=http://127.0.0.1:4107/v1','-e','INTERNAL_API_URL=http://127.0.0.1:4107/v1',process.env.CANDIDATE_WEB],{stdio:'inherit'});
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3199/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'Composed candidate must become ready');
 await probe('http://127.0.0.1:3199','evidence/storefront-refinements/candidate');
 for(const path of ['/admin','/admin/products/price-tags','/admin/landing-media','/admin/privacy-policy','/admin/packing-scanner'])assert.equal((await fetch('http://127.0.0.1:3199'+path)).status,200,'Retained admin route '+path);
 const receipt={passed:true,runId:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,apiId:execFileSync('docker',['image','inspect','--format','{{.Id}}',process.env.CANDIDATE_API],{encoding:'utf8'}).trim(),webId:execFileSync('docker',['image','inspect','--format','{{.Id}}',process.env.CANDIDATE_WEB],{encoding:'utf8'}).trim(),compiledApiFixturesPassed:true,retainedUploadChecksPassed:true,adminRoutesPassed:true};
 await writeFile('evidence/storefront-refinements/candidate-verified.json',JSON.stringify(receipt,null,2));
}catch(error){execFileSync('docker',['logs',name],{stdio:'inherit'});throw error;}finally{execFileSync('docker',['rm','-f',name],{stdio:'inherit'});mock.closeAllConnections();await new Promise(done=>mock.close(done));}
