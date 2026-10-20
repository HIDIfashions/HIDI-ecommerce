import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require(process.env.HIDI_TYPESCRIPT_MODULE||resolve('apps/web/node_modules/typescript'));
const [base,overlay]=process.argv.slice(2),plan=JSON.parse(readFileSync('evidence/product-page-release/patch.json','utf8'));
function inventory(text){const tree=ts.createSourceFile('route.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),modules=new Map();function walk(n){if(ts.isPropertyAssignment(n)&&/^\d+$/.test(n.name.getText(tree))&&ts.isArrowFunction(n.initializer)){modules.set(n.name.getText(tree),n.initializer.getText(tree));return;}ts.forEachChild(n,walk);}walk(tree);return modules;}
for(const [oldName,newName,count] of [[plan.retainedClientChunk,plan.newClientChunk,4],['apps/web/.next/server/app/products/[slug]/page.js','apps/web/.next/server/app/products/[slug]/page.js',5]]){
 const before=inventory(readFileSync(join(base,oldName),'utf8')),after=inventory(readFileSync(join(overlay,newName),'utf8'));
 assert.deepEqual([...before.keys()],[...after.keys()],'No webpack boundaries may be added, removed or renumbered');
 const delta=[...before.keys()].filter(id=>before.get(id)!==after.get(id));assert.equal(delta.length,count,'Only reviewed PDP factories may change');
 const names=delta.map(id=>before.get(id));
 for(const component of ['AddToCart','ProductMedia','ProductQualitySummary','ProductInfoAccordion'])assert(names.some(text=>text.includes(component+':')));
 for(const id of delta){const text=after.get(id);assert(!text.includes('process.env'),'No new environment substitutions');}
}
console.log('Protected webpack factories and route-only overlay verified');
