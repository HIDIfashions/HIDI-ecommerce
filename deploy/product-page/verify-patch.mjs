import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require(process.env.HIDI_TYPESCRIPT_MODULE||resolve('apps/web/node_modules/typescript'));
const [base,overlay]=process.argv.slice(2),plan=JSON.parse(readFileSync('evidence/product-page-release/patch.json','utf8'));
if(plan.kind==='product-style-refresh'){
 const name='apps/web/.next/server/app/products/[slug]/page.js';
 assert.equal(readFileSync(join(overlay,name),'utf8'),readFileSync(join(base,name),'utf8').replace(plan.oldUrl,plan.newUrl),'Only the route stylesheet reference may change');
 assert.equal(plan.allowedFiles.length,2);const cssName=plan.allowedFiles.find(name=>name.endsWith('.css')),css=readFileSync(join(overlay,cssName),'utf8');
 assert(css.includes("xmlns='http://www%2Ew3%2Eorg/2000/svg'"),'SVG namespace must survive scoped CSS compilation');
 console.log('Product style refresh preserves all deployed JavaScript and facts');process.exit(0);
}
if(plan.kind==='compact-mobile-css'){
 const name='apps/web/.next/server/app/products/[slug]/page.js',before=readFileSync(join(base,name),'utf8'),after=readFileSync(join(overlay,name),'utf8');
 assert.equal(after,before.replace(plan.oldUrl,plan.newUrl),'Only the route stylesheet reference may change');
 const css=readFileSync(join(overlay,plan.newCssName),'utf8');assert(css.includes('clamp(180px, 24svh, 200px)'));
 assert.equal(plan.allowedFiles.length,2);console.log('CSS-only route update preserves all product factories and facts');process.exit(0);
}
function inventory(text){const tree=ts.createSourceFile('route.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),modules=new Map();function walk(n){if(ts.isPropertyAssignment(n)&&/^\d+$/.test(n.name.getText(tree))&&ts.isArrowFunction(n.initializer)){modules.set(n.name.getText(tree),n.initializer.getText(tree));return;}ts.forEachChild(n,walk);}walk(tree);return modules;}
function normalizeInfo(text,expectedHash){
 const tree=ts.createSourceFile('page-info.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let initializer;
 function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='HidiInfo'){assert(!initializer);initializer=n.initializer;return;}ts.forEachChild(n,walk);}walk(tree);assert(initializer);
 if(expectedHash)assert.equal(createHash('sha256').update(initializer.getText(tree)).digest('hex'),expectedHash,'Page display helper must match the source compilation');
 return text.slice(0,initializer.getStart(tree))+'"APPROVED_PDP_PRESENTATION_HELPER"'+text.slice(initializer.end);
}
function stripApprovedIncludes(text){
 const tree=ts.createSourceFile('page-display.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let target;
 function walk(n){if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&n.getText(tree).includes('className:"hidi-pdp-includes"')){assert(!target,'One includes display expected');target=n;return;}ts.forEachChild(n,walk);}walk(tree);
 assert(target,'Retained includes display expected');return text.slice(0,target.getStart(tree))+'null'+text.slice(target.end);
}
for(const [oldName,newName,count] of [[plan.retainedClientChunk,plan.newClientChunk,4],['apps/web/.next/server/app/products/[slug]/page.js','apps/web/.next/server/app/products/[slug]/page.js',5]]){
 const before=inventory(readFileSync(join(base,oldName),'utf8')),after=inventory(readFileSync(join(overlay,newName),'utf8'));
 assert.deepEqual([...before.keys()],[...after.keys()],'No webpack boundaries may be added, removed or renumbered');
 const delta=[...before.keys()].filter(id=>before.get(id)!==after.get(id));if(plan.kind!=='isolated-component-refresh')assert.equal(delta.length,count,'Only reviewed PDP factories may change');
 else assert(delta.length>=1 && delta.length<=count,'Only the isolated product components and stylesheet reference may change: '+oldName+' '+JSON.stringify(delta));
 const names=delta.map(id=>before.get(id));
 if(plan.kind==='isolated-component-refresh'){
  assert(names.some(text=>text.startsWith('(module,exports,__webpack_require__)=>{Object.assign(exports,')),'At least one isolated product component must change');
  for(const id of delta){const original=before.get(id);assert(original.startsWith('(module,exports,__webpack_require__)=>{Object.assign(exports,') || (oldName.endsWith('/page.js') && original.includes('function HidiDetails(product)') && (plan.pageInfoInitializerHash?normalizeInfo(after.get(id),plan.pageInfoInitializerHash)===normalizeInfo(plan.approvedIncludesRemoval?stripApprovedIncludes(original.replace(plan.oldUrl,plan.newUrl)):original.replace(plan.oldUrl,plan.newUrl)):after.get(id)===(plan.approvedIncludesRemoval?stripApprovedIncludes(original.replace(plan.oldUrl,plan.newUrl)):original.replace(plan.oldUrl,plan.newUrl)))),'Every change must be an isolated component or the single stylesheet reference');}
 }else for(const component of ['AddToCart','ProductMedia','ProductQualitySummary','ProductInfoAccordion'])assert(names.some(text=>text.includes(component+':')));
 for(const id of delta){const text=after.get(id);assert(!text.includes('process.env'),'No new environment substitutions');}
}
console.log('Protected webpack factories and route-only overlay verified');
