import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {probe} from './probes.mjs';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME);let writes=0,logs='';
const upstream=createServer((req,res)=>{
  const path=new URL(req.url,'http://fixture').pathname;
  if(!['GET','HEAD'].includes(req.method)){writes++;res.writeHead(403).end();return;}
  const body=path.includes('/health')?{status:'ok'}:/\/products(?:\/featured|\/best-sellers)?$/.test(path)?[]:{message:'Authentication required'};
  res.writeHead(Array.isArray(body)||body.status?200:401,{'Content-Type':'application/json'}).end(JSON.stringify(body));
});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,NODE_ENV:'production',PORT:String(port),LANDING_DIST_DIR:join(root,'dist'),API_URL:`http://127.0.0.1:${upstream.address().port}/v1`,INTERNAL_API_URL:`http://127.0.0.1:${upstream.address().port}/v1`},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
try{
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch('http://127.0.0.1:'+port+'/health')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error(logs.slice(-3000));await new Promise(done=>setTimeout(done,200));}assert(ready,'Candidate readiness');
  const report=await probe('http://127.0.0.1:'+port,'evidence/hero-sound/browser',{candidate:true});assert.equal(writes,0);
  await writeFile('evidence/hero-sound/candidate.json',JSON.stringify(report,null,2));
}catch(error){console.error(logs.slice(-3000));throw error;}
finally{child.kill('SIGTERM');await new Promise(done=>{child.once('exit',done);setTimeout(()=>{child.kill('SIGKILL');done();},5000).unref();});upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
