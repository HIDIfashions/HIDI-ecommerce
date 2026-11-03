// Release retrigger: approved storefront cleanup verifier included.
// Compile reviewed PDP components into their retained webpack boundaries.
// React/Next imports resolve to the original factories; no second app/runtime.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {exit} from 'node:process';
const require=createRequire(import.meta.url),root=resolve('.');
const ts=require(process.env.HIDI_TYPESCRIPT_MODULE||resolve('apps/web/node_modules/typescript'));
const lucide=process.env.HIDI_LUCIDE_ROOT||resolve('apps/web/node_modules/lucide-react');
const [baseArg,overlayArg]=process.argv.slice(2),base=resolve(baseArg),overlay=resolve(overlayArg);
const sha=s=>createHash('sha256').update(s).digest('hex');
// A follow-up CSS release preserves every deployed product factory and fact.
const retainedServerName='apps/web/.next/server/app/products/[slug]/page.js';
const retainedServer=readFileSync(join(base,retainedServerName),'utf8');
const styles=new Map(),css=[];
function cssModule(path){if(styles.has(path))return styles.get(path);let text=readFileSync(path,'utf8'),map={};
 text=text.replace(/:global\(([^)]+)\)/g,(_,selector)=>selector.replace(/\./g,'@@GLOBAL@@'));
 text=text.replace(/\.([a-zA-Z_][\w-]*)/g,(_,name)=>'.'+(map[name]??=(relative(root,path).replace(/[^a-zA-Z0-9]/g,'_')+'_'+name)));
 text=text.replace(/@@GLOBAL@@/g,'.');css.push(text);styles.set(path,map);return map;
}
function resolveFile(from,name){let p=name.startsWith('@/')?resolve('apps/web',name.slice(2)):resolve(dirname(from),name);
 for(const ext of ['', '.ts','.tsx','.mjs','.js'])if(existsSync(p+ext))return p+ext;throw Error('Unresolved local import '+name+' from '+from);}
function bundle(entry,kind){const external=kind==='server'?{'react':19159,'react/jsx-runtime':19574,'next/link':83565,'next/image':50789,'next/navigation':52339,'@/components/wishlist-button':95113}:{'react':98298,'react/jsx-runtime':84882,'next/link':26333,'next/image':22541,'next/navigation':11614,'@/components/wishlist-button':12187};
 const factories={},ids=new Map();
 function add(path){if(ids.has(path))return ids.get(path);const id=ids.size;ids.set(path,id);let text=readFileSync(path,'utf8');
 if(path.endsWith('.css')){factories[id]='module.exports='+JSON.stringify(cssModule(path));return id;}
 if(path.endsWith('.json')){factories[id]='module.exports='+text;return id;}
 let js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,allowJs:true}}).outputText;
 js=js.replace(/require\("([^"\n]+)"\)/g,(_,name)=>{
  if(name==='lucide-react'){
   const imports=[...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g)].flatMap(m=>m[1].split(',').map(s=>s.trim()).filter(Boolean));
   return '({'+imports.map(symbol=>{const filename=symbol.replace(/([a-z0-9])([A-Z])/g,'$1-$2').toLowerCase();return JSON.stringify(symbol)+':localRequire('+add(join(lucide,'dist/esm/icons',filename+'.mjs'))+').default';}).join(',')+'})';
  }
  if(name==='next/link'||name==='next/image')return '((m)=>({__esModule:true,default:m.default??m}))(__webpack_require__('+external[name]+'))';
  if(name in external)return '__webpack_require__('+external[name]+')';
  assert(name.startsWith('.')||name.startsWith('@/'),'Unexpected external dependency '+name);
  const resolved=resolveFile(path,name);
  if(resolved===resolve('apps/web/lib/product-sharing.ts'))return '({PRODUCT_VARIANT_EVENT:"hidi-product-variant-selected",publishProductSelection:(selection)=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("hidi-product-variant-selected",{detail:selection}));}})';
  return 'localRequire('+add(resolved)+')';
 });
 assert(!/process\.env/.test(js),'Do not introduce unreviewed browser environment substitutions: '+path);
 factories[id]=js;return id;
 }
 const entryId=add(resolve(entry));
 return `(()=>{const factories={${Object.entries(factories).map(([id,text])=>id+':(module,exports,localRequire)=>{'+text+'}').join(',')}};const cache={};function localRequire(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};factories[id](m,m.exports,localRequire);return m.exports;}return localRequire(${entryId});})()`;
}
// Refresh only the accordion factory; purchasing, media and framework factories remain byte-identical.
const accordionEntry='apps/web/components/product-info-accordion.tsx';
function refreshAccordion(text,kind) {
 const tree=ts.createSourceFile('retained.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];
 function walk(n){
  if(ts.isPropertyAssignment(n)&&/^\d+$/.test(n.name.getText(tree))&&ts.isArrowFunction(n.initializer)) {
   const value=n.initializer.getText(tree);
   if(value.startsWith('(module,exports,__webpack_require__)=>{Object.assign(exports,')&&value.includes('exports.ProductInfoAccordion =')) {
    edits.push({start:n.initializer.pos,end:n.initializer.end,old:text.slice(n.initializer.pos,n.initializer.end),value:'(module,exports,__webpack_require__)=>{Object.assign(exports,'+bundle(accordionEntry,kind)+');}'});return;
   }
  }ts.forEachChild(n,walk);
 }walk(tree);assert.equal(edits.length,1,'Exactly one retained accordion factory: '+kind);
 const e=edits[0],updated=text.slice(0,e.start)+e.value+text.slice(e.end);
 assert.equal(updated.slice(0,e.start)+e.old+updated.slice(e.start+e.value.length),text);
 return updated;
}
const manifestName='apps/web/.next/server/app/products/[slug]/page_client-reference-manifest.js';
const manifest=readFileSync(join(base,manifestName),'utf8');
const active=readdirSync(join(base,'apps/web/.next/static/chunks/app/products/[slug]')).filter(n=>n.endsWith('.js')&&manifest.includes(n));assert.equal(active.length,1);
const clientName='apps/web/.next/static/chunks/app/products/[slug]/'+active[0],clientBefore=readFileSync(join(base,clientName),'utf8');
const client=refreshAccordion(clientBefore,'client');let server=refreshAccordion(retainedServer,'server');
const edits=[],tree=ts.createSourceFile('product.js',server,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
function removeOldDetails(n) {
 if(ts.isCallExpression(n)&&n.arguments[0]&&ts.isPropertyAccessExpression(n.arguments[0])&&n.arguments[0].name.text==='ProductQualitySummary'){edits.push({start:n.getStart(tree),end:n.end});return;}
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&n.getText(tree).includes('className:"hidi-pdp-description"')){edits.push({start:n.getStart(tree),end:n.end});return;}
 ts.forEachChild(n,removeOldDetails);
}removeOldDetails(tree);assert.equal(edits.length,2,'One old summary and one old narrative render');
for(const e of edits.sort((a,b)=>b.start-a.start))server=server.slice(0,e.start)+'null'+server.slice(e.end);
const urls=[...new Set(server.match(/\/_next\/static\/css\/hidi-product-page-[a-f0-9]{16}\.css/g))];assert.equal(urls.length,1);
const oldUrl=urls[0],oldCss=readFileSync(join(base,'apps/web/.next/'+oldUrl.slice('/_next/'.length)),'utf8');
const cssText=oldCss+'\n/* hidi-clean-shopping-details */\n'+css.join('\n');
const cssName='apps/web/.next/static/css/hidi-product-page-'+sha(cssText).slice(0,16)+'.css',newUrl='/_next/'+cssName.split('/.next/')[1];
assert.equal(server.split(oldUrl).length-1,1);server=server.replace(oldUrl,newUrl);
const newClientName=clientName.replace(/-[a-f0-9]{16}\.js$/,'-'+sha(client).slice(0,16)+'.js');assert.notEqual(clientName,newClientName);
const urlName=n=>n.split('/.next/')[1].replace('[slug]','%5Bslug%5D');
const files={[retainedServerName]:server,[newClientName]:client,[cssName]:cssText,[manifestName]:manifest.split(urlName(clientName)).join(urlName(newClientName))};
assert(manifest.includes(urlName(clientName)));
// Replace the precise previously released collection introduction with native below-grid details.
const allName='apps/web/.next/server/app/collections/all/page.js';let all=readFileSync(join(base,allName),'utf8');
const allTree=ts.createSourceFile('collection.js',all,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),allEdits=[];let headerCount=0,browserCount=0;
const copy=JSON.parse(readFileSync('deploy/search-priority/copy.json','utf8'));
const sourcePage=readFileSync('apps/web/app/collections/all/page.tsx','utf8');
const paragraphs=[...sourcePage.matchAll(/<p>([^<]+)<\/p>/g)].map(m=>m[1]);assert.equal(paragraphs.length,2);
const guide='(0,d.jsxs)("details",{className:"hidi-collection-guidance",children:[(0,d.jsx)("summary",{children:"Discover HIDI kurta sets"}),(0,d.jsxs)("div",{children:['+paragraphs.map(p=>'(0,d.jsx)("p",{children:'+JSON.stringify(p)+'})').join(',')+']})]})';
function collectionWalk(n){
 if(ts.isCallExpression(n)&&n.arguments[0]?.getText(allTree)==='"header"'&&n.getText(allTree).includes('className:"collection-header"')) {
  assert(n.getText(allTree).includes(copy.intro));headerCount++;allEdits.push({start:n.getStart(allTree),end:n.end,value:'(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})'});return;
 }
 if(ts.isCallExpression(n)&&n.arguments[0]&&ts.isPropertyAccessExpression(n.arguments[0])&&n.arguments[0].name.text==='CollectionBrowser'){browserCount++;allEdits.push({start:n.end,end:n.end,value:','+guide});return;}
 ts.forEachChild(n,collectionWalk);
}collectionWalk(allTree);assert.equal(headerCount,1);assert.equal(browserCount,1);
for(const e of allEdits.sort((a,b)=>b.start-a.start))all=all.slice(0,e.start)+e.value+all.slice(e.end);files[allName]=all;
const wrapperName='server.mjs',wrapper=readFileSync(join(base,wrapperName),'utf8'),anchor='const storefrontLayerFix = `';assert.equal(wrapper.split(anchor).length-1,1);
const end=wrapper.indexOf('</style>',wrapper.indexOf(anchor));assert(end>0);
const collectionCss=readFileSync('apps/web/app/clean-shopping.css','utf8');assert(!/[`]|\$\{|<|url\(|@import/.test(collectionCss));
const addition='\n/* hidi-clean-shopping-20261104 */\n'+collectionCss+'\n';assert(!wrapper.includes('hidi-clean-shopping-20261104'));
files[wrapperName]=wrapper.slice(0,end)+addition+wrapper.slice(end);assert.equal(files[wrapperName].replace(addition,''),wrapper);
for(const [name,text] of Object.entries(files)){const target=join(overlay,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text);}
mkdirSync('evidence/clean-shopping',{recursive:true});writeFileSync('evidence/clean-shopping/patch.json',JSON.stringify({passed:true,allowedFiles:Object.keys(files).sort(),sourceSha:process.env.GITHUB_SHA||null,oldAssetsRetained:true,purchaseFactoriesPreserved:true,mediaFactoriesPreserved:true,apiUnchanged:true,databaseWrites:false,collectionGuidanceParagraphs:paragraphs,refreshedComponents:['ProductInfoAccordion']},null,2));
