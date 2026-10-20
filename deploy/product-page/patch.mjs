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
if(retainedServer.includes('function HidiDetails(product)')){
 const urls=[...new Set(retainedServer.match(/\/_next\/static\/css\/hidi-product-page-[a-f0-9]{16}\.css/g))];assert.equal(urls.length,1);
 const oldUrl=urls[0],oldCssName='apps/web/.next/'+oldUrl.slice('/_next/'.length),oldCss=readFileSync(join(base,oldCssName),'utf8');
 assert.equal(oldCss.split('clamp(180px, 28svh, 240px)').length-1,2,'Short gallery baseline changed; review before release');
 const cssText=oldCss.split('clamp(180px, 28svh, 240px)').join('clamp(180px, 24svh, 200px)')+'\n@media(max-width:620px){.product-page .apps_web_components_add_to_cart_module_css_selectionSummary{display:none!important}}\n';
 const newCssName='apps/web/.next/static/css/hidi-product-page-'+sha(cssText).slice(0,16)+'.css',newUrl='/_next/'+newCssName.split('/.next/')[1];
 assert.equal(retainedServer.split(oldUrl).length-1,1);
 const files={[retainedServerName]:retainedServer.replace(oldUrl,newUrl),[newCssName]:cssText};
 for(const [name,text] of Object.entries(files)){const file=join(overlay,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);}
 mkdirSync('evidence/product-page-release',{recursive:true});writeFileSync('evidence/product-page-release/patch.json',JSON.stringify({passed:true,kind:'compact-mobile-css',allowedFiles:Object.keys(files).sort(),oldCssName,newCssName,oldUrl,newUrl,originalFrameworkFactoriesPreserved:true,productJavaScriptPreserved:true,productFactsPreserved:true,oldAssetsRetained:true},null,2));exit(0);
}
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
const components={'AddToCart':'add-to-cart.tsx','ProductMedia':'product-purchase-summary.tsx','ProductQualitySummary':'product-quality-summary.tsx','ProductInfoAccordion':'product-info-accordion.tsx'};
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
const serverName='apps/web/.next/server/app/products/[slug]/page.js';
let server=readFileSync(join(base,serverName),'utf8');
// The module identifiers are pinned to the inspected immutable release. Stop on drift.
assert(server.includes('c.d(b,{AddToCart:()=>q})')&&server.includes('c.d(b,{ProductMedia:()=>u,ProductPurchaseSummary:()=>t})'));
let clientName;
const retainedManifest=readFileSync(join(base,'apps/web/.next/server/app/products/[slug]/page_client-reference-manifest.js'),'utf8');
for(const name of readdirSync(join(base,'apps/web/.next/static/chunks/app/products/[slug]'))){if(name.endsWith('.js')&&retainedManifest.includes(name)){const candidate='apps/web/.next/static/chunks/app/products/[slug]/'+name;if(readFileSync(join(base,candidate),'utf8').includes('AddToCart:()=>')){assert(!clientName);clientName=candidate;}}}
assert(clientName,'One retained browser product chunk required');
const originalClient=readFileSync(join(base,clientName),'utf8');
assert(originalClient.includes('var r=i(84882),a=i(98298),n=i(11614),s=i(12187),o=i(26333)'));
let client=replaceFactories(originalClient,'client');server=replaceFactories(server,'server');
function once(text,old,value){assert.equal(text.split(old).length-1,1,'Retained product anchor drift: '+old.slice(0,100));return text.replace(old,value);}
const infoBundle=bundle('apps/web/lib/pdp-information.ts','server'),specBundle=bundle('apps/web/lib/pdp-source-specifications.ts','server'),copyBundle=bundle('apps/web/lib/product-copy.mjs','server');
// Only the product page factory receives audited server-side facts and layout changes.
const pageTree=ts.createSourceFile('server.js',server,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let pageNode;
function pageWalk(n){if(ts.isPropertyAssignment(n)&&/^\d+$/.test(n.name.getText(pageTree))&&ts.isArrowFunction(n.initializer)&&n.initializer.getText(pageTree).includes('className:"pdp-title-row"')){assert(!pageNode);pageNode=n.initializer;return;}ts.forEachChild(n,pageWalk);}pageWalk(pageTree);assert(pageNode);
let page=pageNode.getText(pageTree);const opening=page.indexOf('{');page=page.slice(0,opening+1)+`const HidiInfo=${infoBundle},HidiSpecs=${specBundle},HidiCopy=${copyBundle};function HidiDetails(product){return HidiInfo.pdpInformation(product,HidiSpecs.reviewedPdpSpecifications(product));}`+page.slice(opening+1);
page=once(page,'(0,d.jsx)("h1",{children:e.name})','(0,d.jsx)("h1",{children:HidiDetails(e).title})');
page=once(page,'(0,d.jsx)("p",{className:"pdp-subtitle",children:e.shortDescription})','HidiDetails(e).includes&&(0,d.jsx)("p",{className:"hidi-pdp-includes",children:HidiDetails(e).includes})');
page=once(page,'y(e.description)&&(0,d.jsx)("p",{className:"pdp-description",children:y(e.description)}),','');
page=once(page,'(0,d.jsx)(r.ProductContactActions,{product:e}),(0,d.jsx)(q.ProductQualitySummary,{product:e}),(0,d.jsx)(z.DeliveryCheck,{}),(0,d.jsx)(k.ProductInfoAccordion,{product:e})',
 '(0,d.jsxs)("div",{className:"hidi-pdp-services",children:[(0,d.jsx)("span",{children:"Free shipping"}),(0,d.jsx)("span",{children:"7-day returns on eligible items"}),(0,d.jsx)("a",{href:"/returns",children:"View policy"})]}),(0,d.jsx)(z.DeliveryCheck,{}),(0,d.jsx)(q.ProductQualitySummary,{product:e,specifications:HidiDetails(e).specifications}),HidiDetails(e).narrative&&(0,d.jsxs)("details",{className:"hidi-pdp-description",children:[(0,d.jsx)("summary",{children:"Product description"}),(0,d.jsx)("p",{children:HidiDetails(e).narrative})]}),(0,d.jsx)(k.ProductInfoAccordion,{product:e,specifications:HidiDetails(e).specifications}),(0,d.jsx)(r.ProductContactActions,{product:e})');
// Preserve the existing reviews component and put it ahead of recommendations.
page=once(page,',(0,d.jsx)(p,{data:f})', '');page=once(page,',m.length>0&&', ',(0,d.jsx)(p,{data:f}),m.length>0&&');
page=once(page,'(0,d.jsx)("p",{children:HidiDetails(e).narrative})','(0,d.jsx)("div",{dangerouslySetInnerHTML:{__html:HidiCopy.renderProductCopy(HidiDetails(e).narrative)}})');
page=once(page,'HidiDetails(e).includes&&(0,d.jsx)("p",','f.reviewCount>0&&(0,d.jsxs)("a",{href:"#reviews",className:"hidi-pdp-rating","aria-label":`${f.averageRating.toFixed(1)} out of 5, ${f.reviewCount} reviews`,children:["★ ",f.averageRating.toFixed(1)," (",f.reviewCount," reviews)"]}),HidiDetails(e).includes&&(0,d.jsx)("p",');
cssModule(resolve('apps/web/app/products/[slug]/product-page.module.css'));
const layoutStyles=styles.get(resolve('apps/web/app/products/[slug]/product-page.module.css'));
page=once(page,'className:"pdp-grid"','className:"pdp-grid '+layoutStyles.layout+'"');
css.push('.hidi-pdp-includes{font-size:14px;color:#75695f;margin:0 0 14px}.hidi-pdp-services{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:12px;padding:12px 0;border-bottom:1px solid #dfd3c6}.hidi-pdp-services a{color:#591d20}.hidi-pdp-description{border-block:1px solid #dfd3c6;padding:14px 0;font-size:14px;line-height:1.7}.hidi-pdp-description summary{cursor:pointer;font-weight:600}');
const cssText=css.join('\n'),cssName='apps/web/.next/static/css/hidi-product-page-'+sha(cssText).slice(0,16)+'.css';
page=once(page,'className:"breadcrumbs",children:[','className:"breadcrumbs",children:[(0,d.jsx)("link",{rel:"stylesheet",href:"/_next/'+cssName.split('/.next/')[1]+'"}),');
server=server.slice(0,pageNode.getStart(pageTree))+page+server.slice(pageNode.end);
const newClientName=clientName.replace(/-[a-f0-9]{16}\.js$/,'-'+sha(client).slice(0,16)+'.js');assert.notEqual(newClientName,clientName);
const files={[serverName]:server,[newClientName]:client,[cssName]:cssText};
// Only the product route's client reference manifest receives a new immutable URL.
const manifestName='apps/web/.next/server/app/products/[slug]/page_client-reference-manifest.js';
const urlName=name=>name.split('/.next/')[1].replace('[slug]','%5Bslug%5D');
const oldUrl=urlName(clientName),newUrl=urlName(newClientName);
const manifest=readFileSync(join(base,manifestName),'utf8');assert(manifest.includes(oldUrl));files[manifestName]=manifest.split(oldUrl).join(newUrl);
for(const [name,text] of Object.entries(files)){assert(name.startsWith('apps/web/.next/'));const path=join(overlay,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);}
const report={passed:true,allowedFiles:Object.keys(files).sort(),retainedClientChunk:clientName,newClientChunk:newClientName,originalFrameworkFactoriesPreserved:true,sourceSha:process.env.GITHUB_SHA||null,sourceComponents:Object.values(components),oldAssetsRetained:true};
mkdirSync(resolve('evidence/product-page-release'),{recursive:true});writeFileSync('evidence/product-page-release/patch.json',JSON.stringify(report,null,2));
