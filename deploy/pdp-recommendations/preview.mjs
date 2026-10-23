import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {snapshotServer} from '../pdp-layout/snapshot-server.mjs';
import {transformHtml,transformFlight,transformBundle} from './transform.mjs';
const root='outputs/pdp-recommendations';await mkdir(root,{recursive:true});
const css=await readFile('apps/web/app/pdp-recommendations.css','utf8');
const snapshot=await snapshotServer({directory:root+'/snapshot',css:'',candidate:false});
const server=createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end('Preview only');return;}
 try{
  const response=await snapshot.pull(req.url,req.headers);let body=response.body;
  if(response.contentType.includes('text/html')){
   let html=transformHtml(body.toString(),css);
   // Preview the landing bundle through this read-only adapter too. Production
   // uses a mirrored immutable URL with SRI; its existing bundle stays untouched.
   html=html.replace(/https:\/\/zealous-bay-013205300\.1\.azurestaticapps\.net\/assets\//g,'/assets/');
   html=html.replace(/(<script\b[^>]*data-hidi-queued-src="\/assets\/[^>]*?) integrity="[^"]+"/g,'$1');
   body=Buffer.from(html);
  }
  else if(response.contentType.includes('text/x-component'))body=Buffer.from(transformFlight(body.toString()));
  else if(response.contentType.includes('javascript'))body=Buffer.from(transformBundle(body.toString()));
  res.writeHead(response.status,{'Content-Type':response.contentType,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}).end(req.method==='HEAD'?undefined:body);
 }catch(e){console.error(e);res.writeHead(502).end('Preview response failed');}
});
server.listen(62654,'127.0.0.1',async()=>{await writeFile(root+'/preview.json',JSON.stringify({base:'http://127.0.0.1:62654',productionChanged:false}));console.log('Preview http://127.0.0.1:62654/products/kur-036-women-s-wine-purple-embroidered-kurta-set-with-dupatta');});
setInterval(()=>snapshot.save().catch(console.error),10000).unref();
