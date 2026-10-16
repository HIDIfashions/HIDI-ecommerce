import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
// The prepared candidate is preferred; a completed local build is also a real runtime.
const root=process.env.HIDI_CANDIDATE_RUNTIME||'.';
const source=readFileSync(join(root,'apps/web/.next/server/app/api/admin/inventory/[variantId]/images/route.js'),'utf8');
const {createRequire}=await import('node:module');
const {resolve}=await import('node:path');
const ts=createRequire(resolve('apps/web/package.json'))('typescript');
const tree=ts.createSourceFile('route.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
assert.equal(tree.parseDiagnostics.length,0);
const nodes=[];const walk=node=>{nodes.push(node);ts.forEachChild(node,walk);};walk(tree);
const declarations=nodes.filter(n=>ts.isVariableDeclaration(n)&&n.initializer&&/String\(\w+\.get\("imageSku"\)/.test(n.initializer.getText(tree)));
assert.equal(declarations.length,1,'One real Image SKU validation block is required');
const declaration=declarations[0],image=declaration.name.getText(tree),statement=declaration.parent.parent;
const branch=nodes.find(n=>ts.isIfStatement(n)&&n.expression.getText(tree)===image);
assert(branch,'Image SKU validation must remain conditional for legacy uploads');
const branchNodes=[];const visit=n=>{branchNodes.push(n);ts.forEachChild(n,visit);};visit(branch);
const assignment=branchNodes.find(n=>ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&n.right.getText(tree).includes('.arrayBuffer()'));
assert(assignment,'Server-read file bytes must be included in the upload digest');
const keyName=assignment.left.getText(tree),hashName=assignment.right.expression.getText(tree);
const arrayCall=branchNodes.find(n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='arrayBuffer');
const file=arrayCall.expression.expression.getText(tree),form=declaration.initializer.getText(tree).match(/String\((\w+)\.get/)[1];
const jsonReturn=branchNodes.find(n=>ts.isReturnStatement(n)&&n.expression?.getText(tree).includes('NextResponse.json'));
const namespace=jsonReturn?.expression.getText(tree).match(/^(\w+)\.NextResponse\.json/)?.[1]||'unusedNextResponse';
const declared=statement.declarationList.declarations.some(n=>n.name.getText(tree)===keyName);
const block=(declared?'':'let '+keyName+';')+statement.getText(tree)+branch.getText(tree)+';return '+keyName+';';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const calculate=new AsyncFunction(form,file,hashName,namespace,block);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function key(code='KUR_001',number='1',bytes='original',type='image/jpeg'){
  const formData=new FormData();formData.set('imageSku',code);formData.set('photoNumber',number);
  const result=await calculate(formData,new File([bytes],'photo.jpeg',{type}),hash,{NextResponse:{json:(body,options)=>({body,status:options.status})}});
  if(result?.status>=400)throw Error(result.body.message);
  return result;
}
process.env.MEDIA_STORAGE_PROVIDER='azure';
test('actual retained upload route derives stable keys from server-read file bytes',async()=>{
  assert.equal(await key(),hash(['KUR_001','1','image/jpeg',hash('original')].join('\u0000')));
  assert.equal(await key(),await key());
  for(const changed of [await key('KUR_002'),await key('KUR_001','2'),await key('KUR_001','1','changed'),await key('KUR_001','1','original','image/webp')])assert.notEqual(changed,await key());
});
test('actual retained route validates mapping fields and keeps legacy uploads optional',async()=>{
  assert.equal(await key(''),undefined);await assert.rejects(key('../bad'));await assert.rejects(key('KUR_001','0'));await assert.rejects(key('KUR_001','0001'));
  process.env.MEDIA_STORAGE_PROVIDER='other';try{await assert.rejects(key(),/Azure/);}finally{process.env.MEDIA_STORAGE_PROVIDER='azure';}
});
const storage=source.match(/let (?<blob>\w+)=(?<container>\w+)\(\)\.getBlockBlobClient\((?<key>\w+)\);try\{await \k<blob>\.uploadData\((?<bytes>\w+),\{conditions:\{ifNoneMatch:"\*"\},blobHTTPHeaders:\{blobContentType:(?<mime>\w+),/);
assert(storage,'Retained Azure upload retry guard must be installed');
const result=source.slice(storage.index).match(/return\{url:`\$\{(?<base>\w+)\}\/\$\{\w+\}`,storagePath:`azure:\/\/product-media\/\$\{\w+\}`\}/);
assert(result,'Retained Azure upload result must remain unchanged');
const storageBlock=source.slice(storage.index,storage.index+result.index+result[0].length);
const upload=new AsyncFunction(storage.groups.key,storage.groups.bytes,storage.groups.mime,result.groups.base,storage.groups.container,storageBlock);
function blobFixture({status=412,bytes=Buffer.from('original'),type='image/jpeg',length=bytes.length}={}){
  const calls={writes:0,properties:0,reads:0};
  const blob={uploadData:async(body,options)=>{calls.writes++;assert.equal(options.conditions.ifNoneMatch,'*');if(status)throw Object.assign(new Error('Upload conflict'),{statusCode:status});},getProperties:async()=>{calls.properties++;return {contentLength:length,contentType:type};},downloadToBuffer:async(offset,count)=>{calls.reads++;assert.equal(offset,0);assert.equal(count,Buffer.byteLength('original'));return bytes;}};
  return {calls,container:()=>({getBlockBlobClient:()=>blob})};
}
const batchPath='products/variants/v1/batch-'+hash('key')+'.jpg';
test('actual retained helper recovers a stored batch file only after checking its exact bytes',async()=>{
  for(const status of [409,412]){const fixture=blobFixture({status});const saved=await upload(batchPath,Buffer.from('original'),'image/jpeg','https://hidi.test/media',fixture.container);assert.equal(saved.url,'https://hidi.test/media/'+batchPath);assert.equal(saved.storagePath,'azure://product-media/'+batchPath);assert.deepEqual(fixture.calls,{writes:1,properties:1,reads:1});}
  const fresh=blobFixture({status:0});await upload(batchPath,Buffer.from('original'),'image/jpeg','https://hidi.test/media',fresh.container);assert.deepEqual(fresh.calls,{writes:1,properties:0,reads:0});
});
test('actual retained helper never overwrites conflicting files or bypasses legacy and permission failures',async()=>{
  for(const options of [{bytes:Buffer.from('replaced')},{type:'image/webp'},{length:1}]){const fixture=blobFixture(options);await assert.rejects(upload(batchPath,Buffer.from('original'),'image/jpeg','https://hidi.test/media',fixture.container),/differs/);assert.equal(fixture.calls.writes,1);}
  for(const [path,status] of [['products/variants/v1/random.jpg',412],[batchPath,403]]){const fixture=blobFixture({status});await assert.rejects(upload(path,Buffer.from('original'),'image/jpeg','https://hidi.test/media',fixture.container));assert.equal(fixture.calls.properties,0);assert.equal(fixture.calls.reads,0);}
});
