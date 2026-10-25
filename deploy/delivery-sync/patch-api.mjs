import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
const require = createRequire(resolve('apps/api/package.json')), ts = require('typescript');
const BASELINE = 'cf00f6309bc2f112c91af98ddbfa0a82ba2d5b77';
const parse = s => ts.createSourceFile('module.js', s, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const walk = root => { const all=[]; const visit=n=>{all.push(n);ts.forEachChild(n,visit);};visit(root);return all; };
const method = (tree,name) => {const matches=walk(tree).filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(tree)===name);assert.equal(matches.length,1,'one method '+name);return matches[0];};
const canonical = node => ts.createPrinter({removeComments:true}).printNode(ts.EmitHint.Unspecified,node,node.getSourceFile());
const baseline = stem => ts.transpileModule(execFileSync('git',['show',BASELINE+':apps/api/src/'+stem+'.ts'],{encoding:'utf8'}),
  {compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,experimentalDecorators:true,emitDecoratorMetadata:true,removeComments:true}}).outputText;
function patch(stem,replace,add,extra=()=>[]) {
  const relative='apps/api/dist/'+stem+'.js',original=readFileSync(resolve(process.argv[2],relative),'utf8');
  const current=parse(original),old=parse(baseline(stem)),updated=parse(readFileSync(relative,'utf8'));
  assert.equal(current.parseDiagnostics.length,0);const edits=[];
  for(const name of replace){const from=method(current,name),expected=method(old,name),to=method(updated,name);
    assert.equal(canonical(from),canonical(expected),'Retained method changed; review required: '+stem+'.'+name);
    edits.push({start:from.getStart(current),end:from.end,text:to.getText(updated)});
  }
  for(const name of add){assert(!walk(current).some(n=>ts.isMethodDeclaration(n)&&n.name.getText(current)===name));
    const to=method(updated,name),cl=walk(current).find(n=>ts.isClassExpression(n)||ts.isClassDeclaration(n));assert(cl);
    edits.push({start:cl.members.end,end:cl.members.end,text:'\n    '+to.getText(updated)+'\n'});
  }
  edits.push(...extra(original,current,updated));
  let output=original;for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  assert.equal(parse(output).parseDiagnostics.length,0);
  const dest=resolve(process.argv[3],relative);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,output);
  return relative;
}
const changed=[];
changed.push(patch('admin/admin.service',['serializeOrder','updateStatus'],['confirmCodCollection']));
changed.push(patch('admin/admin.controller',['updateStatus'],['confirmCodCollection'],(original,current,updated)=>{
  const decorator=updated.statements.find(n=>n.getText(updated).startsWith('__decorate(')&&n.getText(updated).includes('AdminController.prototype, "confirmCodCollection"'));
  assert(decorator);return [{start:original.indexOf('AdminController = __decorate('),end:original.indexOf('AdminController = __decorate('),text:decorator.getText(updated)+'\n'}];
}));
changed.push(patch('delhivery/delhivery.service',['track'],['trackingConfigured']));
const relative='apps/api/dist/delhivery/delhivery.module.js';
let module=readFileSync(resolve(process.argv[2],relative),'utf8');
assert.equal((module.match(/providers: \[DelhiveryService\]/g)||[]).length,1);
assert(!module.includes('DelhiverySyncService'));
module='import { DelhiverySyncService } from "./delhivery-sync.service.js";\n'+module.replace('providers: [DelhiveryService]','providers: [DelhiveryService, DelhiverySyncService]');
mkdirSync(dirname(resolve(process.argv[3],relative)),{recursive:true});writeFileSync(resolve(process.argv[3],relative),module);changed.push(relative);
for(const stem of ['delhivery-sync.service','tracking-evidence']){
  const name='apps/api/dist/delhivery/'+stem+'.js';copyFileSync(name,resolve(process.argv[3],name));changed.push(name);
}
console.log(JSON.stringify({passed:true,allowedFiles:changed,baseline:BASELINE,unrelatedMethodsPreserved:true}));
