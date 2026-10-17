import test from 'node:test';import assert from 'node:assert/strict';import {transformPaintExperiment,encodeExperimentResponse} from './paint-experiments.mjs';
import {runInNewContext} from 'node:vm';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
const origin='https://hidi-test.azurestaticapps.net',html='<head><link rel="preload" href="'+origin+'/media-performance/assets/poster-123.avif"><link rel="modulepreload" href="'+origin+'/assets/index-123.js"><script>const url=window.__HidiAssetUrl(path);</script><script type="module" crossorigin="anonymous" integrity="sha256-original" src="'+origin+'/assets/index-123.js" data-hidi-mirror-app="/assets/index-123.js" onerror="window.__HidiAppFallback()"></script></head><body>Original contents</body>';
test('diagnostic variants isolate connection reuse and application fetch order without altering content or integrity',()=>{
 assert.equal(transformPaintExperiment(html,'control',{origin}),html);
 const local=transformPaintExperiment(html,'poster-origin',{origin});assert(local.includes('href="/media-performance/assets/poster-123.avif"'));assert(local.includes('src="'+origin+'/assets/index-123.js"'));assert(local.includes('path.endsWith(".avif")?path:'));
 const first=transformPaintExperiment(html,'poster-first',{origin});assert(!first.includes('rel="modulepreload"'));assert(first.includes('data-hidi-queued-src="'+origin+'/assets/index-123.js"'));assert(first.includes('integrity="sha256-original"'));assert(first.includes('onerror="window.__HidiAppFallback()"'));assert(first.includes('window.__HidiNativePosterReady'));assert(first.includes('setTimeout(start,1200)'));assert(first.includes('Original contents'));
 assert.throws(()=>transformPaintExperiment(html,'other',{origin}));assert.throws(()=>transformPaintExperiment('<body></body>','poster-first',{origin}));
});
test('external logo comparison reuses the exact preloaded file without changing other image bytes or markup',()=>{
 const logo='/media-performance/assets/logo-0123456789abcdef.png',input='<head><link rel="preload" href="'+logo+'"></head><body><img width="265" src="data:image/png;base64,YWJj" alt="HIDI India"></body>';
 const output=transformPaintExperiment(input,'external-logo',{origin});assert(output.includes('src="'+logo+'"'));assert(output.includes('width="265"'));assert(output.includes('alt="HIDI India"'));assert(!output.includes('data:image/png'));assert.throws(()=>transformPaintExperiment('<head></head>','external-logo',{origin}));
});
test('diagnostic fetch ordering waits for both AVIF selection and poster paint, with one bounded fallback',async()=>{
 let avifReady,posterReady;const scripts=[],timers=[];
 const window={__HidiAvifSupport:new Promise(done=>avifReady=done)};
 const original={dataset:{hidiQueuedSrc:origin+'/assets/index-123.js'},attributes:[{name:'type',value:'application/x-hidi-deferred-module'},{name:'integrity',value:'sha256-original'},{name:'data-hidi-queued-src',value:origin+'/assets/index-123.js'}]};
 const document={querySelector:()=>original,createElement:()=>({setAttribute(name,value){this[name]=value;}}),head:{append:script=>scripts.push(script)}};
 const code=transformPaintExperiment(html,'poster-first',{origin}).match(/<script data-hidi-diagnostic-boot="true">([\s\S]*?)<\/script>/)[1];
 runInNewContext(code,{window,document,Promise,setTimeout:(fn,ms)=>timers.push({fn,ms})});
 await new Promise(setImmediate);assert.equal(scripts.length,0);
 window.__HidiNativePosterReady=new Promise(done=>posterReady=done);avifReady(true);await new Promise(setImmediate);assert.equal(scripts.length,0);
 posterReady();await new Promise(setImmediate);assert.equal(scripts.length,1);assert.equal(scripts[0].integrity,'sha256-original');assert.equal(scripts[0].src,original.dataset.hidiQueuedSrc);timers[0].fn();assert.equal(scripts.length,1);assert.equal(timers[0].ms,1200);
});
test('rewritten fixture responses never combine transfer encoding and length, and preserve decoded bytes and security headers',()=>{
 const original={'transfer-encoding':'chunked','content-length':'999','etag':'old','content-security-policy':"default-src 'self'",vary:'Accept-Encoding'};
 for(const encoding of ['identity','gzip','br']){
  const result=encodeExperimentResponse(original,html,encoding);assert(!Object.hasOwn(result.headers,'transfer-encoding'));assert(!Object.hasOwn(result.headers,'etag'));assert.equal(result.headers['content-length'],result.body.length);assert.equal(result.headers['content-security-policy'],original['content-security-policy']);
  assert.equal((encoding==='br'?brotliDecompressSync(result.body):encoding==='gzip'?gunzipSync(result.body):result.body).toString(),html);
 }
 assert.equal(original['transfer-encoding'],'chunked');
});
