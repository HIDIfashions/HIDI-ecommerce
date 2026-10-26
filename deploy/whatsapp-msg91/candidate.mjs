import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
const port=3192, upstreamPort=3193, base=`http://127.0.0.1:${port}`, token='fixture-whatsapp-token-'.repeat(3), calls=[];
const upstream=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  calls.push({path:req.url,headers:req.headers,body:Buffer.concat(chunks).toString()});
  res.setHeader('content-type','application/json');
  if(req.url==='/v1/whatsapp/msg91/webhook')return res.end(JSON.stringify({accepted:true}));
  if(req.url.includes('/auth/config'))return res.end(JSON.stringify({phoneOtp:true,channel:'SMS',provider:'msg91'}));
  if(req.url.includes('/health'))return res.end(JSON.stringify({status:'ok'}));
  if(req.url.includes('/carts/'))return res.end(JSON.stringify({items:[],subtotalPaise:0,shippingPaise:0,totalPaise:0}));
  if(req.url.includes('/payment-options'))return res.end(JSON.stringify({cod:true,online:true}));
  if(req.method!=='GET'){res.statusCode=400;return res.end('{}');}
  res.end('[]');
});
await new Promise(resolve=>upstream.listen(upstreamPort,'127.0.0.1',resolve));
const name='whatsapp-runtime-fixture';
const proc=spawn('docker',['run','--rm','--name',name,'--network','host','-e',`PORT=${port}`,'-e','STOREFRONT_ORIGIN=','-e','STOREFRONT_SERVER_PATH=/app/apps/web/server.js','-e',`API_URL=http://127.0.0.1:${upstreamPort}/v1`,'-e',`INTERNAL_API_URL=http://127.0.0.1:${upstreamPort}/v1`,process.env.HIDI_CANDIDATE_WEB],{stdio:'ignore'});
try{
  let ready=false;
  for(let i=0;i<90;i++){
    assert(proc.exitCode===null,'Candidate exited before becoming ready');
    try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,1000));
  }
  assert(ready,'Candidate health timeout');
  const path='/api/store/whatsapp/msg91/webhook';
  assert.equal((await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  const bytes='{ "direction": "0", "fixture": true }';
  const reply=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-hidi-whatsapp-token':token,cookie:'private=fixture',authorization:'Bearer fixture'},body:bytes});
  assert.equal(reply.status,200);assert.deepEqual(await reply.json(),{accepted:true});
  const callback=calls.filter(v=>v.path==='/v1/whatsapp/msg91/webhook');assert.equal(callback.length,1);
  assert.equal(callback[0].headers['x-hidi-whatsapp-token'],token);assert.equal(callback[0].body,bytes);
  assert.equal(callback[0].headers.cookie,undefined);assert.equal(callback[0].headers.authorization,undefined);
  assert.equal((await fetch(base+path)).status,405);
  let checkout;
  for(let i=0;i<60;i++){
    try{checkout=await fetch(base+'/checkout?waCart=00000000-0000-4000-a000-000000000001');if(checkout.ok)break;}catch{}
    await new Promise(r=>setTimeout(r,1000));
  }
  assert(checkout?.ok,'Retained checkout route must start');
  const html=await checkout.text();
  const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
  let adoption=false;
  for(const path of scripts){
    const url=new URL(path,base);if(url.origin!==base)continue;
    const response=await fetch(url);assert(response.ok,'Checkout asset missing');
    if((await response.text()).includes('waCart'))adoption=true;
  }
  assert(adoption,'Retained checkout must include WhatsApp cart adoption');
  assert.equal((await fetch(base+'/api/admin/session')).status,401);
  console.log('PASS: exact retained web image boots; callback forwards credentials/body only, rejects unauthenticated requests; checkout retains waCart support; admin session protected');
}finally{
  try{execFileSync('docker',['rm','-f',name],{stdio:'ignore'});}catch{}
  proc.kill();await new Promise(resolve=>upstream.close(resolve));
}
