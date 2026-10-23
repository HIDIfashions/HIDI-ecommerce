// Start the exact candidate image against an anonymous read-only API proxy.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {snapshotServer} from './snapshot-server.mjs';
const execute=promisify(execFile);
const out=resolve('evidence/pdp-layout/candidate');
const source=await snapshotServer({directory:join(out,'public-api'),css:''});
const reads=[],writes=[];
const proxy=createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){writes.push(req.url);res.writeHead(405);res.end();return;}
 try{
  const url=new URL(req.url,'http://fixture'),path=url.pathname.replace(/^\/v1(?=\/|$)/,'');
  const target='/api/store'+path+url.search;reads.push(target);
  const data=await source.pull(target);res.writeHead(data.status,{'content-type':data.contentType});res.end(data.body);
 }catch(e){res.writeHead(502);res.end(e.message);}
});
await new Promise(done=>proxy.listen(0,'127.0.0.1',done));
const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));
const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const base='http://127.0.0.1:'+port,api='http://127.0.0.1:'+proxy.address().port+'/v1';
const name='hidi-pdp-candidate-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT;
const runtime=spawn('docker',['run','--rm','--name',name,'--network','host','-e','PORT='+port,
 '-e','API_URL='+api,'-e','INTERNAL_API_URL='+api,process.env.HIDI_CANDIDATE_IMAGE],{stdio:['ignore','pipe','pipe']});
let logs='';runtime.stdout.on('data',c=>logs+=c);runtime.stderr.on('data',c=>logs+=c);
try{
 let ready=false;
 for(let i=0;i<150;i++){
  try{if((await fetch(base+'/api/store/products',{signal:AbortSignal.timeout(3000)})).ok){ready=true;break;}}catch{}
  if(runtime.exitCode!==null)throw Error('Candidate exited: '+logs.slice(-2000));
  await new Promise(done=>setTimeout(done,200));
 }
 assert(ready,'Actual candidate must become ready');
 await new Promise((done,reject)=>{
  const test=spawn('python3',['deploy/pdp-layout/browser-runner.py','candidate',base],{stdio:'inherit'});
  test.on('error',reject);test.on('exit',code=>code===0?done():reject(Error('Candidate browser tests failed: '+code)));
 });
 assert(reads.some(p=>p.startsWith('/api/store/products')),'Actual candidate must read real catalogue');
 assert.deepEqual(writes,[]);
 await writeFile(join(out,'runtime.json'),JSON.stringify({passed:true,actualDockerImage:process.env.HIDI_CANDIDATE_IMAGE,anonymousReads:reads.length,upstreamWrites:0},null,2));
}catch(e){console.error(logs.slice(-2000));throw e;}
finally{
 await execute('docker',['stop','--time','5',name]).catch(()=>{});
 proxy.closeAllConnections();await new Promise(done=>proxy.close(done));
 await source.save();await source.close();
}
