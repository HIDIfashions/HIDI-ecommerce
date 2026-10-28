import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {wrapTypography} from '../deploy/typography/wrap.mjs';
async function exchange({path='/admin/products',headers={},method='GET',respond}){
 const server=createServer((req,res)=>{wrapTypography(req,res,new URL(req.url,'http://localhost').pathname);respond(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{return await new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:server.address().port,path,method,headers},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString()}));});req.on('error',reject);req.end();});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
const html='<html><head><title>HIDI</title></head><body>₹ हिन्दी</body></html>';
test('complete admin HTML gains scoped fonts and correct byte length; cookies survive',async()=>{
 const r=await exchange({respond:(_q,res)=>{res.writeHead(200,{'Content-Type':'text/html','Content-Length':Buffer.byteLength(html),ETag:'"old"','Set-Cookie':['a=b; HttpOnly','c=d; HttpOnly']});res.end(html);}});
 assert.match(r.body,/data-hidi-type-scope="admin"/);assert.equal(Number(r.headers['content-length']),Buffer.byteLength(r.body));assert.equal(r.headers.etag,undefined);assert.equal(r.headers['set-cookie'].length,2);
});
test('streamed HTML is not buffered or rewritten by the early-handler wrapper',async()=>{
 const r=await exchange({respond:(_q,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.write(html.slice(0,22));res.end(html.slice(22));}});assert.equal(r.body,html);
});
test('JSON, RSC, compressed and POST responses stay untouched',async()=>{
 for(const options of [{headers:{rsc:'1'}},{method:'POST'},{type:'application/json'},{encoding:'gzip'}]){
  const r=await exchange({...options,respond:(_q,res)=>{res.writeHead(200,{'Content-Type':options.type||'text/html',...(options.encoding?{'Content-Encoding':options.encoding}:{})});res.end(html);}});assert.equal(r.body,html);
 }
});
test('implicit headers and UTF-8 content remain correct',async()=>{const r=await exchange({respond:(_q,res)=>{res.setHeader('Content-Type','text/html');res.end(html);}});assert.match(r.body,/₹ हिन्दी/);assert.match(r.body,/hidi-published-typography/);});
test('explicit chunking never gains Content-Length',async()=>{const r=await exchange({respond:(_q,res)=>{res.writeHead(200,{'Content-Type':'text/html','Transfer-Encoding':'chunked'});res.end(html);}});assert.equal(r.headers['content-length'],undefined);assert.match(r.body,/hidi-published-typography/);});
test('ordinary storefront response is left to its retained streaming head transformer',async()=>{const r=await exchange({path:'/products/example',respond:(_q,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}});assert.equal(r.body,html);});
