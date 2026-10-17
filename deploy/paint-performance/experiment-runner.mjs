import {transformPaintExperiment,encodeExperimentResponse} from './paint-experiments.mjs';
import {readMirrorProof} from './asset-mirror.mjs';
import {copyFile} from 'node:fs/promises';
if(process.env.GITHUB_WORKFLOW!=='Read-only candidate paint experiments')throw Error('Diagnostic runner requires its isolated non-deploying workflow');
let experiment='control';let inlinePoster,desktopInlinePoster;const mirror=await readMirrorProof('evidence/paint-performance');if(!mirror)throw Error('Verified mirror proof required');
const posterManifest=JSON.parse(await readFile('evidence/paint-performance/manifest.json','utf8'));const posterPath=Object.values(posterManifest.videos)[0].mobile.avifPosterSmall;const posterResponse=await fetch(mirror.origin+posterPath);if(!posterResponse.ok)throw Error('Inline poster source unavailable');const posterBytes=Buffer.from(await posterResponse.arrayBuffer());if(createHash('sha256').update(posterBytes).digest('hex')!==mirror.files[posterPath])throw Error('Inline poster hash mismatch');inlinePoster={path:posterPath,url:'data:image/avif;base64,'+posterBytes.toString('base64')};
const desktopPath=Object.values(posterManifest.videos)[0].desktop.avifPoster;const desktopResponse=await fetch(mirror.origin+desktopPath);if(!desktopResponse.ok)throw Error('Desktop inline source unavailable');const desktopBytes=Buffer.from(await desktopResponse.arrayBuffer());if(createHash('sha256').update(desktopBytes).digest('hex')!==mirror.files[desktopPath])throw Error('Desktop poster hash mismatch');desktopInlinePoster={path:desktopPath,url:'data:image/avif;base64,'+desktopBytes.toString('base64')};
import {createH2Fixture} from './h2-fixture.mjs';
import {installFixtureDelay} from './network-fixture.mjs';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createServer,request as httpRequest} from 'node:http';import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {spawn,execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const work=process.env.RUNNER_TEMP+'/hidi-paint-private',selections=JSON.parse(await readFile(work+'/selections.json','utf8')),analytics=JSON.parse(await readFile(work+'/analytics.json','utf8')),offers=JSON.parse(await readFile(work+'/public-offers.json','utf8')),sources={},products=JSON.parse(await readFile(work+'/catalogue.json','utf8'));
const api=createServer((req,res)=>{const p=new URL(req.url,'http://fixture').pathname.replace(/^\/v1/,'');res.setHeader('content-type','application/json');if(!['GET','HEAD'].includes(req.method)){res.writeHead(403);return res.end('{}');}if(p.includes('/health'))return res.end('{"status":"ok"}');if(p==='/products'||p.startsWith('/products/featured')||p.startsWith('/products/best-sellers'))return res.end(JSON.stringify(products));if(p.startsWith('/products/')){const v=products.find(v=>v.slug===p.split('/')[2]);if(v)return res.end(JSON.stringify(v));}res.writeHead(401);res.end('{}');});
await new Promise(done=>api.listen(4107,'0.0.0.0',done));
const gateway=createServer(async(req,res)=>{try{
 const p=new URL(req.url,'http://fixture').pathname;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(p==='/api/hidi/performance'?204:403);return res.end();}
 if(p==='/api/hidi/analytics-config'){res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');return res.end(JSON.stringify(analytics));}
 if(p==='/api/hidi/offers'){res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');return res.end(JSON.stringify(offers));}
 if(p==='/api/hidi/hero-config'||p==='/api/hidi/landing-media-config'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(p.includes('landing')?selections.landing:selections.hero));}
 if(sources[p]){const source=sources[p],size=(await stat(source.file)).size;let start=0,end=size-1,status=200;const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');if(match){start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;status=206;res.setHeader('content-range',`bytes ${start}-${end}/${size}`);}res.writeHead(status,{'content-type':source.type,'content-length':end-start+1,'accept-ranges':'bytes'});if(req.method==='HEAD')return res.end();return createReadStream(source.file,{start,end}).pipe(res);}
 const next=httpRequest({hostname:'127.0.0.1',port:3186,path:req.url,method:req.method,headers:{...req.headers,...(p==='/'?{'accept-encoding':'identity'}:{})}},incoming=>{
 if(p!=='/'){res.writeHead(incoming.statusCode,incoming.headers);return incoming.pipe(res);}
 const parts=[];incoming.on('data',part=>parts.push(part));incoming.on('end',()=>{if(incoming.headers['content-encoding'])throw Error('Diagnostic document must use identity encoding upstream');const html=transformPaintExperiment(Buffer.concat(parts).toString(),experiment,mirror,{inlinePoster,desktopInlinePoster,isMobile:/Mobile|Android/i.test(req.headers['user-agent']||'')});const {headers,body}=encodeExperimentResponse(incoming.headers,html,String(req.headers['accept-encoding']||''));res.writeHead(incoming.statusCode,headers);res.end(body);});
});next.on('error',()=>{res.writeHead(502);res.end();});req.pipe(next);
}catch{res.writeHead(500);res.end();}});
await new Promise(done=>gateway.listen(3188,'0.0.0.0',done));
const tls=work+'/fixture-tls';await mkdir(tls,{recursive:true,mode:0o700});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tls+'/key.pem','-out',tls+'/cert.pem','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,DNS:hidiindia.com,IP:127.0.0.1'],{stdio:'ignore'});
const h2=await createH2Fixture({key:await readFile(tls+'/key.pem'),cert:await readFile(tls+'/cert.pem'),port:3190,targetPort:3188,productionIdentity:true});
const output='evidence/paint-performance';const results=[];
execFileSync('docker',['run','-d','--name','hidi-paint-experiment','--network','host','-e','PORT=3186','-e','ALLOW_PUBLIC_DOMAIN=true','-e','API_URL=http://127.0.0.1:4107/v1','-e','INTERNAL_API_URL=http://127.0.0.1:4107/v1','-e','HIDI_PUBLIC_READ_ORIGIN=http://127.0.0.1:3188',process.env.CANDIDATE_WEB],{stdio:'inherit'});
let restore;
try{
 let ready=false;for(let i=0;i<90;i++){try{if((await fetch('http://127.0.0.1:3186/health')).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,1000));}assert(ready);
 restore=await installFixtureDelay();
 for(const variant of ['mobile-poster-origin','aux-after-poster','inline-mobile','inline-mobile-aux','inline-both']){
  experiment=variant;const dir=output+'/experiments/'+variant;await mkdir(dir,{recursive:true});
  const html=await(await fetch('http://127.0.0.1:3188/',{headers:{'accept-encoding':'identity'}})).text();await writeFile(dir+'/document.html',html);
  const child=spawn(process.execPath,['deploy/paint-performance/lighthouse.mjs','candidate'],{stdio:'inherit',env:{...process.env,HIDI_AUDIT_URL:h2.url,HIDI_AUDIT_SPKI:h2.spki}});const exitCode=await new Promise(done=>child.on('exit',done));
  const rows=JSON.parse(await readFile(output+'/lighthouse/candidate.json','utf8'));results.push({variant,exitCode,results:rows});
  for(const device of ['mobile','desktop']){
   const events=JSON.parse(await readFile(output+'/lighthouse/candidate-'+device+'-1-0.devtoolslog.json','utf8'));
   const connections=events.filter(event=>event.method==='Network.responseReceived'&&event.params.response.url.startsWith(mirror.origin)).map(event=>{const r=event.params.response;return {url:r.url,connectionId:r.connectionId,connectionReused:r.connectionReused,timing:r.timing};});
   await writeFile(dir+'/'+device+'-connections.json',JSON.stringify(connections,null,2));
  }

  for(const file of ['candidate.json','candidate-mobile-1.report.json','candidate-desktop-1.report.json'])await copyFile(output+'/lighthouse/'+file,dir+'/'+file);
  console.log('EXPERIMENT_RESULT',JSON.stringify({variant,exitCode,results:rows.map(({device,score,lcp,cls,bytes})=>({device,score,lcp,cls,bytes}))}));
 }
 await writeFile(output+'/experiments/results.json',JSON.stringify({diagnosticOnly:true,productionDeployment:false,productionCommerceWrites:0,results},null,2));
}finally{
 restore?.();execFileSync('docker',['logs','hidi-paint-experiment'],{stdio:'inherit'});execFileSync('docker',['rm','-f','hidi-paint-experiment'],{stdio:'inherit'});h2.close();gateway.closeAllConnections();gateway.close();api.closeAllConnections();api.close();
}
