import {readFileSync} from 'node:fs';
import {DRESSES,validOrder,orderOrDefault,builtinGalleryActive} from './model.mjs';
const PUBLIC='/api/hidi/portrait-order',ADMIN='/api/hidi/landing-media-portrait-order';
const assets=new Map([['editor.mjs','text/javascript'],['model.mjs','text/javascript'],['editor.css','text/css']]);
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createPortraitOrderHandler({origin,store,loadMedia,requestFetch=fetch}) {
  const send=(req,res,status,data,type='application/json')=>{
    const body=type==='application/json'?JSON.stringify(data):data;
    res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'});res.end(req.method==='HEAD'?undefined:body);
  };
  async function owner(req) {
    if(!req.headers.cookie)throw fail(401,'Owner sign-in required');
    const response=await requestFetch(new URL('/api/admin/session',origin),{headers:{cookie:req.headers.cookie},redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw fail(401,'Owner sign-in required');
    const data=await response.json();if(data.admin?.role!=='OWNER'||typeof data.admin.id!=='string')throw fail(403,'Only the owner can change the gallery order');
  }
  return async(req,res,path)=>{
    if(![PUBLIC,ADMIN].includes(path)&&!path.startsWith('/portrait-order-assets/'))return false;
    try{
      if(path.startsWith('/portrait-order-assets/')){
        if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method not allowed');
        const name=path.slice('/portrait-order-assets/'.length);if(!assets.has(name))throw fail(404,'Not found');
        send(req,res,200,readFileSync(new URL(name,import.meta.url),'utf8'),assets.get(name));return true;
      }
      if(path===PUBLIC){
        if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method not allowed');
        const current=await store.load();send(req,res,200,{order:orderOrDefault(current.value?.order)});return true;
      }
      await owner(req);
      if(!['GET','HEAD','POST'].includes(req.method))throw fail(405,'Method not allowed');
      if(req.method==='POST'){
        let source;try{source=new URL(req.headers.origin);}catch{throw fail(403,'Same-origin request required');}
        if(source.host!==req.headers.host||!['http:','https:'].includes(source.protocol)||req.headers['sec-fetch-site']==='cross-site')throw fail(403,'Same-origin request required');
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'Use application/json');
        let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2048)throw fail(413,'Request too large');chunks.push(chunk);}
        let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'Invalid JSON');}
        if(!body||Object.keys(body).some(key=>!['order','etag'].includes(key))||!validOrder(body.order)||!(body.etag===null||typeof body.etag==='string'&&body.etag.length<256))throw fail(400,'Keep all five dresses exactly once');
        if(!builtinGalleryActive((await loadMedia())?.ananya))throw fail(409,'A custom Ananya photo list is active. This order applies to the five built-in dresses only.');
        const current=await store.load();if(current.etag!==body.etag)throw fail(409,'The order changed in another session. Reload saved order before saving.');
        const saved=await store.save({version:1,order:body.order,previous:orderOrDefault(current.value?.order),updatedAt:new Date().toISOString()},body.etag);
        send(req,res,200,{order:body.order,etag:saved.etag});return true;
      }
      const [current,media]=await Promise.all([store.load(),loadMedia()]);
      send(req,res,200,{order:orderOrDefault(current.value?.order),etag:current.etag,builtinActive:builtinGalleryActive(media?.ananya),dresses:DRESSES});
    }catch(error){send(req,res,error.status||503,{message:error.status?error.message:'Gallery order is temporarily unavailable. Please retry.'});}
    return true;
  };
}
