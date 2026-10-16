/** Synchronize PIN changes in the retained checkout without rebuilding its payment code. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(resolve('apps/web/package.json'));
const ts = require(process.env.HIDI_TYPESCRIPT_MODULE || 'typescript');
export function patch(source) {
  const tree = ts.createSourceFile('retained.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  assert.equal(tree.parseDiagnostics.length,0);
  const descendants = root => { const all=[]; const visit=n=>{all.push(n);ts.forEachChild(n,visit);};visit(root);return all; };
  const nodes=descendants(tree);
  const prop=(obj,key)=>obj.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree).replace(/^['"]|['"]$/g,'')===key);
  const one=(items,why)=>{assert.equal(items.length,1,why);return items[0];};
  const pinObject=one(nodes.filter(n=>ts.isObjectLiteralExpression(n)&&prop(n,'name')?.initializer.text==='postalCode'),'one checkout PIN field');
  const blur=prop(pinObject,'onBlur');assert(blur,'Original blur-only PIN handler required');
  const lookupCall=one(descendants(blur).filter(n=>ts.isCallExpression(n)&&n.arguments.length===2&&n.arguments[0].getText(tree).endsWith('.currentTarget.value')&&n.arguments[1].getText(tree).endsWith('.currentTarget.form')),'PIN lookup call');
  let lookupExpression=lookupCall.expression;
  while(ts.isParenthesizedExpression(lookupExpression))lookupExpression=lookupExpression.expression;
  const inline=ts.isFunctionExpression(lookupExpression);
  assert(inline||ts.isIdentifier(lookupExpression),'Known inline or declared PIN lookup');
  const lookupName=inline?'hidiCheckDeliveryPin':lookupExpression.text;
  let component=pinObject.parent;
  while(component && !(ts.isFunctionLike(component)&&component.body&&ts.isBlock(component.body)))component=component.parent;
  assert(component,'Checkout component boundary');
  const scoped=descendants(component);
  const lookup=inline?lookupExpression:one(scoped.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===lookupName),'PIN lookup declaration');
  const formName=lookup.parameters[1].name.getText(tree);
  const lookupNodes=descendants(lookup);
  const stateChecking=one(lookupNodes.filter(n=>ts.isObjectLiteralExpression(n)&&prop(n,'status')?.initializer.text==='checking'),'PIN checking state');
  const pinProp=stateChecking.properties.find(p=>p.name?.getText(tree)==='pin');
  const pinName=ts.isShorthandPropertyAssignment(pinProp)?pinProp.name.text:pinProp.initializer.getText(tree);
  const form=one(scoped.filter(n=>ts.isObjectLiteralExpression(n)&&prop(n,'className')?.initializer.text==='checkout-form'),'checkout form');
  const inputNodes=descendants(prop(pinObject,'onInput'));
  const payment=one(inputNodes.filter(n=>ts.isCallExpression(n)&&n.arguments.length===1&&n.arguments[0].text==='RAZORPAY'),'payment reset').expression.getText(tree);
  const delivery=one(inputNodes.filter(n=>ts.isCallExpression(n)&&n.arguments.length===1&&ts.isObjectLiteralExpression(n.arguments[0])&&prop(n.arguments[0],'status')?.initializer.text==='idle'),'delivery reset').expression.getText(tree);
  const formCalls=descendants(prop(form,'onChange')).filter(ts.isCallExpression);
  const invalidate=one(formCalls.filter(n=>n.arguments.length===1&&(n.arguments[0].kind===ts.SyntaxKind.FalseKeyword||n.arguments[0].getText(tree)==='!1')),'checkout invalidation').expression.getText(tree);
  const error=one(formCalls.filter(n=>n.arguments.length===1&&n.arguments[0].text===''),'checkout error reset').expression.getText(tree);
  const abort=one(lookupNodes.filter(n=>ts.isCallExpression(n)&&n.expression.name?.text==='abort'&&n.getText(tree).includes('.current')),'delivery request cancellation').getText(tree);
  const effect=one(scoped.filter(n=>ts.isArrowFunction(n)&&ts.isBlock(n.body)&&n.body.getText(tree).includes('/checkout/payment-options')&&!n.body.getText(tree).includes('postalCode')),'payment options effect');
  const cleanup=one(effect.body.statements.filter(ts.isReturnStatement),'payment options cleanup');
  const edits=[];const edit=(start,end,text)=>edits.push({start,end,text,original:source.slice(start,end)});
  const helper=ts.transpileModule(readFileSync(new URL('../../apps/web/lib/checkout-pin.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('export function observeCheckoutPin','function observeCheckoutPin');
  assert(!source.includes('observeCheckoutPin'),'PIN observer already installed');
  edit(effect.body.getStart(tree)+1,effect.body.getStart(tree)+1,`const hidiStopPin=observeCheckoutPin(${lookupName},()=>{${abort};${payment}("RAZORPAY");${delivery}({status:"idle"});${invalidate}(false);${error}("");});`);
  // The minifier can move setup side effects into the cleanup return's comma expression.
  // Evaluate that expression now, then wrap only the returned cleanup function.
  edit(cleanup.getStart(tree),cleanup.end,`return ((hidiOriginalCleanup)=>()=>{hidiOriginalCleanup();hidiStopPin();})((${cleanup.expression.getText(tree)}));`);
  // Remove the trailing property comma as well, leaving the original input sanitizer intact.
  const following=source.slice(blur.end).match(/^\s*,/);assert(following,'PIN blur property separator');
  edit(blur.getStart(tree),blur.end+following[0].length,'');
  const lookupEdits=[];
  const editLookup=(start,end,text)=>inline?lookupEdits.push({start:start-lookup.getStart(tree),end:end-lookup.getStart(tree),text}):edit(start,end,text);
  const responseGuards=lookupNodes.filter(n=>ts.isPropertyAccessExpression(n)&&n.name.text==='aborted');
  assert.equal(responseGuards.length,2,'Both success and failure response guards');
  for(const aborted of responseGuards)editLookup(aborted.getStart(tree),aborted.end,`(${aborted.getText(tree)}||(${formName}&&${formName}.elements.namedItem("postalCode")?.value!==${pinName}))`);
  const pattern=one(lookupNodes.filter(n=>n.kind===ts.SyntaxKind.RegularExpressionLiteral&&n.getText(tree)==='/^\\d{6}$/'),'PIN validation pattern');
  editLookup(pattern.getStart(tree),pattern.end,'/^[1-9][0-9]{5}$/');
  let lifted='';
  if(inline){let code=lookup.getText(tree);for(const e of lookupEdits.sort((a,b)=>b.start-a.start))code=code.slice(0,e.start)+e.text+code.slice(e.end);lifted=`const ${lookupName}=${code};`;}
  edit(component.body.getStart(tree)+1,component.body.getStart(tree)+1,helper+lifted);
  edits.sort((a,b)=>a.start-b.start);for(let i=1;i<edits.length;i++)assert(edits[i-1].end<=edits[i].start,'bounded edits');
  let output=source;for(const e of [...edits].reverse())output=output.slice(0,e.start)+e.text+output.slice(e.end);
  let restored=output,offset=0;for(const e of edits){const at=e.start+offset;assert.equal(restored.slice(at,at+e.text.length),e.text);restored=restored.slice(0,at)+e.original+restored.slice(at+e.text.length);}
  assert.equal(restored,source,'All unrelated bytes preserved');
  assert.equal(ts.createSourceFile('patched.js',output,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
  return {output,changes:edits.length,inverseTransformsVerified:true,paymentSubmissionPreserved:true};
}
if(process.argv[2]){const {output,...report}=patch(readFileSync(process.argv[2],'utf8'));writeFileSync(process.argv[3],output);console.log(JSON.stringify({passed:true,...report}));}
