import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const copy=JSON.parse(readFileSync('deploy/search-priority/copy.json','utf8'));
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'hidi-clean-patch-')),base=join(dir,'base'),out=join(dir,'overlay');
 const factory='(module,exports,__webpack_require__)=>{Object.assign(exports,(()=>{exports.ProductInfoAccordion = function OriginalAccordion(){};return exports;})());}';
 const product='const modules={123:'+factory+',456:(m,e,r)=>{e.AddToCart="PRESERVE_PURCHASING";}};const page=[(0,d.jsx)(q.ProductQualitySummary,{product:e}),HidiDetails(e).narrative&&(0,d.jsxs)("details",{className:"hidi-pdp-description",children:[]}),(0,d.jsx)(k.ProductInfoAccordion,{product:e}),"/_next/static/css/hidi-product-page-aaaaaaaaaaaaaaaa.css"];';
 const collection='const i="'+copy.collectionHeading+'";const page=[(0,d.jsxs)("header",{className:"collection-header",children:[(0,d.jsx)("h1",{children:i}),(0,d.jsx)("p",{children:'+JSON.stringify(copy.intro)+'})]}),(0,d.jsx)(x.CollectionBrowser,{products:p})];';
 const files={
  'server.mjs':'const storefrontLayerFix = `<style data-hidi-storefront-layer-fix="true">.keep{color:red}</style>`;const checkout="KEEP";',
  'apps/web/.next/server/app/products/[slug]/page.js':product,
  'apps/web/.next/server/app/products/[slug]/page_client-reference-manifest.js':'self.manifest={chunks:["static/chunks/app/products/%5Bslug%5D/page-bbbbbbbbbbbbbbbb.js"]}',
  'apps/web/.next/static/chunks/app/products/[slug]/page-bbbbbbbbbbbbbbbb.js':'const modules={123:'+factory+',456:(m,e,r)=>{e.AddToCart="PRESERVE_PURCHASING";}};',
  'apps/web/.next/static/css/hidi-product-page-aaaaaaaaaaaaaaaa.css':'.keep-product{color:red}',
  'apps/web/.next/server/app/collections/all/page.js':collection,
 };
 for(const [name,text] of Object.entries(files)){mkdirSync(dirname(join(base,name)),{recursive:true});writeFileSync(join(base,name),text)}
 return {base,out,files};
}
test('only accordion boundaries and approved collection markup change; old assets remain',()=>{
 const {base,out,files}=fixture();const result=spawnSync(process.execPath,['deploy/clean-shopping/patch.mjs',base,out],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const plan=JSON.parse(readFileSync('evidence/clean-shopping/patch.json','utf8'));assert.equal(plan.allowedFiles.length,6);
 const server=readFileSync(join(out,'apps/web/.next/server/app/products/[slug]/page.js'),'utf8');assert(server.includes('PRESERVE_PURCHASING'));assert(!server.includes('(q.ProductQualitySummary,'));
 for(const phrase of ['Fabric & design','What’s included','Size & fit','Care instructions','Delivery & returns'])assert(server.includes(phrase));
 const all=readFileSync(join(out,'apps/web/.next/server/app/collections/all/page.js'),'utf8');assert(!all.includes(copy.intro));assert(all.indexOf('hidi-collection-guidance')>all.indexOf('x.CollectionBrowser'));
 for(const name of plan.allowedFiles)if(name.endsWith('.js')||name.endsWith('.mjs'))assert.equal(spawnSync(process.execPath,['--check',join(out,name)],{encoding:'utf8'}).status,0,name);
 const css=readFileSync(join(out,plan.allowedFiles.find(n=>n.endsWith('.css'))),'utf8');assert(css.startsWith('.keep-product{color:red}'));
 for(const [name,text] of Object.entries(files))assert.equal(readFileSync(join(base,name),'utf8'),text,'Baseline mutated: '+name);
});
test('changed collection anchor prevents packaging',()=>{
 const {base,out}=fixture(),file=join(base,'apps/web/.next/server/app/collections/all/page.js');writeFileSync(file,readFileSync(file,'utf8').replace(copy.intro,'Unexpected live content'));
 assert.notEqual(spawnSync(process.execPath,['deploy/clean-shopping/patch.mjs',base,out],{encoding:'utf8'}).status,0);
});
