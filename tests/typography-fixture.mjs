// Local test server only. It never connects to the production API or storage.
import {createServer} from 'node:http';
import {createTypographyHandler,injectTypography} from '../deploy/typography/handler.mjs';
const blobs=new Map();let serial=0;
export function storageFetch(url,options={}){
  const u=new URL(url);if(u.hostname==='169.254.169.254')return Promise.resolve(new Response(JSON.stringify({access_token:'fixture-only',expires_in:3600})));
  if(u.searchParams.get('restype')==='container')return Promise.resolve(new Response(null,{status:200}));
  const key=u.pathname,old=blobs.get(key),headers=new Headers(options.headers);
  if(options.method==='PUT'){
    if(old&&headers.get('if-none-match')==='*'||headers.has('if-match')&&headers.get('if-match')!==old?.etag)return Promise.resolve(new Response(null,{status:412}));
    const etag='"'+(++serial)+'"';blobs.set(key,{body:options.body,etag});return Promise.resolve(new Response(null,{status:201,headers:{etag}}));
  }
  return Promise.resolve(old?new Response(old.body,{headers:{etag:old.etag}}):new Response(null,{status:404}));
}
export function sessionFetch(_url,options={}){return Promise.resolve(new Headers(options.headers).get('cookie')?.includes('typography-owner=1')?new Response(JSON.stringify({admin:{id:'fixture-owner',role:'OWNER',displayName:'Fixture owner'}})):new Response('{}',{status:401}));}
if(process.argv.includes('--serve')){
  const native=globalThis.fetch;globalThis.fetch=(url,options)=>new URL(url).hostname==='169.254.169.254'||new URL(url).hostname==='typographyfixture.blob.core.windows.net'?storageFetch(url,options):native(url,options);
  process.env.AZURE_STORAGE_ACCOUNT='typographyfixture';delete process.env.IDENTITY_ENDPOINT;delete process.env.AZURE_STORAGE_BLOB_ENDPOINT;
  const handler=createTypographyHandler({origin:'http://127.0.0.1',requestFetch:sessionFetch});
  const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(await handler(req,res,path))return;
    const html=injectTypography('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title></head><body><h1>Everyday Indian wear</h1><p>Comfortable cotton</p><div class="pdp-title-row"><h1>Aara Sage Kurta Set</h1></div><button>Add to bag</button><input aria-label="Delivery postcode" value="600001"><nav><a href="/">Home</a></nav></body></html>',path.startsWith('/admin')?'admin':'storefront');res.writeHead(200,{'Content-Type':'text/html'});res.end(html);
  });server.listen(3198,'127.0.0.1',()=>console.log('fixture ready'));
}
