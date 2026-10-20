import {createSecureServer} from 'node:http2';
import {request as httpRequest} from 'node:http';
import {X509Certificate,createHash} from 'node:crypto';
const hop=new Set(['connection','keep-alive','proxy-connection','transfer-encoding','upgrade','host']);
const clean=headers=>Object.fromEntries(Object.entries(headers).filter(([name])=>!name.startsWith(':')&&!hop.has(name.toLowerCase())));
// Only the read-only candidate fixture uses this local TLS endpoint. The image
// retains its existing Azure ingress and production certificate configuration.
export async function createH2Fixture({key,cert,port,targetPort,productionIdentity=false}){
 if(![port,targetPort].every(value=>Number.isInteger(value)&&value>0&&value<65536))throw Error('Invalid fixture ports');
 const sessions=new Set(),server=createSecureServer({key,cert,allowHTTP1:false},(request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(new URL(request.url,'https://localhost').pathname==='/api/hidi/performance'?204:403);return response.end();}
  const headers={...clean(request.headers),...(productionIdentity?{host:'hidiindia.com','x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}:{})};
  const next=httpRequest({hostname:'127.0.0.1',port:targetPort,path:request.url,method:request.method,headers},incoming=>{
   response.writeHead(incoming.statusCode,clean(incoming.headers));incoming.on('error',()=>response.destroy());incoming.pipe(response);
  });
  next.on('error',()=>{if(response.headersSent)response.destroy();else{response.writeHead(502);response.end();}});request.on('error',()=>next.destroy());request.pipe(next);
 });
 server.on('session',session=>{sessions.add(session);session.once('close',()=>sessions.delete(session));});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
 const spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
 return {url:productionIdentity?'https://hidiindia.com/':'https://127.0.0.1:'+port+'/',spki,close(){for(const session of sessions)session.destroy();server.close();}};
}
