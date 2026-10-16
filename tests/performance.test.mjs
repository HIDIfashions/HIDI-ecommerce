import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { encodingFor, sendBuffer, streamHtml, htmlTransform } from '../deploy/performance/delivery.mjs';
import { createPerformanceHandler, validateMetric } from '../deploy/performance/metrics.mjs';

async function server(work) {
  const http = createServer(work); http.listen(0, '127.0.0.1'); await once(http, 'listening');
  return { http, base: 'http://127.0.0.1:' + http.address().port };
}
async function get(base, headers = {}) {
  return new Promise((resolve, reject) => {
    request(base, { headers }, res => { const chunks = []; res.on('data', x => chunks.push(x)); res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) })); }).on('error', reject).end();
  });
}
test('negotiation respects q=0 and keeps gzip-only/identity clients usable', () => {
  const choose = value => encodingFor({ headers: { 'accept-encoding': value } });
  assert.equal(choose('gzip, br'), 'br'); assert.equal(choose('br;q=0, gzip;q=.5'), 'gzip');
  assert.equal(choose('gzip;q=0, br;q=0'), ''); assert.equal(choose('gzip;q=.2, br;q=.1'), 'gzip'); assert.equal(choose(''), '');
});
test('real HTTP gzip/Brotli preserve bytes, Vary, HEAD and media ranges', async () => {
  const body = Buffer.from('<html>हैदराबाद ' + 'hello '.repeat(2000) + '</html>');
  const {http,base} = await server((req,res) => { res.setHeader('Content-Length',body.length); sendBuffer(req,res,req.headers.range?206:200,{'content-type':'text/html','content-length':body.length,vary:'RSC, Next-Router-State-Tree',etag:'"master"',...(req.headers.range?{'content-range':'bytes 0-9/100'}:{})},body); });
  try {
    for (const [accept, encoding, decode] of [['gzip','gzip',gunzipSync],['br, gzip','br',brotliDecompressSync]]) {
      const result = await get(base, { 'Accept-Encoding': accept }); assert.equal(result.headers['content-encoding'],encoding); assert.deepEqual(decode(result.body),body);
      assert(result.body.length<body.length/5); assert.equal(result.headers['content-length'],undefined); assert.match(result.headers.vary,/RSC/); assert.match(result.headers.vary,/Accept-Encoding/); assert.equal(result.headers.etag,'W/"master"');
    }
    const plain=await get(base,{'Accept-Encoding':'gzip;q=0,br;q=0'});assert.deepEqual(plain.body,body);assert.equal(plain.headers['content-encoding'],undefined);
    const range=await get(base,{'Accept-Encoding':'gzip',Range:'bytes=0-9'});assert.equal(range.headers['content-encoding'],undefined);assert.deepEqual(range.body,body);
    const head=await fetch(base,{method:'HEAD',headers:{'Accept-Encoding':'gzip'}});assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(Number(head.headers.get('content-length')),body.length);
  } finally {http.close();}
});
test('HTML arrives before upstream completion, with split Unicode and head/body hooks preserved', async () => {
  let completed=false;
  const {http,base}=await server((req,res)=>{
    const incoming=Readable.from((async function*(){ yield Buffer.from('<html><head><title>HIDI</title></he'); yield Buffer.from('ad><body>हैदराबाद'+'.'.repeat(800)); await new Promise(done=>setTimeout(done,150)); completed=true; yield Buffer.from('</body></html>'); })());
    streamHtml(req,res,incoming,200,{'content-type':'text/html','content-length':'1',etag:'"upstream"'}, {head:head=>head.replace('</head>','<style>body{color:red}</style></head>'),tail:tail=>tail.replace('</body>','<script src="/links.js"></script></body>')});
  });
  try {
    const bytes=await new Promise((resolve,reject)=>request(base,{headers:{'Accept-Encoding':'gzip'}},res=>{
      const chunks=[];let first=true;res.on('data',x=>{if(first){first=false;assert.equal(completed,false,'Whole-body buffering reintroduced');}chunks.push(x);});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
    }).on('error',reject).end());
    const html=gunzipSync(bytes).toString(); assert.match(html,/हैदराबाद/);assert.match(html,/<style>/);assert.match(html,/<script src="\/links.js"><\/script><\/body>/);
  } finally {http.close();}
});
test('overlarge/missing head streams without losing bytes or retaining an unbounded cache', async () => {
  const text='x'.repeat(150001)+'🚚'.repeat(300)+'हैदराबाद'; let captured;
  const transform=htmlTransform(x=>'<meta name="hook">'+x,x=>x+'<script></script>',bytes=>captured=bytes,1000);
  const chunks=[];transform.on('data',x=>chunks.push(x));Readable.from([Buffer.from(text)]).pipe(transform);await once(transform,'end');
  assert.equal(Buffer.concat(chunks).toString(),'<meta name="hook">'+text+'<script></script>');assert.equal(captured,null);
});
test('first-party metrics reject PII/unknown fields, cross-origin and oversized bodies; expose no readings publicly', async () => {
  const metric={route:'collection',device:'mobile',name:'LCP',value:1200};const logs=[];
  assert(validateMetric(metric));for(const bad of [{...metric,email:'person@example.invalid'},{...metric,route:'/account?id=secret'},{...metric,value:Infinity},{...metric,name:'SQL'}])assert(!validateMetric(bad));
  const handler=createPerformanceHandler({origin:new URL('http://localhost'),log:value=>logs.push(value)});
  const {http,base}=await server((req,res)=>handler.handle(req,res,new URL(req.url,base).pathname).catch(()=>res.writeHead(500).end()));
  try {
    const post=body=>fetch(base+'/api/hidi/performance',{method:'POST',headers:{Origin:base,'Content-Type':'text/plain'},body:JSON.stringify(body)});
    assert.equal((await post(metric)).status,204);assert.equal((await post({...metric,customerId:'private'})).status,400);assert.equal((await post({...metric,value:-1})).status,400);
    assert.equal((await fetch(base+'/api/hidi/performance')).status,405);
    assert.equal((await fetch(base+'/api/hidi/performance',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'text/plain'},body:JSON.stringify(metric)})).status,403);
    assert.equal((await post({x:'x'.repeat(1000)})).status,400);
    handler.flush();assert.equal(logs[0].samples,1);assert.deepEqual(logs[0].groups['collection:mobile:LCP'],{count:1,good:1,needsImprovement:0,poor:0,sum:1200,max:1200});
    const logo=await fetch(base+handler.logo);assert.match(logo.headers.get('cache-control'),/immutable/);assert.match(logo.headers.get('content-type'),/svg/);
  } finally {http.close();}
});
