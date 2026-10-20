import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
const { default: ts } = await import(process.env.HIDI_TYPESCRIPT_MODULE ? pathToFileURL(process.env.HIDI_TYPESCRIPT_MODULE).href : '../apps/web/node_modules/typescript/lib/typescript.js');
const read = path => readFile(new URL(path,import.meta.url),'utf8');
const compile = code => ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url = code => 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const facts= url(compile(await read('../apps/web/lib/product-facts.ts')));
const reviewed=JSON.parse(await read('../apps/web/lib/pdp-reviewed-specifications.json'));
let source=await read('../apps/web/lib/pdp-information.ts');
source=source.replace('"./product-facts"',JSON.stringify(facts));
const {pdpInformation: baseInformation}=await import(url(compile(source)));
const reviewSource=(await read('../apps/web/lib/pdp-source-specifications.ts')).replace('import reviewedSpecifications from "./pdp-reviewed-specifications.json";', 'const reviewedSpecifications = '+JSON.stringify(reviewed)+';');
const {reviewedPdpSpecifications}=await import(url(compile(reviewSource)));
const pdpInformation=product=>baseInformation(product,reviewedPdpSpecifications(product));
const sample=JSON.parse(await read('./fixtures/pdp-refinement/product.json'));
test('fuchsia page adds six workbook specifications without resolving disputed fabric or fit',()=>{
 const info=pdpInformation(sample);
 assert.equal(info.specifications.length,6);
 assert.equal(info.specifications.find(x=>x.label==='Neckline').value,'Mandarin Collar with V-Slit');
 assert.equal(info.specifications.find(x=>x.label==='Sleeves').value,'Three-Quarter Sleeves');
 assert.equal(info.fabric,'Cotton');assert.equal(info.fit,null);assert.equal(info.model,null);
 assert.equal(sample.variants.every(v=>v.bustMm===null&&v.garmentLengthMm===null),true);
});
test('changed catalogue identity or copy invalidates a dated source review',()=>{
 for(const change of [{id:'another-product'},{name:'Different garment'},{fabric:'Silk'},{description:'Updated specifications'},{slug:'unknown-style'},{variants:sample.variants.map(v=>({...v,sku:'unmatched-style'}))}])assert.deepEqual(pdpInformation({...sample,...change}).specifications,[]);
});
test('every displayed specification has an exact audited worksheet row and no fabricated measurements',async()=>{
 const audit=JSON.parse(await read('../docs/product-data-audit.json'));
 assert.equal(audit.summary.publishedProducts,54);assert.equal(audit.summary.variants,247);assert.equal(audit.summary.variantsWithAnyMeasurement,0);
 for(const [slug,record] of Object.entries(reviewed)){
  const entry=audit.products.find(p=>p.slug===slug);assert.ok(entry.sourceMatch);
  for(const spec of record.specifications){assert.ok(spec.row>=entry.sourceMatch.startRow&&spec.row<=entry.sourceMatch.endRow);assert.ok(entry.confirmedSpecifications.some(x=>x.row===spec.row&&x.label===spec.label&&x.value===spec.value));assert.doesNotMatch(spec.label,/bust|waist|hip|shoulder|inseam|outseam/i);}
 }
});

test('lining additions require an explicit source statement and do not assert fibre percentages',()=>{
 for(const code of ['HIDI_056','HIDI_057','HIDI_058']){
  const record=Object.values(reviewed).find(r=>r.styleCode===code);
  const lining=record.specifications.find(s=>s.label==='Lining');
  assert.equal(lining.value,'Included');assert.match(lining.sourceValue,/with lining/i);
  assert.equal(record.specifications.some(s=>/composition|percent/i.test(s.label)),false);
 }
});

 test('display titles shorten published wording without changing catalogue names',()=>{
  const name='2 Piece Embroidered Sleeveless Kurta Set & Bottom Straight Pants';
  const product={...sample,slug:'hidi-054-red-embroidered-kurta-with-pants',name,variants:sample.variants.map(v=>({...v,color:'Red'}))};
  assert.equal(baseInformation(product).title,'Red Embroidered Sleeveless Kurta Set');assert.equal(baseInformation(product).fit,null);assert.equal(baseInformation(product).includes,'Kurta + straight pants · 2 pieces');assert.equal(product.name,name);
  assert.equal(baseInformation({...product,slug:'other-style'}).title,'Embroidered Sleeveless Kurta Set with Straight Pants');
  assert.equal(baseInformation({...product,name:'New product name'}).title,'New product name');
 });
