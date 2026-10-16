import {createH2Fixture} from './h2-fixture.mjs';
import {installFixtureDelay} from './network-fixture.mjs';
import assert from 'node:assert/strict';import {createServer,request as httpRequest} from 'node:http';import {readFile,stat,mkdir} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {spawn,execFileSync} from 'node:child_process';
const work=process.env.RUNNER_TEMP+'/hidi-paint-private',selections=JSON.parse(await readFile(work+'/selections.json','utf8')),sources={},products=JSON.parse(await readFile(work+'/catalogue.json','utf8'));
const api=createServer((req,res)=>{const p=new URL(req.url,'http://fixture').pathname.replace(/^\/v1/,'');res.setHeader('content-type','application/json');if(!['GET','HEAD'].includes(req.method)){res.writeHead(403);return res.end('{}');}if(p.includes('/health'))return res.end('{"status":"ok"}');if(p==='/products'||p.startsWith('/products/featured')||p.startsWith('/products/best-sellers'))return res.end(JSON.stringify(products));if(p.startsWith('/products/')){const v=products.find(v=>v.slug===p.split('/')[2]);if(v)return res.end(JSON.stringify(v));}res.writeHead(401);res.end('{}');});
await new Promise(done=>api.listen(4107,'0.0.0.0',done));
const gateway=createServer(async(req,res)=>{try{
 const p=new URL(req.url,'http://fixture').pathname;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(p==='/api/hidi/performance'?204:403);return res.end();}
 if(p==='/api/hidi/hero-config'||p==='/api/hidi/landing-media-config'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(p.includes('landing')?selections.landing:selections.hero));}
 if(sources[p]){const source=sources[p],size=(await stat(source.file)).size;let start=0,end=size-1,status=200;const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');if(match){start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;status=206;res.setHeader('content-range',`bytes ${start}-${end}/${size}`);}res.writeHead(status,{'content-type':source.type,'content-length':end-start+1,'accept-ranges':'bytes'});if(req.method==='HEAD')return res.end();return createReadStream(source.file,{start,end}).pipe(res);}
 const next=httpRequest({hostname:'127.0.0.1',port:3186,path:req.url,method:req.method,headers:req.headers},incoming=>{res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});next.on('error',()=>{res.writeHead(502);res.end();});req.pipe(next);
}catch{res.writeHead(500);res.end();}});
await new Promise(done=>gateway.listen(3188,'0.0.0.0',done));
const tls=work+'/fixture-tls';await mkdir(tls,{recursive:true,mode:0o700});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tls+'/key.pem','-out',tls+'/cert.pem','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
const h2=await createH2Fixture({key:await readFile(tls+'/key.pem'),cert:await readFile(tls+'/cert.pem'),port:3190,targetPort:3188});
async function probe(image,mode){
 execFileSync('docker',['run','-d','--name','hidi-paint-check','--network','host','-e','PORT=3186','-e','API_URL=http://127.0.0.1:4107/v1','-e','INTERNAL_API_URL=http://127.0.0.1:4107/v1','-e','HIDI_PUBLIC_READ_ORIGIN=http://127.0.0.1:3188',image],{stdio:'inherit'});
 try{let ready=false;for(let i=0;i<90;i++){try{if((await fetch('http://127.0.0.1:3186/health')).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,1000));}assert(ready);
  const child=spawn(process.execPath,['deploy/paint-performance/probe.mjs','http://127.0.0.1:3188',mode],{stdio:'inherit'});assert.equal(await new Promise(done=>child.on('exit',done)),0);
  if(mode==='candidate'){const checkout=spawn(process.execPath,['deploy/checkout-hydration/probe.mjs','http://127.0.0.1:3188','evidence/paint-performance/checkout-candidate'],{stdio:'inherit',env:{...process.env,HIDI_BROWSER_ENGINES:'chromium,firefox,webkit',HIDI_LOCAL_OVERLAY:'0'}});assert.equal(await new Promise(done=>checkout.on('exit',done)),0,'Performance candidate must preserve checkout hydration across all browser engines');}
  if(mode==='candidate'){const restoreNetwork=await installFixtureDelay();try{const audit=spawn(process.execPath,['deploy/paint-performance/lighthouse.mjs','candidate'],{stdio:'inherit',env:{...process.env,HIDI_AUDIT_URL:h2.url,HIDI_AUDIT_SPKI:h2.spki}});assert.equal(await new Promise(done=>audit.on('exit',done)),0,'Candidate must meet performance headroom on the delayed HTTP2 fixture before any production write');}finally{restoreNetwork();}}
 }finally{execFileSync('docker',['logs','hidi-paint-check'],{stdio:'inherit'});execFileSync('docker',['rm','-f','hidi-paint-check'],{stdio:'inherit'});}
}
try{const before=JSON.parse(await readFile('evidence/paint-performance/before.json','utf8'));await probe(before['hidi-web'].image,'baseline');await probe(process.env.CANDIDATE_WEB,'candidate');}
finally{h2.close();gateway.closeAllConnections();gateway.close();api.closeAllConnections();api.close();}
