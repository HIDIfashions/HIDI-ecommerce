/** Production-built upload endpoint over HTTP, with an isolated authorization API.
 * The final storage ticket is deliberately denied: no Azure write is possible.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {setDefaultResultOrder} from 'node:dns';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
setDefaultResultOrder('ipv4first');
const require=createRequire(resolve('apps/web/package.json')),sharp=require('sharp');
const port=3230,apiPort=4230,base='http://localhost:'+port,out=resolve('test-results/compiled-photo-upload');
await mkdir(out,{recursive:true});
const results=[],tickets=[],calls=[];let child,log='';
const api=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(path.startsWith('/v1/admin/')&&req.headers.authorization!=='Bearer fixture-owner')return reply(401,{message:'Fixture session expired'});
 if(path==='/v1/admin/me'){calls.push('me');return reply(200,{admin:{id:'fixture-owner',role:'OWNER'}});}
 if(path==='/v1/admin/inventory/v1/images/ticket'){
  let text='';for await(const part of req)text+=part;assert(text.length<4096);tickets.push(JSON.parse(text));
  return reply(403,{message:'Fixture storage deliberately disabled'});
 }
 if(req.method!=='GET')return reply(405,{message:'No fixture mutations'});
 return reply(200,[]);
});
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function until(fn){const start=Date.now();while(!await fn()){assert(Date.now()-start<30000,'Compiled Next did not start: '+log);await delay(60);}}
async function record(name,fn){try{await fn();results.push({case:name,status:'PASS'});}catch(error){results.push({case:name,status:'FAIL',error:String(error.stack||error)});}await writeFile(resolve(out,'results.json'),JSON.stringify({results,tickets,storageWrites:0,scope:'Compiled Next HTTP route; isolated auth API deliberately denies every storage ticket'},null,2));}
function send(bytes,{origin=base,host='localhost:'+port,cookie='fixture-owner',forwarded}={}){
 const body=new FormData();body.set('file',new File([bytes],'fixture.jpg',{type:'image/jpeg'}));
 return fetch(base+'/api/admin/inventory/v1/images',{method:'POST',headers:{host,origin,...(cookie?{cookie:'hidi_admin_access='+cookie}:{}),...(forwarded?{'x-forwarded-proto':forwarded}:{})},body});
}
const temporary=async()=>(await readdir(tmpdir())).filter(name=>name.startsWith('hidi-photo-')).sort();
try{
 await new Promise(done=>api.listen(apiPort,'127.0.0.1',done));
 child=spawn(process.execPath,[resolve('apps/web/node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:resolve('apps/web'),env:{...process.env,NODE_ENV:'production',ALLOW_PUBLIC_DOMAIN:'true',MEDIA_STORAGE_PROVIDER:'azure',API_URL:'http://127.0.0.1:'+apiPort+'/v1',INTERNAL_API_URL:'http://127.0.0.1:'+apiPort+'/v1'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);
 await until(async()=>{if(child.exitCode!==null)throw new Error('Next exited: '+log);try{return (await fetch(base+'/admin')).ok;}catch{return false;}});
 await record('Built upload route decodes and rejects a corrupt image with temporary-file cleanup',async()=>{
  const before=await temporary();const r=await send(Buffer.from('not an image'));const body=await r.json();assert.equal(r.status,400,JSON.stringify(body));assert.match(body.message,/cannot be decoded/);assert.deepEqual(await temporary(),before);assert.equal(tickets.length,0);
 });
 await record('Built upload route receives 45 MiB and reaches final authorization without a storage write',async()=>{
  const before=await temporary(),jpeg=await sharp({create:{width:300,height:450,channels:3,background:'#e7d7c7'}}).jpeg().toBuffer();
  const bytes=Buffer.alloc(45*1024*1024);jpeg.copy(bytes);const count=tickets.length;const r=await send(bytes),body=await r.json();
  assert.equal(r.status,502,JSON.stringify(body));assert.equal(body.message,'Fixture storage deliberately disabled');assert.equal(tickets.length,count+1);assert.deepEqual(tickets.at(-1),{mimeType:'image/jpeg',sizeBytes:bytes.length});assert.deepEqual(await temporary(),before);
 });
 await record('Production-style HTTPS forwarded origin reaches validation on the built upload route',async()=>{
  const r=await send(Buffer.from('not an image'),{host:'hidiindia.com',origin:'https://hidiindia.com',forwarded:'https'}),body=await r.json();assert.equal(r.status,400,JSON.stringify(body));assert.match(body.message,/cannot be decoded/);
 });
 await record('Cross-origin and expired sessions remain rejected by the compiled endpoint',async()=>{
  let r=await send(Buffer.from('not an image'),{origin:'https://unrelated.invalid'});assert.equal(r.status,403);
  r=await send(Buffer.from('not an image'),{cookie:'fixture-expired'});assert.equal(r.status,401);
  r=await send(Buffer.from('not an image'),{cookie:''});assert.equal(r.status,401);
 });
}finally{
 child?.kill('SIGTERM');api.closeAllConnections();api.close();await writeFile(resolve(out,'server.log'),log);await writeFile(resolve(out,'results.json'),JSON.stringify({results,tickets,storageWrites:0,scope:'Compiled Next HTTP route; isolated authorization API. 45 MiB file is a padded valid JPEG. No Azure, SQL or live storefront mutations.'},null,2));
}
console.log(JSON.stringify({results,tickets},null,2));assert.equal(results.filter(r=>r.status==='FAIL').length,0);
