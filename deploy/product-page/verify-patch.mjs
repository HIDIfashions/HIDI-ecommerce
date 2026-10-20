import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require(process.env.HIDI_TYPESCRIPT_MODULE||resolve('apps/web/node_modules/typescript'));
const [base,overlay]=process.argv.slice(2),plan=JSON.parse(readFileSync('evidence/product-page-release/patch.json','utf8'));
if(plan.kind==='compact-mobile-css'){
 const name='apps/web/.next/server/app/products/[slug]/page.js',before=readFileSync(join(base,name),'utf8'),after=readFileSync(join(overlay,name),'utf8');
 assert.equal(after,before.replace(plan.oldUrl,plan.newUrl),'Only the route stylesheet reference may change');
 const css=readFileSync(join(overlay,plan.newCssName),'utf8');assert(css.includes('clamp(180px, 24svh, 200px)'));
 assert.equal(plan.allowedFiles.length,2);console.log('CSS-only route update preserves all product factories and facts');process.exit(0);
}
function inventory(text){const tree=ts.createSourceFile('route.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),modules=new Map();function walk(n){if(ts.isPropertyAssignment(n)&&/^\d+$/.test(n.name.getText(tree))&&ts.isArrowFunction(n.initializer)){modules.set(n.name.getText(tree),n.initializer.getText(tree));return;}ts.forEachChild(n,walk);}walk(tree);return modules;}
for(const [oldName,newName,count] of [[plan.retainedClientChunk,plan.newClientChunk,4],['apps/web/.next/server/app/products/[slug]/page.js','apps/web/.next/server/app/products/[slug]/page.js',5]]){
 const before=inventory(readFileSync(join(base,oldName),'utf8')),after=inventory(readFileSync(join(overlay,newName),'utf8'));
 assert.deepEqual([...before.keys()],[...after.keys()],'No webpack boundaries may be added, removed or renumbered');
 const delta=[...before.keys()].filter(id=>before.get(id)!==after.get(id));if(plan.kind!=='isolated-component-refresh')assert.equal(delta.length,count,'Only reviewed PDP factories may change');
 else assert(delta.length>=2 && delta.length<=count,'Only the isolated product components and stylesheet reference may change: '+oldName+' '+JSON.stringify(delta));
 const names=delta.map(id=>before.get(id));
 if(plan.kind==='isolated-component-refresh'){
  for(const component of ['ProductQualitySummary','ProductInfoAccordion'])assert(names.some(text=>text.includes('exports.'+component+' =')));
  for(const id of delta){const original=before.get(id);assert(original.startsWith('(module,exports,__webpack_require__)=>{Object.assign(exports,') || (oldName.endsWith('/page.js') && original.includes('function HidiDetails(product)') && after.get(id)===original.replace(plan.oldUrl,plan.newUrl)),'Every change must be an isolated component or the single stylesheet reference');}
 }else for(const component of ['AddToCart','ProductMedia','ProductQualitySummary','ProductInfoAccordion'])assert(names.some(text=>text.includes(component+':')));
 for(const id of delta){const text=after.get(id);assert(!text.includes('process.env'),'No new environment substitutions');}
}
console.log('Protected webpack factories and route-only overlay verified');
