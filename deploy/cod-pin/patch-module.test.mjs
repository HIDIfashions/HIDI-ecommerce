import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {patch} from './patch-module.mjs';
const require=createRequire(resolve('apps/web/package.json'));
const ts=require(process.env.HIDI_TYPESCRIPT_MODULE||'typescript');
const terser=require(process.env.HIDI_TERSER_MODULE||'next/dist/compiled/terser');
const original=execFileSync('git',['show','4a8211c41655c3fa5a9f401007477b95e966912e:apps/web/components/checkout-client.tsx'],{encoding:'utf8'});
const compiled=ts.transpileModule(original,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
test('patch both readable and minified actual checkout, preserving every other byte',async()=>{
  const minified=(await terser.minify(compiled,{compress:true,mangle:true})).code;
  for(const input of [compiled,minified]){
    const result=patch(input);
    assert(result.inverseTransformsVerified&&result.paymentSubmissionPreserved);
    assert(result.output.includes('observeCheckoutPin'));
    assert.throws(()=>patch(result.output));
  }
});
test('restored PINs and silent changes trigger one lookup per value, and cleanup stops observation',async()=>{
  const form={},field={value:'500001',isConnected:true,form},document=new EventTarget(),window=new EventTarget();
  document.visibilityState='visible';document.querySelector=()=>field;
  const helper=ts.transpileModule(readFileSync('apps/web/lib/checkout-pin.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('export function','function');
  const observe=runInNewContext(helper+';observeCheckoutPin',{document,window,setTimeout,clearTimeout,setInterval,clearInterval});
  const calls=[];let changes=0;
  const stop=observe((pin,receivedForm)=>{assert.equal(receivedForm,form);calls.push(pin);},()=>changes++);
  try{
    await new Promise(done=>setTimeout(done,230));assert.deepEqual(calls,['500001']);
    document.dispatchEvent(new Event('input'));document.dispatchEvent(new Event('change'));
    await new Promise(done=>setTimeout(done,280));assert.deepEqual(calls,['500001']);
    field.value='500002';await new Promise(done=>setTimeout(done,500));assert.deepEqual(calls,['500001','500002']);
    field.value='000001';document.dispatchEvent(new Event('change'));await new Promise(done=>setTimeout(done,230));assert.equal(calls.length,2);
    field.value='5000';document.dispatchEvent(new Event('input'));await new Promise(done=>setTimeout(done,230));assert.equal(calls.length,2);
    assert.equal(changes,4);
  }finally{stop();}
  field.value='500003';document.dispatchEvent(new Event('input'));await new Promise(done=>setTimeout(done,300));assert.equal(calls.length,2);
});
