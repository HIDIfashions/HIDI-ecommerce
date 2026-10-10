import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {probe} from './checkout-theme-probes.mjs';
const work=resolve(process.env.RUNNER_TEMP,'hidi-checkout-private');
// Execute the actual compiled candidate API services with the same isolated
// transactional fixture; no database or payment provider is connected.
let source=await readFile('tests/wallet-checkout.test.ts','utf8');source=source.replace('../apps/api/src/checkout/checkout.service.js',work+'/api/candidate-app/apps/api/dist/checkout/checkout.service.js').replace('../apps/api/src/checkout/checkout.controller.js',work+'/api/candidate-app/apps/api/dist/checkout/checkout.controller.js');
await writeFile('tests/checkout-compiled-candidate.test.ts',source);execFileSync(process.execPath,['--import','tsx','--test','../../tests/checkout-compiled-candidate.test.ts'],{cwd:resolve('apps/api'),stdio:'inherit'});
const product={id:'isolated-product',slug:'isolated-style',name:'Isolated candidate style',status:'ACTIVE',fabric:'Fixture fabric',care:'Fixture care',collections:[],minPricePaise:100000,maxPricePaise:100000,inStock:true,images:[],variants:[{id:'fixture-m',sku:'FIXTURE-M',size:'M',color:'Ivory',available:4,pricePaise:100000,mrpPaise:120000}]};
const mock=createServer((req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(path.includes('/reviews')?{averageRating:0,reviewCount:0,verifiedReviewCount:0,reviews:[],ratingDistribution:{1:0,2:0,3:0,4:0,5:0}}:path.includes('/products')?(path.endsWith('/related')?[]:path.endsWith('/isolated-style')?product:[product]):{status:'ok'}));});
await new Promise(r=>mock.listen(4107,'0.0.0.0',r));const name='hidi-checkout-candidate';
try{
 execFileSync('docker',['run','--detach','--name',name,'--network','host','-e','PORT=3199','-e','API_URL=http://127.0.0.1:4107/v1','-e','INTERNAL_API_URL=http://127.0.0.1:4107/v1',process.env.CANDIDATE_WEB],{stdio:'inherit'});
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3199/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready);
 await probe('http://127.0.0.1:3199','evidence/checkout-theme/candidate');
 for(const path of ['/','/admin','/admin/products/price-tags','/admin/landing-media','/admin/privacy-policy','/admin/packing-scanner'])assert.equal((await fetch('http://127.0.0.1:3199'+path)).status,200,path);
}catch(error){execFileSync('docker',['logs',name],{stdio:'inherit'});throw error;}finally{execFileSync('docker',['rm','-f',name],{stdio:'inherit'});mock.closeAllConnections();await new Promise(r=>mock.close(r));}
