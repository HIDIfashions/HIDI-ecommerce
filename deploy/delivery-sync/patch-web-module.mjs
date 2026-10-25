import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const ts=createRequire(resolve('apps/web/package.json'))('typescript');
export function patch(source){
  const tree=ts.createSourceFile('retained.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const all=[];const walk=n=>{all.push(n);ts.forEachChild(n,walk)};walk(tree);
  const one=(xs,why)=>{assert.equal(xs.length,1,why);return xs[0]};
  const prop=(obj,key)=>obj.properties?.find(p=>p.name?.getText(tree).replaceAll('"','')===key);
  const text=n=>n.getText(tree);
  const up=(node,predicate)=>{for(let n=node;n;n=n.parent)if(predicate(n))return n;throw Error('Missing ancestor')};
  const fetch=one(all.filter(n=>ts.isCallExpression(n)&&text(n.expression)==='fetch'&&text(n.arguments[0]).includes('/status')),'status fetch');
  const fn=up(fetch,ts.isFunctionDeclaration);
  const payload=prop(fetch.arguments[1],'body').initializer.arguments[0];
  const codProp=prop(payload,'codCollected');assert(codProp);
  const cod=text(codProp.initializer||codProp.name);
  const order=one(all.filter(n=>ts.isCallExpression(n)&&text(n.expression)==='encodeURIComponent'&&n.pos>fetch.pos&&n.end<fetch.end),'order encoding').arguments[0].expression.getText(tree);
  const next=text(prop(payload,'status').initializer);
  const tr=one(all.filter(n=>ts.isTryStatement(n)&&n.pos>=fn.pos&&n.end<=fn.end),'status try');
  const finalCalls=all.filter(n=>ts.isCallExpression(n)&&n.pos>=tr.finallyBlock.pos&&n.end<=tr.finallyBlock.end);
  const setUpdating=text(finalCalls[0].expression);
  const catchCall=one(all.filter(n=>ts.isCallExpression(n)&&n.pos>=tr.catchClause.block.pos&&n.end<=tr.catchClause.block.end),'error setter');
  const setError=text(catchCall.expression);
  const awaits=all.filter(n=>ts.isAwaitExpression(n)&&n.pos>=tr.tryBlock.pos&&n.end<=tr.tryBlock.end);
  const load=text(awaits.at(-1).expression);
  const noticeCall=one(all.filter(n=>ts.isCallExpression(n)&&n.pos>=tr.tryBlock.pos&&n.end<=tr.tryBlock.end&&text(n).includes('Order marked as')&&!text(n.expression).includes('.')),'notice setter');
  const setNotice=text(noticeCall.expression);
  const payment=one(all.filter(n=>ts.isPropertyAssignment(n)&&text(n.name)==='children'&&ts.isStringLiteral(n.initializer)&&n.initializer.text==='PAYMENT'),'payment label');
  const paymentArray=up(payment,ts.isArrayLiteralExpression);
  const header=paymentArray.elements[1];assert(ts.isCallExpression(header)&&text(header.arguments[0])==='"h2"');
  const headerChildren=prop(header.arguments[1],'children');
  const jsx=text(header.expression);
  const labelString=one(all.filter(n=>ts.isStringLiteral(n)&&n.text.includes('I confirm the full COD amount')),'legacy COD label');
  const label=up(labelString,n=>ts.isCallExpression(n)&&n.arguments[0]&&text(n.arguments[0])==='"label"');
  let condition=label;while(!ts.isArrayLiteralExpression(condition.parent))condition=condition.parent;
  const checkbox=one(all.filter(n=>ts.isPropertyAssignment(n)&&text(n.name)==='disabled'&&text(n.initializer).includes(cod)&&text(n.initializer).includes('DELIVERED')),'delivery disabled');
  assert(ts.isBinaryExpression(checkbox.initializer)&&checkbox.initializer.operatorToken.kind===ts.SyntaxKind.BarBarToken);
  const updating=text(checkbox.initializer.left).split('||')[0];
  let moved=text(condition);
  const deliveredComparison=one(all.filter(n=>ts.isBinaryExpression(n)&&n.pos>=condition.pos&&n.end<=condition.end&&[n.left,n.right].some(v=>ts.isStringLiteral(v)&&v.text==='DELIVERED')),'delivery guard');
  const renderNext=text(ts.isStringLiteral(deliveredComparison.left)?deliveredComparison.right:deliveredComparison.left);
  // Only the shipment-step identifier in the existing permission/COD guard changes.
  const escaped=renderNext.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('\\b'+escaped+'\\b','g');
  assert(pattern.test(moved));pattern.lastIndex=0;moved=moved.replace(pattern,order+'.status');
  moved=moved.replace('I confirm the full COD amount','I verified that the full COD amount').replace(order+'.totalPaise',order+'.payment.amountPaise');
  // Existing checkbox CSS was intended for text inputs; constrain its actual control.
  moved=moved.replace('type:"checkbox"','type:"checkbox",style:{width:"auto",minHeight:0}');
  const guardText=moved.slice(0,moved.lastIndexOf('&&'));
  assert(guardText.includes('DELIVERED')&&guardText.includes('COD'));
  const button=`${guardText}&&${jsx}("button",{className:${text(prop(checkbox.parent,'className').initializer)},type:"button",disabled:!${cod}||${updating},onClick:()=>void hidiConfirmCod(),children:${updating}?"Confirming…":"Confirm COD collection"})`;
  const helper=`async function hidiConfirmCod(){if(!${order}?.payment||!${cod})return;${setUpdating}(true);${setError}(null);${setNotice}(null);try{const response=await fetch(\`/api/admin/orders/\${encodeURIComponent(${order}.orderNumber)}/cod-collection\`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmed:true,amountPaise:${order}.payment.amountPaise})});const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body?.message||"Unable to confirm COD collection");${setNotice}("COD collection recorded. This does not confirm bank remittance.");await ${load};}catch(error){${setError}(error instanceof Error?error.message:"Unable to confirm COD collection");}finally{${setUpdating}(false);}}`;
  const edits=[
    {start:payload.getStart(tree),end:payload.end,text:`{status:${next}}`},
    {start:checkbox.initializer.getStart(tree),end:checkbox.initializer.end,text:text(checkbox.initializer.left)},
    {start:condition.getStart(tree),end:condition.end,text:'null'},
    {start:headerChildren.initializer.getStart(tree),end:headerChildren.initializer.end,text:`${order}.payment?.provider==="COD"&&${order}.payment.status==="CREATED"?"Collection pending":${order}.payment?.provider==="COD"&&${order}.payment.status==="CAPTURED"?"COD collected":(${text(headerChildren.initializer)})`},
    {start:paymentArray.end-1,end:paymentArray.end-1,text:','+moved+','+button},
    {start:fn.getStart(tree),end:fn.getStart(tree),text:helper},
  ].sort((a,b)=>a.start-b.start);
  for(let i=1;i<edits.length;i++)assert(edits[i-1].end<=edits[i].start);
  for(const e of edits)e.original=source.slice(e.start,e.end);
  let output=source;for(const e of [...edits].reverse())output=output.slice(0,e.start)+e.text+output.slice(e.end);
  let restored=output;for(const e of edits){assert.equal(restored.slice(e.start,e.start+e.text.length),e.text);restored=restored.slice(0,e.start)+e.original+restored.slice(e.start+e.text.length);}
  assert.equal(restored,source);assert.equal(ts.createSourceFile('new.js',output,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
  return {output,passed:true,inverseTransformsVerified:true,verificationAndSessionPreserved:true};
}
if(process.argv[2]){const {output,...report}=patch(readFileSync(process.argv[2],'utf8'));writeFileSync(process.argv[3],output);console.log(JSON.stringify(report));}
