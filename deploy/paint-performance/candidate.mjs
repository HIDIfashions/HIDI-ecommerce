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
 const next=httpRequest({hostname:'127.0.0.1',port:3186,path:req.url,method:req.method,headers:req.headers},incoming=>{res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});next.on('error',()=>{res.writeHead(502);res.end();});req.pipe(next);
}catch{res.writeHead(500);res.end();}});
await new Promise(done=>gateway.listen(3188,'0.0.0.0',done));
const tls=work+'/fixture-tls';await mkdir(tls,{recursive:true,mode:0o700});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tls+'/key.pem','-out',tls+'/cert.pem','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,DNS:hidiindia.com,IP:127.0.0.1'],{stdio:'ignore'});
const h2=await createH2Fixture({key:await readFile(tls+'/key.pem'),cert:await readFile(tls+'/cert.pem'),port:3190,targetPort:3188,productionIdentity:true});
async function verifyPublicFixture(){
 const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP hidiindia.com 127.0.0.1:3190','--ignore-certificate-errors-spki-list='+h2.spki]});
 try{const page=await browser.newPage(),response=await page.goto(h2.url,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);const html=await response.text(),assets=JSON.parse(await readFile('evidence/paint-performance/head-assets-quality.json','utf8'));
  assert(html.includes('data-hidi-first-hero="true"'));assert(html.includes('data-hidi-price-announcement="true"'));if(assets.seo)assert(html.includes('defer src="'+assets.seo.url+'"'));
  const logo=html.match(/<img\b[^>]*src="data:image\/png;base64,([A-Za-z0-9+/=]+)"[^>]*alt="HIDI/);assert(logo);assert.equal(createHash('sha256').update(Buffer.from(logo[1],'base64')).digest('hex'),assets.logo.sha256);
  const reads=await page.evaluate(async()=>Promise.all(['/api/store/products','/api/hidi/hero-config','/api/hidi/landing-media-config','/api/hidi/analytics-config','/api/hidi/offers'].map(async path=>{const r=await fetch(path,{cache:'no-store'}),data=await r.json();return {path,status:r.status,catalogueValid:path!=='/api/store/products'||Array.isArray(data)&&data.length>0};})));
  assert(reads.every(row=>row.status===200&&row.catalogueValid),'Production-host fixture must serve real captured public data');await writeFile('evidence/paint-performance/public-fixture-health.json',JSON.stringify({passed:true,nativeHero:true,nativePriceBar:true,exactHeadAssets:true,reads}));
 }finally{await browser.close();}
}
async function probe(image,mode){
 execFileSync('docker',['run','-d','--name','hidi-paint-check','--network','host','-e','PORT=3186','-e','ALLOW_PUBLIC_DOMAIN=true','-e','API_URL=http://127.0.0.1:4107/v1','-e','INTERNAL_API_URL=http://127.0.0.1:4107/v1','-e','HIDI_PUBLIC_READ_ORIGIN=http://127.0.0.1:3188',image],{stdio:'inherit'});
 try{let ready=false;for(let i=0;i<90;i++){try{if((await fetch('http://127.0.0.1:3186/health')).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,1000));}assert(ready);
  const child=spawn(process.execPath,['deploy/paint-performance/probe.mjs','http://127.0.0.1:3188',mode],{stdio:'inherit'});assert.equal(await new Promise(done=>child.on('exit',done)),0);
  if(mode==='candidate'){const checkout=spawn(process.execPath,['deploy/checkout-hydration/probe.mjs','http://127.0.0.1:3188','evidence/paint-performance/checkout-candidate'],{stdio:'inherit',env:{...process.env,HIDI_BROWSER_ENGINES:'chromium,firefox,webkit',HIDI_LOCAL_OVERLAY:'0'}});assert.equal(await new Promise(done=>checkout.on('exit',done)),0,'Performance candidate must preserve checkout hydration across all browser engines');}
  if(mode==='candidate'){await verifyPublicFixture();const restoreNetwork=await installFixtureDelay();try{const audit=spawn(process.execPath,['deploy/paint-performance/lighthouse.mjs','candidate'],{stdio:'inherit',env:{...process.env,HIDI_AUDIT_URL:h2.url,HIDI_AUDIT_SPKI:h2.spki}});assert.equal(await new Promise(done=>audit.on('exit',done)),0,'Candidate must meet performance headroom on the delayed HTTP2 fixture before any production write');}finally{restoreNetwork();}}
 }finally{execFileSync('docker',['logs','hidi-paint-check'],{stdio:'inherit'});execFileSync('docker',['rm','-f','hidi-paint-check'],{stdio:'inherit'});}
}
try{const before=JSON.parse(await readFile('evidence/paint-performance/before.json','utf8'));await probe(before['hidi-web'].image,'baseline');await probe(process.env.CANDIDATE_WEB,'candidate');}
finally{h2.close();gateway.closeAllConnections();gateway.close();api.closeAllConnections();api.close();}
