/** Route only the retained admin OTP request through staff eligibility. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(resolve('apps/web/package.json'));
const ts = require('typescript');
export function patch(source) {
  const tree = ts.createSourceFile('retained.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(tree.parseDiagnostics.length, 0);
  const all = []; const visit = n => {all.push(n); ts.forEachChild(n, visit);}; visit(tree);
  const one = (items, why) => {assert.equal(items.length, 1, why); return items[0];};
  const prop = (obj, key) => obj.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(tree).replace(/^['"]|['"]$/g, '') === key);
  const call = one(all.filter(n => ts.isCallExpression(n) && n.expression.getText(tree) === 'fetch' && n.arguments[0]?.getText(tree).includes('/auth/v1/otp')), 'one original provider OTP request');
  const options = call.arguments[1]; assert(ts.isObjectLiteralExpression(options));
  const body = prop(options, 'body')?.initializer;
  assert(ts.isCallExpression(body) && body.expression.getText(tree) === 'JSON.stringify');
  const data = body.arguments[0]; assert(ts.isObjectLiteralExpression(data));
  const emailProp = data.properties.find(p => p.name?.getText(tree) === 'email');
  assert(emailProp && prop(data, 'create_user'), 'original signup request required');
  const email = ts.isShorthandPropertyAssignment(emailProp) ? emailProp.name.text : emailProp.initializer.getText(tree);
  const pattern = one(all.filter(n => n.kind === ts.SyntaxKind.RegularExpressionLiteral && n.getText(tree) === '/^\\S+@\\S+\\.\\S+$/'), 'one original email validator');
  const check = pattern.parent.parent; assert(ts.isCallExpression(check) && check.expression.name?.text === 'test');
  assert(ts.isPrefixUnaryExpression(check.parent) && check.parent.operator === ts.SyntaxKind.ExclamationToken);
  const value = check.arguments[0].getText(tree);
  const edits = [
    {start: call.arguments[0].getStart(tree), end: call.arguments[0].end, text: '"/api/store/auth/admin/otp/request"'},
    {start: options.getStart(tree), end: options.end, text: `{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",body:JSON.stringify({email:${email}})}`},
    {start: check.parent.getStart(tree), end: check.parent.end, text: `(${value}.length>254||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(${value}))`},
  ].sort((a,b)=>a.start-b.start);
  for(let i=1;i<edits.length;i++)assert(edits[i-1].end<=edits[i].start);
  for(const e of edits)e.original=source.slice(e.start,e.end);
  let output=source; for(const e of [...edits].reverse())output=output.slice(0,e.start)+e.text+output.slice(e.end);
  let restored=output;
  for(const e of edits){assert.equal(restored.slice(e.start,e.start+e.text.length),e.text);restored=restored.slice(0,e.start)+e.original+restored.slice(e.start+e.text.length);}
  assert.equal(restored,source,'All verification, session, UI and unrelated bytes preserved');
  assert.equal(ts.createSourceFile('patched.js',output,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
  return {output,passed:true,inverseTransformsVerified:true,verificationAndSessionPreserved:true};
}
if(process.argv[2]){const {output,...report}=patch(readFileSync(process.argv[2],'utf8'));writeFileSync(process.argv[3],output);console.log(JSON.stringify(report));}
