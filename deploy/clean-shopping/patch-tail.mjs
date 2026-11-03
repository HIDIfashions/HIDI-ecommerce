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
