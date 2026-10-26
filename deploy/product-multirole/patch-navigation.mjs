import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ts=createRequire(import.meta.url)(resolve('apps/web/node_modules/typescript'));
const [baseArg,overlayArg]=process.argv.slice(2),base=resolve(baseArg),overlay=resolve(overlayArg);
const files=[];function walkFiles(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walkFiles(path);else if(/\.(js|json|html|rsc|meta)$/.test(entry.name))files.push(path);}}
walkFiles(join(base,'apps/web/.next'));
const adminManifest=readFileSync(join(base,'apps/web/.next/server/app/admin/orders/page_client-reference-manifest.js'),'utf8');
const activeLayouts=files.filter(path=>/\/static\/chunks\/app\/admin\/layout-[a-f0-9]{16}\.js$/.test(path.replaceAll('\\','/'))&&adminManifest.includes(path.replaceAll('\\','/').split('/.next/')[1]));
assert.equal(activeLayouts.length,1,'Exactly one layout referenced by the live admin route');
const outputs=new Map(),renames=[],patched=[];
for(const path of files.filter(file=>file.endsWith('.js'))){
  if(path.replaceAll('\\','/').includes('/.next/static/')&&!activeLayouts.includes(path))continue;
  const original=readFileSync(path,'utf8');if(!original.includes('catalogWrite')||!original.includes('Bulk imports'))continue;
  const tree=ts.createSourceFile(path,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];
  function visit(node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='filter'&&node.arguments.length===1){
      const callback=node.arguments[0],text=callback.getText(tree);
      if(ts.isArrowFunction(callback)&&text.includes('.catalogWrite')&&text.includes('.owner')){
        const comma=node.parent;
        assert(ts.isBinaryExpression(comma)&&comma.operatorToken.kind===ts.SyntaxKind.CommaToken,'Recognized inlined role assignment required');
        const assignment=comma.left;assert(ts.isBinaryExpression(assignment)&&assignment.operatorToken.kind===ts.SyntaxKind.EqualsToken);
        assert(ts.isPropertyAccessExpression(assignment.right)&&assignment.right.name.text==='role');
        const role=assignment.left.getText(tree),staff=assignment.right.expression.getText(tree);
        edits.push({start:callback.body.getStart(tree),end:callback.body.end,text:`(${staff}.roles??[${staff}.role]).some(${role}=>${callback.body.getText(tree)})`});
        patched.push({file:relative(base,path).replaceAll('\\','/'),staff});
      }
    }
    ts.forEachChild(node,visit);
  }visit(tree);
  if(!edits.length)continue;
  assert.equal(edits.length,1,'Exactly one workspace navigation per compiled module');
  let text=original;for(const edit of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
  const staff=patched.at(-1).staff;text=text.replaceAll(`${staff}.role.toLowerCase()`,`(${staff}.roles??[${staff}.role]).join(' + ').toLowerCase()`);
  let name=relative(base,path).replaceAll('\\','/');
  if(name.includes('/.next/static/')){
    const next=name.replace(/-[a-f0-9]{16}\.js$/, '-'+createHash('sha256').update(text).digest('hex').slice(0,16)+'.js');assert.notEqual(next,name);
    renames.push([name.split('/.next/')[1],next.split('/.next/')[1]]);name=next;
  }
  outputs.set(name,text);
}
assert.equal(renames.length,1,'One active admin layout browser chunk');
assert(patched.some(item=>item.file.includes('/server/')),'Server-rendered navigation must be updated too');
for(const path of files){const name=relative(base,path).replaceAll('\\','/');if(renames.some(([old])=>name.endsWith(old)))continue;
  const original=outputs.get(name)??readFileSync(path,'utf8');let text=original;
  for(const [old,next] of renames)text=text.replaceAll(old,next);
  if(text!==original)outputs.set(name,text);
}
for(const [name,text] of outputs){const path=join(overlay,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);}
mkdirSync('evidence/product-multirole',{recursive:true});writeFileSync('evidence/product-multirole/navigation-patch.json',JSON.stringify({passed:true,allowedFiles:[...outputs.keys()],patched,renames,oldAssetsRetained:true},null,2));
