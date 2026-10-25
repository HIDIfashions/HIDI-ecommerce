import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]),port=3194,base=`http://127.0.0.1:${port}`;
const upstream=createServer((req,res)=>{res.writeHead(401,{'content-type':'application/json'});res.end('{"message":"Fixture: authentication required"}');});
await new Promise(r=>upstream.listen(4194,'127.0.0.1',r));
const child=spawn(process.execPath,[root+'/server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',API_URL:'http://127.0.0.1:4194/v1',INTERNAL_API_URL:'http://127.0.0.1:4194/v1'},stdio:['ignore','pipe','pipe']});
let diagnostics='';child.stderr.on('data',d=>{diagnostics=(diagnostics+String(d)).slice(-2000);});child.stdout.on('data',()=>{});
try{
  for(let i=0;i<60;i++){
    try{if((await fetch(base+'/admin-tools-assets/product-page.mjs',{signal:AbortSignal.timeout(2000)})).ok)break;}catch{}
    if(i===59)throw Error('Candidate runtime did not start: '+diagnostics);
    await new Promise(r=>setTimeout(r,500));
  }
  const checked=[];
  for(const name of ['product-page.html','product-page.mjs','product-page-model.mjs','product-page.css','navigation.js']){
    const path=name.endsWith('.html')?'/admin/product-page':'/admin-tools-assets/'+name;
    const response=await fetch(base+path,{signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200,path);
    assert.equal(await response.text(),await readFile(root+'/admin-tools/'+name,'utf8'),path);
    assert(response.headers.get('x-robots-tag')?.includes('noindex'));
    checked.push(path);
  }
  assert.equal((await fetch(base+'/admin/product-page',{method:'POST'})).status,405);
  for(const cookie of ['', 'hidi_admin_access=forged'])for(const path of ['/api/admin/products/options','/api/admin/support']){
    assert.equal((await fetch(base+path,{headers:{cookie},signal:AbortSignal.timeout(10000)})).status,401,path);
  }
  await mkdir('evidence/product-page',{recursive:true});
  await writeFile('evidence/product-page/runtime-smoke.json',JSON.stringify({passed:true,actualRuntime:true,checked,anonymousAndForgedSessionsDenied:true,productionWrites:0},null,2));
  console.log('PASS: actual runtime serves exact editor files and denies unauthenticated API access');
}finally{child.kill('SIGTERM');upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
