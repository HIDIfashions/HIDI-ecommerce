import {createServer} from 'node:http';
// Read-only test transport: preserve the actual head, then delay its fresh body.
// It never changes the application or its public configuration.
export async function createSlowDocumentProxy(base){
 const target=new URL(base),server=createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,target);if(url.origin!==target.origin||!['GET','HEAD'].includes(request.method)){response.writeHead(403);return response.end();}
   const headers={'accept-encoding':'identity'};for(const name of ['user-agent','accept','range','if-none-match','if-modified-since'])if(request.headers[name])headers[name]=request.headers[name];
   const incoming=await fetch(url,{method:request.method,headers,signal:AbortSignal.timeout(30000)}),clean=Object.fromEntries([...incoming.headers].filter(([name])=>!['content-encoding','content-length','transfer-encoding','connection','set-cookie'].includes(name)));
   if(request.method==='HEAD'){response.writeHead(incoming.status,clean);return response.end();}
   const body=Buffer.from(await incoming.arrayBuffer());response.writeHead(incoming.status,clean);
   const cut=url.pathname==='/'?body.indexOf('</head>'):-1;
   if(cut>=0){response.write(body.subarray(0,cut+7));await new Promise(done=>setTimeout(done,2500));if(!response.destroyed)response.end(body.subarray(cut+7));}
   else response.end(body);
  }catch{if(!response.headersSent)response.writeHead(502);response.end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 return {url:'http://127.0.0.1:'+server.address().port,close(){server.closeAllConnections();server.close();}};
}
