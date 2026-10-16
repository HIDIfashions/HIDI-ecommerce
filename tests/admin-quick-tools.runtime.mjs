// Executes the actual composed runtime against a read-only fixture upstream.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.HIDI_CANDIDATE_RUNTIME;if(!root)throw new Error('Set HIDI_CANDIDATE_RUNTIME to the composed candidate application.');
const upstream=createServer((q,s)=>{
  if(q.url.startsWith('/api/admin/')){s.writeHead(401,{'content-type':'application/json'});s.end(JSON.stringify({message:'Admin sign-in required'}));return;}
  s.writeHead(200,{'content-type':'text/html'});s.end('<!doctype html><html><head><title>Retained shop</title></head><body><main><h1>Retained shop</h1><nav aria-label="Admin navigation"></nav></main></body></html>');
});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),LANDING_DIST_DIR:path.join(root,'dist'),STOREFRONT_ORIGIN:'http://127.0.0.1:'+upstream.address().port,API_URL:'http://127.0.0.1:'+upstream.address().port+'/v1',INTERNAL_API_URL:'http://127.0.0.1:'+upstream.address().port+'/v1'},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const base='http://127.0.0.1:'+port;
async function get(url,options){return fetch(base+url,{...options,signal:AbortSignal.timeout(10000)});}
let checks=0;
try{
  let ready=false;for(let i=0;i<60;i++){try{if((await get('/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Candidate runtime did not start: '+log.slice(-1000));checks++;
  for(const p of ['/admin/product-quick-fill','/admin/product-bulk','/admin/packing-scanner','/packing-scanner-control.html']){const r=await get(p);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(await r.text(),/admin-tools-assets/);checks+=3;}
  assert.match(await (await get('/admin/products')).text(),/data-hidi-admin-quick-tools/);checks++;
  for(const p of ['/cart','/checkout','/account','/collections/all','/admin/products/price-tags']){assert.equal((await get(p)).status,200);checks++;}
  for(const p of ['/api/admin/products/options','/api/admin/orders?status=CONFIRMED','/api/hidi/packing-plan?order=HIDI-PROBE']){assert.equal((await get(p)).status,401);checks++;}
  const complete=await get('/api/hidi/packing-complete?order=HIDI-PROBE',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scannedBarcodes:['H000000000001']})});assert.equal(complete.status,401);checks++;
  for(const file of ['admin-tools.css','navigation.js','product-sheet.mjs','product-batch.mjs','workbook-reader.mjs','product-bulk.mjs','product-quick-fill.mjs','packing-scanner.mjs']){const r=await get('/admin-tools-assets/'+file);assert.equal(r.status,200);assert.equal(await r.text(),await readFile(path.join(root,'admin-tools',file),'utf8'));checks+=2;}
  assert.equal((await get('/admin/product-quick-fill',{method:'POST'})).status,405);checks++;
  assert.equal((await get('/admin-tools-assets/product-sheet.mjs',{method:'HEAD'})).status,200);checks++;
  assert.equal((await get('/admin-tools-assets/product-sheet.mjs',{method:'HEAD'})).headers.get('content-type'),'text/javascript; charset=utf-8');checks++;
  console.log(JSON.stringify({passed:true,runtimeChecks:checks,customerRoutesRetained:true,anonymousAdminDataDenied:true}));
}finally{child.kill('SIGTERM');upstream.closeAllConnections();upstream.close();}
