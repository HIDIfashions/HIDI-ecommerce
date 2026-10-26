import { readFile } from 'node:fs/promises';
const cookieName='hidi_admin_access';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const assets=new Map(['activity.mjs','login.mjs','sales.mjs','styles.css'].map(n=>['/admin-security-assets/'+n,n]));
export function createAdminSecurityHandler({apiBase=process.env.API_URL,requestFetch=fetch}={}) {
  return async (req,res,path)=>{
    const session=path==='/api/admin/session',activity=path==='/api/admin/activity',sales=path==='/api/admin/sales-deletion';
    const login=path==='/admin/sign-in',page=path==='/admin/sales-delete';
    if(!session&&!activity&&!sales&&!login&&!page&&!assets.has(path))return false;
    let status=200,type='application/json',body,cookies=[];
    const secure=process.env.NODE_ENV==='production'?'; Secure':'';
    const cookie=(name,value,clear=false)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure}${clear?'; Max-Age=0':''}`;
    const clear=()=>{cookies=['hidi_admin_access','hidi_admin_refresh','hidi_admin_session'].map(n=>cookie(n,'',true));};
    const api=async(path,method='GET',payload,token)=>{
      if(!apiBase)throw fail(503,'Admin API is not configured');
      const r=await requestFetch(apiBase.replace(/\/$/,'')+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(sales?120000:20000)});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw fail(r.status,data.message||'Admin request failed');return data;
    };
    try {
      if(assets.has(path)||login){
        if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method not allowed');
        type=login?'text/html':path.endsWith('.css')?'text/css':'text/javascript';
        body=await readFile(new URL(login?'login.html':assets.get(path),import.meta.url));
      } else {
        if(!['GET','HEAD','POST','PUT','DELETE'].includes(req.method))throw fail(405,'Method not allowed');
        if(!['GET','HEAD'].includes(req.method)){
          let source;try{source=new URL(req.headers.origin);}catch{throw fail(403,'Same-origin request required');}
          if(req.headers['sec-fetch-site']==='cross-site'||source.host!==req.headers.host||!['http:','https:'].includes(source.protocol))throw fail(403,'Same-origin request required');
        }
        const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));
        let token='';try{token=raw?decodeURIComponent(raw.slice(cookieName.length+1)):'';}catch{}
        const readBody=async()=>{
          if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'Use application/json');
          const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>8192)throw fail(413,'Request too large');chunks.push(c);}
          try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'Invalid JSON');}
        };
        if(session&&req.method==='POST'){
          const input=await readBody();
          if(!input||Object.keys(input).some(k=>!['email','token'].includes(k)))throw fail(401,'A fresh email OTP is required for every login');
          const verified=await api('/auth/admin/otp/verify','POST',input);
          if(!/^hidi_admin_[a-f0-9]{64}$/.test(verified.sessionToken||''))throw fail(502,'Invalid admin session');
          // Replacing a login also revokes the previous session on this device.
          if(token)await api('/auth/admin/session','DELETE',undefined,token);
          clear();cookies.push(cookie(cookieName,verified.sessionToken));
          body=JSON.stringify({ok:true,admin:verified.admin,idleTimeoutSeconds:3600});
        }else if(session&&req.method==='DELETE'){
          await api('/auth/admin/session','DELETE',undefined,token);clear();body='{"ok":true}';
        }else{
          if(!/^hidi_admin_[a-f0-9]{64}$/.test(token))throw fail(401,'Enter a new email OTP to sign in');
          if(session&&['GET','HEAD','PUT'].includes(req.method))body=JSON.stringify(await api('/admin/me','GET',undefined,token));
          else if(activity&&req.method==='POST')body=JSON.stringify(await api('/auth/admin/activity','POST',{},token));
          else if(page&&['GET','HEAD'].includes(req.method)){
            const verified=await api('/admin/me','GET',undefined,token);
            if(verified.admin?.role!=='OWNER'||verified.admin?.email?.toLowerCase()!=='fashionshidi@gmail.com')throw fail(403,'Sales deletion is restricted to fashionshidi@gmail.com');
            type='text/html';body=await readFile(new URL('sales.html',import.meta.url));
          }else if(sales&&['GET','HEAD','DELETE'].includes(req.method)){
            const search=new URL(req.url,'http://local').search;
            body=JSON.stringify(await api('/admin/sales-deletion'+search,req.method==='HEAD'?'GET':req.method,req.method==='DELETE'?await readBody():undefined,token));
          }else throw fail(405,'Method not allowed');
        }
      }
    }catch(error){status=error.status||503;type='application/json';body=JSON.stringify({message:error.status?error.message:'Admin service temporarily unavailable. Retry shortly.'});if(status===401)clear();}
    body=Buffer.isBuffer(body)?body:Buffer.from(body);
    res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Content-Length':body.length,'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',...(cookies.length?{'Set-Cookie':cookies}:{}),'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    res.end(req.method==='HEAD'?undefined:body);return true;
  };
}
