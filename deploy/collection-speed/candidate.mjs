import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {probe} from './browser-probes.mjs';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME);
const privateRoot=resolve(root,'../..');
const products=JSON.parse(await readFile(join(privateRoot,'catalogue.json'),'utf8'));
let writes=0,logs='';
const upstream=createServer((req,res)=>{
  const path=new URL(req.url,'http://fixture').pathname.replace(/^\/v1/,'');
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(!['GET','HEAD'].includes(req.method)){writes++;return send(403,{});}
  if(/^\/products(?:\/(?:featured|best-sellers))?$/.test(path))return send(200,products);
  if(path.startsWith('/products/')){const product=products.find(p=>p.slug===decodeURIComponent(path.split('/')[2]));return send(product?200:404,product||{});}
  if(path.includes('/health'))return send(200,{status:'ok'});
  return send(401,{message:'Authentication required'});
});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const runtime=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),API_URL:`http://127.0.0.1:${upstream.address().port}/v1`,INTERNAL_API_URL:`http://127.0.0.1:${upstream.address().port}/v1`,LANDING_DIST_DIR:join(root,'dist')},stdio:['ignore','pipe','pipe']});
runtime.stdout.on('data',data=>logs+=data);runtime.stderr.on('data',data=>logs+=data);
try {
  const base='http://127.0.0.1:'+port;let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}if(runtime.exitCode!==null)throw Error('Candidate exited: '+logs.slice(-3000));await new Promise(done=>setTimeout(done,200));}
  assert(ready,'Retained candidate readiness');
  const report=await probe(base);assert.equal(writes,0);
  report.actualRetainedRuntime=true;
  await mkdir('evidence/collection-speed',{recursive:true});await writeFile('evidence/collection-speed/candidate.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}catch(error){console.error(logs.slice(-3000));throw error;}
finally{runtime.kill('SIGTERM');await new Promise(done=>{if(runtime.exitCode!==null)return done();runtime.once('exit',done);setTimeout(()=>{runtime.kill('SIGKILL');done();},5000).unref();});upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
