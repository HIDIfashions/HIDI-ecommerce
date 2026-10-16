import {readFile} from 'node:fs/promises';
const assets=new Map(['model.mjs','admin.mjs','storefront.mjs','styles.css'].map(name=>['/pricing-assets/'+name,name]));
export function createPricingHandler({origin,requestFetch=fetch}) {
  return async(req,res,path)=>{
    const file=path==='/admin/product-pricing'?'admin.html':assets.get(path);if(!file)return false;
    let status=200,body,type=file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/javascript';
    try {
      if(!['GET','HEAD'].includes(req.method))throw Object.assign(Error('Method not allowed'),{status:405});
      if(file==='admin.html'){
        if(!req.headers.cookie)throw Object.assign(Error('Owner sign-in required'),{status:401});
        const response=await requestFetch(new URL('/api/admin/session',origin),{headers:{cookie:req.headers.cookie},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(5000)});
        if(!response.ok)throw Object.assign(Error('Owner sign-in required'),{status:401});
        const session=await response.json();if(session?.admin?.role!=='OWNER')throw Object.assign(Error('Owner access required'),{status:403});
      }
      body=await readFile(new URL(file,import.meta.url));
    }catch(e){status=e.status||503;type='text/plain';body=Buffer.from(e.status?e.message:'Pricing temporarily unavailable');}
    res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Content-Length':body.length,'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    res.end(req.method==='HEAD'?undefined:body);return true;
  };
}
