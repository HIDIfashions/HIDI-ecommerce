// Local review harness: all writes go to an in-memory blob fixture, never Azure.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {KEY} from './storage.mjs';
export async function startPreview(root,{port=0}={}){
  root=resolve(root);const snapshot=JSON.parse(await readFile(join(root,'public-before.json'),'utf8'));
  const blobs=new Map(),writes=[],unexpected=[];let revision=0,failStore=false;
  const seed=()=>{blobs.clear();revision=0;writes.length=0;unexpected.length=0;blobs.set('brand/landing-media/current.json',{value:structuredClone(snapshot['/api/hidi/landing-media-config']),etag:'"media-original"'});blobs.set('brand/hero/current.json',{value:structuredClone(snapshot['/api/hidi/hero-config']),etag:'"hero-original"'});blobs.set('brand/landing-media/range-text.json',{value:structuredClone(snapshot['/api/hidi/landing-media-config'].rangeText),etag:'"text-original"'});};seed();
  const blob=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://fixture').pathname.replace(/^\/fixture\//,'');
    if(failStore&&path===KEY){res.writeHead(503).end();return;}
    const current=blobs.get(path);
    if(req.method==='GET'){
      if(!current){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':'application/json',ETag:current.etag});res.end(JSON.stringify(current.value));return;
    }
    if(req.method==='PUT'&&path===KEY){
      if(current?req.headers['if-match']!==current.etag:req.headers['if-none-match']!=='*'){res.writeHead(412).end();return;}
      let body='';for await(const chunk of req)body+=chunk;const etag='"order-'+(++revision)+'"';blobs.set(path,{value:JSON.parse(body),etag});writes.push(path);res.writeHead(201,{ETag:etag}).end();return;
    }
    unexpected.push(req.method+' '+path);res.writeHead(403).end();
  });
  await new Promise(r=>blob.listen(0,'127.0.0.1',r));
  Object.assign(process.env,{MEDIA_STORAGE_PROVIDER:'azure',AZURE_STORAGE_ACCOUNT:'isolatedfixture',AZURE_STORAGE_CONTAINER:'fixture',AZURE_STORAGE_BLOB_ENDPOINT:'http://127.0.0.1:'+blob.address().port,AZURE_STORAGE_ACCESS_TOKEN:'isolated-fixture-token',MEDIA_PUBLIC_BASE_URL:'https://hidiindia.com/media'});
  const {createHeroMediaHandler}=await import(pathToFileURL(join(root,'candidate/hero-media.mjs')).href);
  let handler;const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.avif':'image/avif'};
  async function publicAsset(path){
    const file=join(root,'asset-cache',path);try{return {body:await readFile(file),type:types[extname(path)]||'application/octet-stream'};}catch{}
    const response=await fetch('https://hidiindia.com'+path,{signal:AbortSignal.timeout(30000),redirect:'error'});
    if(!response.ok)return {status:response.status,body:Buffer.from('Asset unavailable'),type:'text/plain'};
    const body=Buffer.from(await response.arrayBuffer());await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,body);return {body,type:response.headers.get('content-type')||types[extname(path)]};
  }
  const app=createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://local'),path=url.pathname;
    const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
    if(path==='/api/admin/session'){const role=req.headers.cookie?.includes('preview=owner')?'OWNER':req.headers.cookie?.includes('preview=staff')?'STAFF':null;send(role?200:401,role?{admin:{id:'fixture-user',role}}:{message:'Sign in required'});return;}
    if(path==='/admin/landing-media'){
      if(!req.headers.cookie?.includes('preview=owner'))return send(401,{message:'Preview owner session required'});
      let html=await readFile(join(root,'candidate/dist/landing-media-control.html'),'utf8');
      html=html.replace('<body>','<body><div style="padding:10px;text-align:center;background:#f4ead8;color:#602124">LOCAL REVIEW — Save order changes this preview only. Nothing is deployed.</div>');
      return send(200,html,'text/html');
    }
    if(path==='/review'){res.writeHead(302,{'Set-Cookie':'preview=owner; Path=/; HttpOnly; SameSite=Lax',Location:'/admin/landing-media?section=ananya'}).end();return;}
    if(!['GET','HEAD'].includes(req.method)&&path!=='/api/hidi/landing-media-portrait-order'){unexpected.push(req.method+' '+path);return send(403,{message:'Live changes disabled in preview'});}
    if(path.startsWith('/api/hidi/hero-asset/')){const result=await publicAsset(path);return send(result.status||200,result.body,result.type);}
    if(await handler(req,res,path))return;
    if(path==='/')return send(200,await readFile(join(root,'candidate/dist/index.html')),'text/html');
    if(path==='/api/hidi/offers')return send(200,{visible:false});
    if(snapshot[path])return send(200,snapshot[path]);
    if(path.startsWith('/api/'))return send(200,path.includes('products')?[]:{});
    if(path.startsWith('/assets/')||path.startsWith('/brand/')||path.startsWith('/media-performance/')||path==='/config.js'){
      for(const folder of ['candidate/dist','baseline/dist']){try{return send(200,await readFile(join(root,folder,path)),types[extname(path)]);}catch{}}
      const result=await publicAsset(path);return send(result.status||200,result.body,result.type);
    }
    return send(404,{message:'Preview route not found'});
  }catch(error){res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({message:error.message}));}});
  await new Promise(r=>app.listen(port,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;handler=createHeroMediaHandler({origin:base,hasStorefront:true});
  return {base,blobs,writes,unexpected,reset:seed,setFailure:value=>{failStore=value;},close:async()=>{app.closeAllConnections();blob.closeAllConnections();await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>blob.close(r))]);}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const server=await startPreview(process.argv[2],{port:Number(process.argv[3]||4318)});console.log('Review: '+server.base+'/review');}
