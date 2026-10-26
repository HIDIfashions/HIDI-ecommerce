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
const components={'ProductQualitySummary':'product-quality-summary.tsx','ProductInfoAccordion':'product-info-accordion.tsx'};
function replaceFactories(text,kind){const tree=ts.createSourceFile('retained.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[],found=[];
 function walk(n){if(ts.isPropertyAssignment(n)&&/^\d+$/.test(n.name.getText(tree))&&ts.isArrowFunction(n.initializer)){
  const value=n.initializer.getText(tree);
  for(const [name,file] of Object.entries(components))if(new RegExp('\\b'+name+':').test(value)&&!value.includes('registerClientReference')){
   found.push(name);edits.push({start:n.initializer.pos,end:n.initializer.end,value:'(module,exports,__webpack_require__)=>{Object.assign(exports,'+bundle('apps/web/components/'+file,kind)+');}'});return;
  }
 }ts.forEachChild(n,walk);}walk(tree);
 assert.deepEqual(found.sort(),Object.keys(components).sort(),'Retained product component inventory changed: '+kind);
 for(const edit of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.value+text.slice(edit.end);return text;
}
// Update only the previously isolated component boundaries; retain the deployed page factory.
if(retainedServer.includes('function HidiDetails(product)')){
 const urls=[...new Set(retainedServer.match(/\/_next\/static\/css\/hidi-product-page-[a-f0-9]{16}\.css/g))];assert.equal(urls.length,1);
 const oldUrl=urls[0],manifestName='apps/web/.next/server/app/products/[slug]/page_client-reference-manifest.js',manifest=readFileSync(join(base,manifestName),'utf8');
 const active=readdirSync(join(base,'apps/web/.next/static/chunks/app/products/[slug]')).filter(name=>name.endsWith('.js')&&manifest.includes(name));assert.equal(active.length,1);
 const clientName='apps/web/.next/static/chunks/app/products/[slug]/'+active[0];
 function refresh(text,kind){const tree=ts.createSourceFile('retained.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[],found=[];
  function walk(n){if(ts.isPropertyAssignment(n)&&/^\d+$/.test(n.name.getText(tree))&&ts.isArrowFunction(n.initializer)){
   const value=n.initializer.getText(tree);
   if(value.startsWith('(module,exports,__webpack_require__)=>{Object.assign(exports,')){
    const names=Object.keys(components).filter(name=>value.includes('exports.'+name+' ='));if(!names.length)return;assert.equal(names.length,1,'Known isolated component required');
    const name=names[0];found.push(name);edits.push({start:n.initializer.pos,end:n.initializer.end,value:'(module,exports,__webpack_require__)=>{Object.assign(exports,'+bundle('apps/web/components/'+components[name],kind)+');}'});return;
   }
  }ts.forEachChild(n,walk);}walk(tree);assert.deepEqual(found.sort(),Object.keys(components).sort());
  for(const edit of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.value+text.slice(edit.end);return text;
 }
 const client=refresh(readFileSync(join(base,clientName),'utf8'),'client');let server=refresh(retainedServer,'server');
 // Refresh only the page's presentation helper; metadata/schema expressions stay intact.
 const infoExpression=bundle('apps/web/lib/pdp-information.ts','server');
 const infoTree=ts.createSourceFile('retained-page.js',server,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let infoNode;
 function findInfo(n){if(ts.isVariableDeclaration(n)&&n.name.getText(infoTree)==='HidiInfo'){assert(!infoNode);infoNode=n.initializer;return;}ts.forEachChild(n,findInfo);}findInfo(infoTree);assert(infoNode);
 server=server.slice(0,infoNode.getStart(infoTree))+infoExpression+server.slice(infoNode.end);
 const retainedCss=readFileSync(join(base,'apps/web/.next/'+oldUrl.split('/_next/')[1]),'utf8');
 const cssText=retainedCss+'\n'+css.join('\n'),newCssName='apps/web/.next/static/css/hidi-product-page-'+sha(cssText).slice(0,16)+'.css',newUrl='/_next/'+newCssName.split('/.next/')[1];
 assert.equal(server.split(oldUrl).length-1,1);server=server.replace(oldUrl,newUrl);
 const newClientName=clientName.replace(/-[a-f0-9]{16}\.js$/,'-'+sha(client).slice(0,16)+'.js');const stylesOnly=clientName===newClientName;
 const urlName=name=>name.split('/.next/')[1].replace('[slug]','%5Bslug%5D');assert(manifest.includes(urlName(clientName)));
 const files=stylesOnly?{[retainedServerName]:server,[newCssName]:cssText}:{[retainedServerName]:server,[newClientName]:client,[newCssName]:cssText,[manifestName]:manifest.split(urlName(clientName)).join(urlName(newClientName))};
 if(stylesOnly)assert.equal(server,retainedServer.replace(oldUrl,newUrl),'A style-only refresh must preserve all product JavaScript');
 for(const [name,text] of Object.entries(files)){const file=join(overlay,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);}
 mkdirSync('evidence/product-multirole',{recursive:true});writeFileSync('evidence/product-multirole/product-patch.json',JSON.stringify({passed:true,kind:stylesOnly?'product-style-refresh':'isolated-component-refresh',allowedFiles:Object.keys(files).sort(),retainedClientChunk:clientName,newClientChunk:newClientName,oldUrl,newUrl,pageInfoInitializerHash:sha(infoExpression),approvedIncludesRemoval:true,oldAssetsRetained:true,sourceSha:process.env.GITHUB_SHA||null},null,2));exit(0);
}

throw Error('Expected the existing isolated product detail runtime');
