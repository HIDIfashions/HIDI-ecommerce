// Isolated local preview: only public GETs may reach production. Commerce writes blocked.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const css=await readFile(new URL('./header.css',import.meta.url),'utf8');
export async function startPreview({port=0,cacheDir,changed=true}={}){
 const cache=resolve(cacheDir);await mkdir(cache,{recursive:true});let blocked=0;
 async function publicRead(path,headers={}){
  const key=createHash('sha256').update(path+(Object.keys(headers).length?JSON.stringify(headers):'')).digest('hex'),file=join(cache,key+'.json');
  try{return JSON.parse(await readFile(file,'utf8'));}catch{}
  const r=await fetch('https://hidiindia.com'+path,{headers,redirect:'manual',signal:AbortSignal.timeout(45000)});
  const value={status:r.status,type:r.headers.get('content-type')||'application/octet-stream',location:r.headers.get('location'),body:Buffer.from(await r.arrayBuffer()).toString('base64')};
  if(r.ok)await writeFile(file,JSON.stringify(value));return value;
 }
 const products=JSON.parse(Buffer.from((await publicRead('/api/store/products')).body,'base64').toString());
 const product=products.find(p=>p.inStock&&p.variants?.some(v=>v.available>0));if(!product)throw Error('No public sample product');
 const variant=product.variants.find(v=>v.available>0),price=variant.pricePaise;
 const image=product.images?.[0];const imageUrl=typeof image==='string'?image:image?.url;
 const cart={sessionId:'header-preview',currency:'INR',items:[{id:'preview-item',quantity:1,lineTotalPaise:price,product:{id:product.id,slug:product.slug,name:product.name,image:imageUrl||null},variant}],itemCount:1,subtotalPaise:price,shippingPaise:0,totalPaise:price};
 const publicApis=/^\/api\/(?:hidi\/(?:hero-config|hero-asset\/|landing-media-config|portrait-order|offers(?:\/checkout-policy)?$)|store\/(?:products(?:\/|$)|collections(?:\/|$)|health\/))/;
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://preview'),path=url.pathname;
  const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
  if(!['GET','HEAD'].includes(req.method)){blocked++;return send(403,{message:'Read-only preview. No live changes are allowed.'});}
  if(path==='/__preview/header.css')return send(200,css,'text/css');
  if(path==='/__preview/session.js')return send(200,"localStorage.setItem('hidi_cart_session','header-preview');",'text/javascript');
  if(path==='/__preview/review')return send(200,await readFile(new URL('./review.html',import.meta.url)),'text/html');
  if(/^\/__preview\/chromium-(390|1440)-(home|collection|product|cart|checkout)\.png$/.test(path))return send(200,await readFile(join(cache,'..',path.split('/').at(-1))),'image/png');
  if(path.startsWith('/admin')||path.startsWith('/api/admin'))return send(401,{message:'Admin is unavailable in this preview'});
  if(path.startsWith('/api/store/carts/'))return send(200,cart);
  if(path==='/api/store/checkout/payment-options')return send(200,{online:true,cod:true});
  if(path==='/api/store/checkout/delivery-serviceability')return send(200,{serviceable:true,cod:true,pin:'500001',city:'Hyderabad',stateCode:'TS'});
  if(path.startsWith('/api/')&&!publicApis.test(path))return send(401,{message:'Sign-in disabled in preview'});
  if(path.startsWith('/__preview/'))return send(404,{});
  const publicHeaders={};for(const name of ['rsc','next-router-state-tree','next-router-prefetch','next-url'])if(typeof req.headers[name]==='string')publicHeaders[name]=req.headers[name];
  const upstream=await publicRead(url.pathname+url.search,publicHeaders);let body=Buffer.from(upstream.body,'base64');
  if(upstream.location){res.writeHead(upstream.status,{Location:upstream.location.replace('https://hidiindia.com','')}).end();return;}
  if(upstream.type.includes('text/html')){let html=body.toString();html=html.replace('</head>',(changed?'<link rel="stylesheet" data-hidi-header-burgundy href="/__preview/header.css">':'')+'<script src="/__preview/session.js"></script></head>');body=Buffer.from(html);}
  send(upstream.status,body,upstream.type);
 }catch(error){res.writeHead(502,{'Content-Type':'application/json'}).end(JSON.stringify({message:'Preview asset unavailable',detail:error.message}));}});
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 return {base:'http://127.0.0.1:'+server.address().port,productPath:'/products/'+product.slug,cart,blocked:()=>blocked,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const s=await startPreview({port:Number(process.argv[2]||4320),cacheDir:process.argv[3]||'../outputs/header-theme-preview/cache'});console.log(s.base);}
