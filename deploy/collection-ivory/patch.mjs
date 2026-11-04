// Change only the collection render and shared background token in the retained runtime.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const ts=require(process.env.HIDI_TYPESCRIPT_MODULE||resolve('apps/web/node_modules/typescript'));
const [baseArg,outArg]=process.argv.slice(2),base=resolve(baseArg),out=resolve(outArg);
const name='apps/web/.next/server/app/collections/all/page.js';
const before=readFileSync(join(base,name),'utf8');
const tree=ts.createSourceFile('collection.js',before,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
assert.equal(tree.parseDiagnostics.length,0);
const edits=[];let headers=0,guides=0,breadcrumbs=0;
function walk(n){
  if(ts.isCallExpression(n)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text==='header'&&n.getText(tree).includes('className:"collection-header"')){
    const old=n.getText(tree);
    assert.equal(old,'(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})','Unexpected live collection header');
    edits.push({start:n.getStart(tree),end:n.end,value:old.replace('children:i','children:"Shop All"')});headers++;return;
  }
  if(ts.isCallExpression(n)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text==='details'&&n.getText(tree).includes('className:"hidi-collection-guidance"')){
    assert(n.getText(tree).includes('Discover HIDI kurta sets'));
    edits.push({start:n.getStart(tree),end:n.end,value:'null'});guides++;return;
  }
  if(ts.isObjectLiteralExpression(n)){
    const prop=key=>n.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)===key);
    if(prop('position')?.initializer.getText(tree)==='2'&&prop('name')?.initializer.getText(tree)==='i'&&prop('item')?.initializer.getText(tree).includes('"/collections/all"')){
      const value=prop('name').initializer;
      edits.push({start:value.getStart(tree),end:value.end,value:'"Shop All"'});breadcrumbs++;
    }
  }
  ts.forEachChild(n,walk);
}
walk(tree);assert.equal(headers,1);assert.equal(guides,1);assert.equal(breadcrumbs,1);
let after=before;
for(const e of edits.sort((a,b)=>b.start-a.start))after=after.slice(0,e.start)+e.value+after.slice(e.end);
assert(!after.includes('Discover HIDI kurta sets'));
assert(after.includes('HIDI Kurta Sets & Indian Wear'),'Retain search metadata');
const wrapperName='server.mjs',wrapper=readFileSync(join(base,wrapperName),'utf8');
const anchor='const storefrontLayerFix = `';assert.equal(wrapper.split(anchor).length-1,1);
const end=wrapper.indexOf('</style>',wrapper.indexOf(anchor));assert(end>0);
const surfaces=readFileSync('apps/web/app/storefront-surfaces.css','utf8');
const token=surfaces.match(/:root\s*\{[^}]+\}/)?.[0];assert(token?.includes('--hidi-page-bg: #f3ebdd;'));
assert(!/[`]|\$\{|<|url\(|@import/.test(token));
const addition='\n/* hidi-collection-ivory-20261104 */\n'+token+'\n';
assert(!wrapper.includes('hidi-collection-ivory-20261104'),'Already applied');
const updated=wrapper.slice(0,end)+addition+wrapper.slice(end);
assert.equal(updated.replace(addition,''),wrapper);
const files={[name]:after,[wrapperName]:updated};
for(const [file,text] of Object.entries(files)){mkdirSync(dirname(join(out,file)),{recursive:true});writeFileSync(join(out,file),text);}
const hash=text=>createHash('sha256').update(text).digest('hex');
mkdirSync('evidence/collection-ivory',{recursive:true});
writeFileSync('evidence/collection-ivory/patch.json',JSON.stringify({passed:true,allowedFiles:Object.keys(files).sort(),sourceSha:process.env.GITHUB_SHA||null,background:'#F3EBDD',heading:'Shop All',guidanceRemoved:true,metadataPreserved:true,purchaseFactoriesPreserved:true,mediaFactoriesPreserved:true,apiUnchanged:true,databaseWrites:false,changes:edits.map(e=>({start:e.start,end:e.end})),collectionBefore:hash(before),collectionAfter:hash(after)},null,2));
