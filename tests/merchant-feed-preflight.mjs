import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {buildFeed,loadProducts} from '../deploy/merchant-feed/feed.mjs';
import {probe} from '../deploy/merchant-feed/probe.mjs';
const products=await loadProducts('https://hidiindia.com/api/store/products');
const feed=buildFeed(products).xml,script=await readFile(new URL('../deploy/merchant-feed/variant.js',import.meta.url));
const server=createServer(async(req,res)=>{
 try {
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(403);return res.end();}
  if(req.url==='/google-products.xml'){res.writeHead(200,{'content-type':'application/xml; charset=utf-8','content-length':Buffer.byteLength(feed)});return res.end(req.method==='HEAD'?undefined:feed);}
  if(req.url==='/hidi-merchant-variant-v1.js'){res.writeHead(200,{'content-type':'application/javascript'});return res.end(req.method==='HEAD'?undefined:script);}
  const result=await fetch('https://hidiindia.com'+req.url,{headers:{Accept:req.headers.accept||'*/*'},redirect:'manual'});
  let body=Buffer.from(await result.arrayBuffer());const type=result.headers.get('content-type')||'';
  if(type.includes('text/html')&&req.url.startsWith('/products/')&&req.url.includes('variant='))body=Buffer.from(body.toString().replace('</head>','<script defer src="/hidi-merchant-variant-v1.js"></script></head>'));
  const headers=Object.fromEntries([...result.headers].filter(([k])=>!['content-encoding','content-length','transfer-encoding','connection'].includes(k)));headers['content-length']=body.length;
  res.writeHead(result.status,headers);res.end(req.method==='HEAD'?undefined:body);
 }catch(e){console.error(e.message);res.writeHead(502);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
try {console.log(await probe('http://127.0.0.1:'+server.address().port,'evidence/merchant-preflight',{products,preview:true}));}
finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
