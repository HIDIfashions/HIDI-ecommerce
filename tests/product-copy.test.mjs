import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderProductCopy,narrativeCopy} from '../deploy/admin-tools/product-copy.mjs';
test('paragraphs and manual line breaks retain their structure',()=>assert.equal(renderProductCopy('One\nTwo\n\nThree'),'<p>One<br>Two</p><p>Three</p>'));
test('headings, emphasis and lists render semantic markup',()=>assert.equal(renderProductCopy('# Details\n**Cotton** and *soft*\n\n- Hand wash\n- Dry flat\n1. First\n2. Second'),'<h3>Details</h3><p><strong>Cotton</strong> and <em>soft</em></p><ul><li>Hand wash</li><li>Dry flat</li></ul><ol><li>First</li><li>Second</li></ol>'));
test('HTML and attribute injection remain inert text',()=>{for(const text of ['<img src=x onerror=alert(1)>','<script>alert(1)</script>','**<svg onload=alert(1)>**','[click](javascript:alert(1))']){const html=renderProductCopy(text);assert.doesNotMatch(html,/<(?:img|svg|script|a)[ >]/);}});
test('plain legacy copy and empty values work without migration',()=>{assert.equal(renderProductCopy(null),'');assert.equal(renderProductCopy('Cotton & silk'),'<p>Cotton &amp; silk</p>');assert.equal(narrativeCopy('Royal blue dress\nIncludes: Kurta\nFit: Relaxed\n\nCotton'), 'Royal blue dress\n\nCotton');});
test('admin and storefront use identical renderer bytes',async()=>assert.equal(await readFile(new URL('../deploy/admin-tools/product-copy.mjs',import.meta.url),'utf8'),await readFile(new URL('../apps/web/lib/product-copy.mjs',import.meta.url),'utf8')));

test('production admin handler serves only registered preview assets with private caching and CSP',async()=>{
 const {createServer}=await import('node:http');const {handleQuickTools}=await import('../deploy/admin-tools/handler.mjs');
 const server=createServer((req,res)=>{void handleQuickTools(req,res,new URL(req.url,'http://localhost').pathname).then(handled=>{if(!handled){res.writeHead(404);res.end();}}).catch(error=>{res.writeHead(500);res.end(error.message);});});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
 try{for(const path of ['/admin/product-preview','/admin-tools-assets/product-preview.mjs','/admin-tools-assets/product-preview.css','/admin-tools-assets/product-copy.mjs']){const response=await fetch(base+path);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);assert.equal((await fetch(base+path,{method:'HEAD'})).status,200);assert.equal((await fetch(base+path,{method:'POST'})).status,405);}assert.equal((await fetch(base+'/admin-tools-assets/handler.mjs')).status,404);}
 finally{await new Promise(done=>server.close(done));}
});
