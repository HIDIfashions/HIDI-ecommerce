// Restore the admin-maintained short description in the retained server-rendered PDP.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require(process.env.HIDI_TYPESCRIPT_MODULE||resolve('apps/web/node_modules/typescript'));
const [base,overlay]=process.argv.slice(2),name='apps/web/.next/server/app/products/[slug]/page.js';
const before=readFileSync(join(base,name),'utf8');
assert(before.includes('function HidiDetails(product)')&&before.includes('HidiCopy='),'Expected retained PDP with escaped catalogue renderer');
assert(!before.includes('className:"hidi-pdp-short-description"'),'Short description already installed');
const tree=ts.createSourceFile('page.js',before,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let target;
function walk(n){
 if(ts.isCallExpression(n)&&n.arguments[0]&&ts.isPropertyAccessExpression(n.arguments[0])&&n.arguments[0].name.text==='ProductPurchaseSummary'){
  assert(!target,'Expected one purchase summary');target=n;
 }
 ts.forEachChild(n,walk);
}walk(tree);assert(target,'Purchase summary anchor is missing');
const props=target.arguments[1];assert(ts.isObjectLiteralExpression(props));
const product=props.properties.find(p=>p.name?.getText(tree)==='product')?.initializer?.getText(tree);assert.equal(product,'e');
const insertion=`e.shortDescription?.trim()&&${target.expression.getText(tree)}("div",{className:"hidi-pdp-short-description",dangerouslySetInnerHTML:{__html:HidiCopy.renderProductCopy(e.shortDescription)}}),`;
let after=before.slice(0,target.getStart(tree))+insertion+before.slice(target.getStart(tree));
const urls=[...new Set(before.match(/\/_next\/static\/css\/hidi-product-page-[a-f0-9]{16}\.css/g))];assert.equal(urls.length,1);
const oldUrl=urls[0],oldCss='apps/web/.next/'+oldUrl.slice('/_next/'.length),cssBefore=readFileSync(join(base,oldCss),'utf8');
const css=cssBefore+'\n'+readFileSync('apps/web/app/product-short-description.css','utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const cssName='apps/web/.next/static/css/hidi-product-page-'+sha(css).slice(0,16)+'.css',newUrl='/_next/'+cssName.split('/.next/')[1];
assert.equal(after.split(oldUrl).length-1,1);after=after.replace(oldUrl,newUrl);
assert.equal(after.replace(newUrl,oldUrl).replace(insertion,''),before,'Removing only the approved insertion and CSS URL must restore every original byte');
assert.equal(css.slice(0,cssBefore.length),cssBefore);
for(const [file,text] of Object.entries({[name]:after,[cssName]:css})){mkdirSync(dirname(join(overlay,file)),{recursive:true});writeFileSync(join(overlay,file),text);}
const report={passed:true,kind:'short-description',allowedFiles:[name,cssName],oldUrl,newUrl,serverBeforeSha:sha(before),serverAfterSha:sha(after),unchangedRuntimeRestoredExactly:true,clientBundlesUnchanged:true};
mkdirSync('evidence/short-description',{recursive:true});writeFileSync('evidence/short-description/patch.json',JSON.stringify(report,null,2));
console.log('Short description restored; only PDP server output and its scoped stylesheet change.');
