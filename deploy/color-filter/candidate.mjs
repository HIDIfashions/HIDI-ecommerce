import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.env.RUNNER_TEMP+'/hidi-color-private';
const products=JSON.parse(await readFile(root+'/catalogue.json','utf8'));
// Cover explicit hex priority and spelling normalization, beyond today's catalogue.
for(const [color,colorHex] of [['Custom shade','#123456'],['  off_white  ',null],['Pink','#654321']]){
 const p=structuredClone(products[0]);p.id='fixture-'+products.length;p.slug=p.id;p.variants=p.variants.slice(0,1).map(v=>({...v,id:p.id,color,colorHex,available:4}));products.push(p);
}
let writes=0;
const server=createServer((req,res)=>{
 res.setHeader('content-type','application/json');
 if(!['GET','HEAD'].includes(req.method)){writes++;res.writeHead(403);return res.end('{}');}
 const path=new URL(req.url,'http://fixture').pathname.replace(/^\/v1/,'');
 if(path.startsWith('/products'))return res.end(JSON.stringify(products));
 if(path.includes('health'))return res.end('{"status":"ok"}');
 res.writeHead(401);res.end('{}');
});
await new Promise(done=>server.listen(4107,'0.0.0.0',done));
try{
 execFileSync('docker',['run','-d','--name','hidi-color-candidate','--network','host','-e','PORT=3199','-e','API_URL=http://127.0.0.1:4107/v1','-e','INTERNAL_API_URL=http://127.0.0.1:4107/v1',process.env.CANDIDATE_WEB],{stdio:'inherit'});
 let ready=false;for(let i=0;i<90;i++){try{if((await fetch('http://127.0.0.1:3199/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready);
 // Keep this process alive to serve the read-only fixture while the probe runs.
 const {spawn}=await import('node:child_process');const child=spawn(process.execPath,['deploy/color-filter/probe.mjs','http://127.0.0.1:3199','candidate'],{stdio:'inherit'});
 const code=await new Promise(done=>child.on('exit',done));assert.equal(code,0);assert.equal(writes,0);
}finally{execFileSync('docker',['logs','hidi-color-candidate'],{stdio:'inherit'});execFileSync('docker',['rm','-f','hidi-color-candidate'],{stdio:'inherit'});server.closeAllConnections();server.close();}
