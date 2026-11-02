import {readFile} from 'node:fs/promises';
const files=new Map(['app.mjs','style.css'].map(n=>['/test-order-assets/'+n,n]));
export function createTestOrdersHandler({apiBase=process.env.API_URL,requestFetch=fetch}={}){return async(req,res,path)=>{
 const page=path==='/admin/test-orders',api=path==='/api/admin/test-orders'||/^\/api\/admin\/test-orders\/[A-Za-z0-9_-]{1,191}$/.test(path);if(!page&&!api&&!files.has(path))return false;
 let status=200,type='application/json',body;const fail=(s,m)=>{throw Object.assign(new Error(m),{status:s});};
 try{
  if(!['GET','HEAD','POST'].includes(req.method))fail(405,'Method not allowed');
  if(files.has(path)){if(req.method==='POST')fail(405,'Method not allowed');type=path.endsWith('.css')?'text/css':'text/javascript';body=await readFile(new URL(files.get(path),import.meta.url));}
  else{
   if(req.method==='POST'){
    let origin;try{origin=new URL(req.headers.origin);}catch{fail(403,'Same-origin request required');}
    if(origin.host!==req.headers.host||!['https:','http:'].includes(origin.protocol)||req.headers['sec-fetch-site']==='cross-site')fail(403,'Same-origin request required');
    if(page||path==='/api/admin/test-orders')fail(405,'Choose one order.');
   }
   const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('hidi_admin_access='));let token='';try{token=raw?decodeURIComponent(raw.slice(18)):'';}catch{}
   if(!/^hidi_admin_[a-f0-9]{64}$/.test(token))fail(401,'Owner sign-in required');
   if(!apiBase)fail(503,'Admin service unavailable');
   let payload;if(req.method==='POST'){
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Use application/json');const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>4096)fail(413,'Request too large');chunks.push(chunk);}try{payload=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Invalid JSON');}
   }
   const target=page?'/admin/me':path.replace('/api/admin','/admin')+new URL(req.url,'http://local').search;
   const response=await requestFetch(apiBase.replace(/\/$/,'')+target,{method:req.method==='HEAD'?'GET':req.method,headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});
   const result=await response.json();if(!response.ok)fail(response.status,result.message||'Unable to load test orders');
   if(page){if(result.admin?.role!=='OWNER')fail(403,'Only an owner can manage test orders.');type='text/html';body=await readFile(new URL('index.html',import.meta.url));}else body=JSON.stringify(result);
  }
 }catch(e){status=e.status||503;body=JSON.stringify({message:e.status?e.message:'Unable to complete the request. Reload before retrying.'});type='application/json';}
 body=Buffer.isBuffer(body)?body:Buffer.from(body);res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:body);return true;
};}
