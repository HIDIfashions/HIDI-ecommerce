import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const root=process.env.HIDI_CANDIDATE_RUNTIME;assert(root);
const upstream=createServer((req,res)=>{res.writeHead(401,{'content-type':'application/json'});res.end('{"message":"Fixture: authentication required"}');});
await new Promise(done=>upstream.listen(4196,'127.0.0.1',done));
const child=spawn(process.execPath,[root+'/server.mjs'],{cwd:root,env:{...process.env,PORT:'3196',HOSTNAME:'127.0.0.1',API_URL:'http://127.0.0.1:4196/v1',INTERNAL_API_URL:'http://127.0.0.1:4196/v1'},stdio:['ignore','pipe','pipe']});
let diagnostics='';child.stderr.on('data',d=>{diagnostics=(diagnostics+String(d)).slice(-2000);});child.stdout.on('data',()=>{});
const base='http://127.0.0.1:3196';
try{
  let ready=false;
  for(let i=0;i<90;i++){
    try{if((await fetch(base+'/admin/sign-in',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}
    if(child.exitCode!==null)throw Error('Candidate exited: '+diagnostics);
    await new Promise(done=>setTimeout(done,500));
  }
  assert(ready,'Candidate did not start: '+diagnostics);
  assert.equal(await (await fetch(base+'/admin/sign-in')).text(),await readFile(root+'/admin-security/login.html','utf8'));
  for(const name of ['login.mjs','activity.mjs','sales.mjs'])assert.equal(await (await fetch(base+'/admin-security-assets/'+name)).text(),await readFile(root+'/admin-security/'+name,'utf8'));
  for(const path of ['/api/admin/session','/api/admin/sales-deletion','/admin/sales-delete'])assert.equal((await fetch(base+path)).status,401,path);
  assert.equal((await fetch(base+'/api/admin/session',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({accessToken:'saved'})})).status,401);
  const admin=await fetch(base+'/admin/orders');assert.equal(admin.status,200);assert.match(await admin.text(),/admin-security-assets\/activity\.mjs/);
  await mkdir('evidence/admin-security',{recursive:true});await writeFile('evidence/admin-security/runtime-smoke.json',JSON.stringify({passed:true,actualRuntime:true,productionWrites:0}));
}finally{child.kill('SIGTERM');upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
