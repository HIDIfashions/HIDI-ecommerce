// Local fixtures only. Never sends customer, cart, admin or payment writes to production.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {startPreview} from '../header-theme/preview.mjs';import {createOffersHandler} from '../offers/handler.mjs';import {initialState} from '../offers/model.mjs';import {independentState,changeCampaign} from '../offers/campaigns.mjs';import {eligibleProductIds,terms,collection} from './collection.mjs';
export async function startOfferPreview({port=0}={}){
 const products=JSON.parse(await readFile(resolve('../outputs/get1-rollout/products.json'),'utf8'));
 for(const id of eligibleProductIds)if(!products.some(p=>p.id===id&&(p.status===undefined||p.status==='ACTIVE')))throw Error('Unmatched approved dress '+id);
 const lavender=products.find(p=>p.id===eligibleProductIds.at(-1));if(lavender.variants.some(v=>v.pricePaise>=169900))throw Error('Fairy Lavender exceeds approved selling-price ceiling');
 const context={id:'preview-version',actor:{id:'Preview owner'},time:new Date().toISOString()},old=initialState();old.draft={...old.draft,dressEnabled:false,checkoutEnabled:true,audience:'EVERYONE',terms:'Use WELCOME250 for ₹250 off your first ₹1,499 purchase. One coupon per order.'};old.published={...context,version:4,config:old.draft,publishedAt:context.time};
 let state=independentState(old),etag='"preview-1"',writes=1,subtotal=399900;
 state=changeCampaign(state,{action:'save',offerCode:'GET1',draft:{...state.offers.GET1.draft,title:'GET1: Shop ₹3,999. Pick another dress for ₹1.',terms,audience:'EVERYONE',checkoutEnabled:true,landingEnabled:false,eligibleProductIds}},context);
 const draftState=structuredClone(state);
 state=changeCampaign(state,{action:'publish',offerCode:'GET1',confirm:true},context);
 const handler=createOffersHandler({origin:'http://preview.invalid',store:{load:async()=>({value:structuredClone(state),etag}),save:async(next,expected)=>{if(expected!==etag)throw Object.assign(Error('Conflict'),{status:409});state=structuredClone(next);etag='"preview-'+(++writes)+'"';}},requestFetch:async(url,options)=>{if(url.pathname==='/api/admin/session')return Response.json({admin:{id:'Preview owner',role:options.headers.cookie.includes('hidi_preview_owner=1')?'OWNER':'STAFF'}});if(url.pathname==='/api/store/products')return Response.json(products);if(url.pathname==='/api/store/auth/offers-identity')return Response.json({phoneVerified:true,phone:'+919000000001'});throw Error('Unexpected preview lookup');}});
 const backing=await startPreview({cacheDir:'../outputs/header-theme-preview/cache',changed:true});
 const engine=await import(pathToFileURL(resolve(process.env.HIDI_PREVIEW_ENGINE||'../outputs/coupon-release-20261029/local-api/apps/api/dist/checkout/offers-engine.mjs')).href);
 const nativeFetch=globalThis.fetch;let base;
 globalThis.fetch=(resource,options)=>String(resource)==='https://hidiindia.com/api/hidi/offers/checkout-policy'?nativeFetch(base+'/api/hidi/offers/checkout-policy',options):nativeFetch(resource,options);
 const product={id:'preview-qualifying-items',name:'Demo basket — qualifying items',status:'ACTIVE',slug:'preview',images:[]},variant={id:'preview-regular',size:'M',color:'Mixed',pricePaise:subtotal,active:true,productId:product.id,images:[],inventory:{onHand:20,reserved:0,safetyStock:0}};
 function db(){return {order:{findMany:async()=>[]},cart:{findUnique:async()=>({items:[{variantId:variant.id,productId:product.id,quantity:1,product,variant:{...variant,pricePaise:subtotal}}]})},productVariant:{findMany:async()=>products.filter(p=>eligibleProductIds.includes(p.id)).flatMap(p=>p.variants.map(v=>({...v,productId:p.id,product:{...p,status:'ACTIVE'},active:true,inventory:{onHand:v.available,reserved:0,safetyStock:0}})))}};}
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://preview'),path=url.pathname;
  const send=(status,body,type='application/json',headers={})=>{res.writeHead(status,{'Content-Type':type.startsWith('text/')?type+'; charset=utf-8':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'; form-action 'self'",...headers});res.end(req.method==='HEAD'?undefined:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
  if(path==='/__preview/session.js')return send(200,"localStorage.setItem('hidi_cart_session','promo-fixture-session');localStorage.setItem('hidi_supabase_session',JSON.stringify({access_token:'selected',expires_at:Date.now()/1000+3600,user:{id:'preview-user',phone:'+919000000001'}}));",'text/javascript');
  if(path==='/__preview/review')return send(200,await readFile(new URL('./review-v2.html',import.meta.url)),'text/html');
  if(/^\/__preview\/(chromium|webkit)-(390|1440)-(checkout|picker|applied|admin)\.png$/.test(path))return send(200,await readFile(resolve('../outputs/get1-rollout/preview',path.split('/').at(-1))),'image/png');
  if(path==='/__preview/collection'){
   const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   return send(200,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>11 selected GET1 dresses</title><style>body{background:#fbf6f2;color:#591e22;font:16px Arial;padding:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}article{background:white;padding:15px;border:1px solid #ddcec3}img{width:100%;height:300px;object-fit:contain}</style><h1>11 selected GET1 dresses</h1><p>Each available dress and size can be added for ₹1 with a qualifying ₹3,999 basket. Preview only.</p><main>'+collection.map(([code,id])=>{const p=products.find(p=>p.id===id),url=p.images?.[0]?.url||p.variants[0]?.images?.[0]?.url;return '<article><img src="/_next/image?'+esc(new URLSearchParams({url,w:'384',q:'75'}))+'" alt="'+esc(p.name)+'"><h2>'+esc(p.name)+'</h2><p>'+esc(code)+'</p><p>GET1 price: ₹1 · Regular selling price ₹'+(p.minPricePaise/100).toLocaleString('en-IN')+'</p></article>';}).join('')+'</main>','text/html');
  }
  if(path==='/admin/offers'||path==='/api/hidi/offers/admin')req.headers.cookie='hidi_preview_owner=1';
  if(path==='/offers-assets/checkout.js')return send(200,await readFile(new URL('../checkout-offers/checkout.js',import.meta.url)),'text/javascript');
  if(await handler(req,res,path))return;
  if(path==='/api/store/checkout/offers/quote'&&req.method==='POST'){let raw='';for await(const c of req)raw+=c;try{return send(200,await engine.quote(db(),JSON.parse(raw),{phoneVerified:true,phone:'+919000000001',offerAuthorization:'Bearer selected'}));}catch(e){return send(e.getStatus?.()||503,{message:e.message});}}
  if(!['GET','HEAD'].includes(req.method))return send(403,{message:'Preview only. Live purchases and payments are disabled.'});
  if(path.startsWith('/api/store/carts/'))return send(200,{sessionId:'promo-fixture-session',currency:'INR',items:[{id:'preview-items',quantity:1,lineTotalPaise:subtotal,product:{...product,image:null},variant:{...variant,pricePaise:subtotal}}],itemCount:1,subtotalPaise:subtotal,shippingPaise:0,totalPaise:subtotal});
  if(path==='/api/store/products')return send(200,products);
  if(path.includes('/wallet'))return send(200,{enabled:true,currency:'INR',balancePaise:0,availablePaise:0,pendingPaise:0,reservedPaise:0,debtPaise:0,heldPaise:0,history:[],historyTruncated:false,policy:{pointsPerComplete100Rupees:2,paisePerPoint:100,returnWindowDays:7,redemptionCapPaise:null,expiry:null,basis:'Preview'}});
  const r=await nativeFetch(backing.base+url.pathname+url.search,{redirect:'manual'});const body=Buffer.from(await r.arrayBuffer());
  send(r.status,body,r.headers.get('content-type')||'application/octet-stream',path==='/checkout'?{'Set-Cookie':'hidi_preview_owner=1; Path=/; SameSite=Strict'}:{});
 }catch(e){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({message:'Preview unavailable',detail:e.message}));}});
 await new Promise(r=>server.listen(port,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 return {base,setSubtotal:n=>subtotal=n,state:()=>structuredClone(state),reset:()=>{state=structuredClone(draftState);etag='"preview-'+(++writes)+'"';},close:async()=>{globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(r=>server.close(r));await backing.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const s=await startOfferPreview({port:Number(process.argv[2]||4322)});console.log('Local offer preview: '+s.base+'/__preview/review');}
