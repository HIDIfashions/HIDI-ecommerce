// Test harness only. The actual retained media handler writes to local memory, never Azure.
import {createServer} from 'node:http';import {readFile,writeFile,realpath} from 'node:fs/promises';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';
import {startPreview as publicPreview} from '../header-theme/preview.mjs';
import {spawn} from 'node:child_process';
export const OWNER='hidi_admin_'+'a'.repeat(64);
export async function startPreview(root,{port=0}={}){
 root=resolve(root);const source=process.env.HIDI_HERO_FIXTURE?join(root,'fixtures'):resolve(root,'../landing-offer-loop');
 const oldSnapshot=JSON.parse(await readFile(process.env.HIDI_HERO_FIXTURE?join(root,'public-before.json'):resolve(root,'../portrait-order-preview/public-before.json'),'utf8'));
 const hero=JSON.parse(await readFile(join(source,'hero-config.json'),'utf8'));
 const videoBytes=await readFile(join(source,process.env.HIDI_HERO_FIXTURE?'existing-hero.webm':'existing-hero.mp4'));
 const videoKey=hero.url.split('/api/hidi/hero-asset/')[1];
 const backing=await publicPreview({cacheDir:process.env.HIDI_HERO_FIXTURE?join(root,'public-cache'):resolve(root,'../header-theme-preview/cache'),changed:false});
 const blobs=new Map(),writes=[],unexpected=[];let failNextUpload=false,failNextPublish=false,telemetryBlocked=0;
 function json(key,value){blobs.set(key,{body:Buffer.from(JSON.stringify(value)),type:'application/json'})}
 function reset(){blobs.clear();writes.length=0;unexpected.length=0;failNextUpload=false;failNextPublish=false;json('brand/hero/current.json',hero);json('brand/hero/library.json',{version:1,assets:hero.items.map(x=>({...x,id:x.assetId,sizeBytes:videoBytes.length}))});json('brand/landing-media/current.json',oldSnapshot['/api/hidi/landing-media-config']);json('brand/landing-media/range-text.json',oldSnapshot['/api/hidi/landing-media-config'].rangeText);blobs.set(videoKey,{body:videoBytes,type:process.env.HIDI_HERO_FIXTURE?'video/webm':'video/mp4'});}reset();
 function sendBytes(req,res,asset){const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');const bytes=asset.body;let a=0,b=bytes.length-1;if(range){a=Number(range[1]);if(range[2])b=Math.min(b,Number(range[2]));}if(a>b){res.writeHead(416,{'Content-Range':'bytes */'+bytes.length}).end();return;}res.writeHead(range?206:200,{'Content-Type':asset.type,'Content-Length':b-a+1,'Accept-Ranges':'bytes',ETag:'"fixture-'+bytes.length+'"',...(range?{'Content-Range':`bytes ${a}-${b}/${bytes.length}`}:{})});res.end(req.method==='HEAD'?undefined:bytes.subarray(a,b+1));}
 const blob=createServer(async(req,res)=>{const key=decodeURIComponent(new URL(req.url,'http://fixture').pathname.replace(/^\/fixture\//,''));if(['GET','HEAD'].includes(req.method)){const item=blobs.get(key);if(!item)return res.writeHead(404).end();return sendBytes(req,res,item);}if(req.method==='PUT'&&(/^(brand\/hero\/(current|previous|library)\.json)$/.test(key)||key.startsWith('brand/hero/media/'))){if((failNextUpload&&key.startsWith('brand/hero/media/'))||(failNextPublish&&key==='brand/hero/current.json')){failNextUpload=false;failNextPublish=false;return res.writeHead(503).end();}const parts=[];for await(const chunk of req)parts.push(chunk);blobs.set(key,{body:Buffer.concat(parts),type:req.headers['content-type']||'application/octet-stream'});writes.push(key);return res.writeHead(201).end();}unexpected.push(req.method+' '+key);res.writeHead(403).end();});
 await new Promise(r=>blob.listen(0,'127.0.0.1',r));Object.assign(process.env,{MEDIA_STORAGE_PROVIDER:'azure',AZURE_STORAGE_ACCOUNT:'isolatedfixture',AZURE_STORAGE_CONTAINER:'fixture',AZURE_STORAGE_BLOB_ENDPOINT:'http://127.0.0.1:'+blob.address().port,AZURE_STORAGE_ACCESS_TOKEN:'isolated-fixture-token',MEDIA_PUBLIC_BASE_URL:'https://hidiindia.com/media'});
 const {createHeroMediaHandler}=await import(pathToFileURL(join(root,'baseline/hero-media.mjs')).href);let handler,runtime,runtimeBase,runtimeLogs='';
 const app=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://preview'),path=u.pathname;res.setHeader('Content-Security-Policy',"connect-src 'self'; form-action 'self'");const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
 if(path==='/v1/admin/me'){const owner=req.headers.authorization==='Bearer '+OWNER;return send(owner?200:401,owner?{admin:{id:'preview-owner',role:'OWNER',permissions:['*']}}:{message:'Sign in required'});}
 if(path.startsWith('/v1/')&&['GET','HEAD'].includes(req.method)&&/^\/v1\/(products|collections|health)(\/|$)/.test(path)){const r=await fetch(backing.base+'/api/store/'+path.slice(4)+u.search);return send(r.status,Buffer.from(await r.arrayBuffer()),r.headers.get('content-type'));}
 if(path==='/api/admin/session'){const owner=req.headers.cookie?.includes('hidi_admin_access='+OWNER);return send(owner?200:401,owner?{admin:{id:'preview-owner',role:'OWNER'}}:{message:'Owner sign-in required'});}
 if(path==='/review'){res.writeHead(302,{'Set-Cookie':'hidi_admin_access='+OWNER+'; Path=/; HttpOnly; SameSite=Lax',Location:'/admin/landing-media?section=hero'}).end();return;}
 if(path==='/admin/landing-media'){let html=await readFile(join(root,'candidate/dist/landing-media-control.html'),'utf8');html=html.replace('<body>','<body><div style="padding:10px 20px;background:#f4ead8;color:#591e22;font:13px Arial;text-align:center">LOCAL PREVIEW — Upload and Publish affect this preview only. <a href="/" target="_blank" style="color:inherit">Open storefront preview ↗</a></div>');return send(200,html,'text/html; charset=utf-8');}
 if(path==='/__preview/state')return send(200,{writes,unexpected,telemetryBlocked,liveWrites:0,current:JSON.parse(blobs.get('brand/hero/current.json').body)});
 // Discard the retained storefront's performance beacons locally.
 if(path==='/api/hidi/performance'&&req.method==='POST'){telemetryBlocked++;return send(204,'');}
 // Only existing hero upload/publish/restore/reset routes can write to the isolated fixture.
 if(!['GET','HEAD'].includes(req.method)&&!/^\/api\/hidi\/hero-(upload|publish|restore|reset)$/.test(path)){unexpected.push(req.method+' '+path);return send(403,{message:'Preview blocks commerce and unrelated writes'});}
 if(path.startsWith('/api/hidi/hero-asset/')){const key=path.slice('/api/hidi/hero-asset/'.length);if(!blobs.has(key)){const r=await fetch(backing.base+path);return send(r.status,Buffer.from(await r.arrayBuffer()),r.headers.get('content-type'));}}
 if(await handler(req,res,path))return;
 if(path==='/'){
  // Production's server injects the homepage bootstrap and initial hero markup.
  // Testing the raw dist template skips those required runtime transforms.
  if(runtimeBase){const r=await fetch(runtimeBase+'/',{headers:{'X-Forwarded-Host':'hidiindia.com','X-Forwarded-Proto':'https'}});return send(r.status,Buffer.from(await r.arrayBuffer()),r.headers.get('content-type'));}
  return send(200,await readFile(join(root,'candidate/dist/index.html')),'text/html; charset=utf-8');
 }
 if(/^\/assets\/index-[a-zA-Z0-9_-]+\.js$/.test(path)){try{return send(200,await readFile(join(root,'candidate/dist',path.slice(1))),'text/javascript');}catch{}}
 if(path.startsWith('/admin')||path.startsWith('/api/admin')||path.startsWith('/v1/'))return send(401,{message:'Not available in preview'});
 // Actual extracted static assets take priority over public-read fallbacks.
 if(process.env.HIDI_HERO_FIXTURE&&!path.startsWith('/api/')&&!path.includes('..')){
  const types={js:'text/javascript',css:'text/css',svg:'image/svg+xml',woff2:'font/woff2',png:'image/png',jpg:'image/jpeg',webp:'image/webp',avif:'image/avif'};
  try{return send(200,await readFile(join(root,'candidate/dist',path.slice(1))),types[path.split('.').at(-1)]||'application/octet-stream');}catch{}
 }
 const r=await fetch(backing.base+u.pathname+u.search,{redirect:'manual'});if(r.headers.get('location')){res.writeHead(r.status,{Location:r.headers.get('location')}).end();return;}return send(r.status,Buffer.from(await r.arrayBuffer()),r.headers.get('content-type')||'application/octet-stream');
 }catch(error){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message}));}});
 await new Promise(r=>app.listen(port,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;handler=createHeroMediaHandler({origin:base,hasStorefront:true});
 if(process.env.HIDI_HERO_FIXTURE){
  const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const runtimePort=reserve.address().port;await new Promise(r=>reserve.close(r));
  runtimeBase='http://127.0.0.1:'+runtimePort;
  const runtimeRoot=await realpath(join(root,'candidate'));
  runtime=spawn(process.execPath,[join(runtimeRoot,'server.mjs')],{cwd:runtimeRoot,env:{...process.env,PORT:String(runtimePort),API_URL:base+'/v1',INTERNAL_API_URL:base+'/v1'},stdio:['ignore','pipe','pipe']});
  runtime.stdout.on('data',d=>runtimeLogs+=d);runtime.stderr.on('data',d=>runtimeLogs+=d);
  let ready=false;for(let i=0;i<100;i++){if(runtime.exitCode!==null)throw Error('Homepage runtime exited '+runtime.exitCode+': '+runtimeLogs.slice(-3000));try{if((await fetch(runtimeBase+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw Error('Extracted homepage runtime did not start: '+runtimeLogs.slice(-3000));
 }
 return {base,root,writes,unexpected,reset,blobs,runtimeLogs:()=>runtimeLogs,current:()=>JSON.parse(blobs.get('brand/hero/current.json').body),failUpload:()=>{failNextUpload=true},failPublish:()=>{failNextPublish=true},close:async()=>{if(runtime){runtime.kill('SIGTERM');await new Promise(r=>{if(runtime.exitCode!==null)return r();runtime.once('exit',r);setTimeout(()=>{runtime.kill('SIGKILL');r();},5000).unref();});}app.closeAllConnections();blob.closeAllConnections();await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>blob.close(r)),backing.close()])}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const s=await startPreview(process.argv[2],{port:Number(process.argv[3]||4326)});console.log('Admin preview: '+s.base+'/review');}
