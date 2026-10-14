import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createAzureOfferStore} from './storage.mjs';
import {initialState,validate,publicOffer,fail} from './model.mjs';
const API='/api/hidi/offers/admin';
const assets=new Map([['editor.html','text/html'],['editor.js','text/javascript'],['storefront.js','text/javascript'],['admin-link.js','text/javascript'],['offers.css','text/css']]);
function sameOrigin(req) {
  if(req.headers['sec-fetch-site']==='cross-site')return false;
  try{const o=new URL(req.headers.origin||'');return o.host===req.headers.host&&(o.protocol==='https:'||o.protocol==='http:'&&/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(o.host));}catch{return false;}
}
async function json(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'Use application/json');
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>16384)throw fail(413,'Offer settings are too large');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'Invalid JSON');}
}
export function createOffersHandler({origin,store=createAzureOfferStore(),requestFetch=fetch,now=()=>Date.now()}) {
  function send(req,res,status,data,type='application/json') {
    const body=type==='application/json'?JSON.stringify(data):data;
    res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'private, no-store','Vary':'Authorization, Cookie','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
    res.end(req.method==='HEAD'?undefined:body);
  }
  async function owner(req) {
    if(!req.headers.cookie)throw fail(401,'Owner sign-in required');
    const response=await requestFetch(new URL('/api/admin/session',origin),{headers:{cookie:req.headers.cookie},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw fail(401,'Owner sign-in required');
    const profile=await response.json();
    if(profile?.admin?.role!=='OWNER'||typeof profile.admin.id!=='string')throw fail(403,'Only the owner can manage offers');
    return {id:profile.admin.id};
  }
  async function customer(req) {
    const authorization=req.headers.authorization;
    if(typeof authorization!=='string'||!/^Bearer [^\s]{1,16384}$/.test(authorization))return null;
    try {
      const response=await requestFetch(new URL('/api/store/auth/offers-identity',origin),{headers:{authorization},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(5000)});
      if(!response.ok)return null;
      const identity=await response.json();
      return identity?.phoneVerified===true&&typeof identity.phone==='string'?identity.phone:null;
    }catch{return null;}
  }
  return async(req,res,path)=>{
    if(![API,'/api/hidi/offers','/admin/offers'].includes(path)&&!path.startsWith('/offers-assets/'))return false;
    try {
      if(path.startsWith('/offers-assets/')||path==='/admin/offers'){
        if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method not allowed');
        if(path==='/admin/offers')await owner(req);
        const name=path==='/admin/offers'?'editor.html':path.slice('/offers-assets/'.length);
        if(!assets.has(name)||name==='editor.html'&&path!=='/admin/offers')throw fail(404,'Not found');
        send(req,res,200,readFileSync(new URL(name,import.meta.url),'utf8'),assets.get(name));return true;
      }
      if(path==='/api/hidi/offers'){
        if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method not allowed');
        const loaded=await store.load();
        const published=loaded.value?.published;
        if(published)validate(published.config,{publishing:true});
        // No campaign, or HIDDEN, requires no customer or business-data lookup.
        let result=publicOffer(published,null,now());
        if(!result.visible&&published?.config?.audience==='SELECTED')result=publicOffer(published,await customer(req),now());
        send(req,res,200,result);return true;
      }
      if(!['GET','HEAD','POST'].includes(req.method))throw fail(405,'Method not allowed');
      if(req.method==='POST'&&!sameOrigin(req))throw fail(403,'Use the HIDI admin page to save changes');
      const actor=await owner(req);
      const loaded=await store.load(),state=loaded.value||initialState();
      if(req.method!=='POST'){send(req,res,200,{...state,etag:loaded.etag});return true;}
      const body=await json(req);
      if(!body||typeof body!=='object'||Array.isArray(body))throw fail(400,'Invalid offer action');
      if(!Object.hasOwn(body,'etag')||body.etag!==loaded.etag)throw fail(409,'Offers changed in another session. Reload before saving.');
      const time=new Date(now()).toISOString();
      if(body.action==='save'){state.draft=validate(body.draft);state.savedAt=time;}
      else if(body.action==='publish'||body.action==='restore'){
        if(body.confirm!==true)throw fail(400,'Confirm the chosen audience before publishing');
        const config=body.action==='restore'?state.history.find(r=>r.id===body.versionId)?.config:state.draft;
        if(!config)throw fail(404,'Offer version not found');
        const revision={id:randomUUID(),version:(state.published?.version||0)+1,config:validate(config,{publishing:true}),publishedAt:time,actor};
        state.published=revision;state.history=[revision,...state.history].slice(0,20);
      }else if(body.action==='pause'){
        if(state.published){state.published={...state.published,version:state.published.version+1,config:{...state.published.config,audience:'HIDDEN'},pausedAt:time};}
      }else throw fail(400,'Unknown offer action');
      state.updatedBy=actor;
      await store.save(state,loaded.etag);
      const saved=await store.load();send(req,res,200,{...saved.value,etag:saved.etag});
    }catch(error){send(req,res,error.status||503,{message:error.status?error.message:'Offers temporarily unavailable',...(path==='/api/hidi/offers'?{visible:false}:{})});}
    return true;
  };
}
