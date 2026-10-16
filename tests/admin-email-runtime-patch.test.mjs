import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { patch } from '../deploy/admin-email-auth/patch-module.mjs';
const ts=createRequire(resolve('apps/web/package.json'))('typescript');
const original=execFileSync('git',['show','04447f465df48f3a9be5b6a5e2cde693dffa7823:apps/web/lib/admin-supabase-auth.ts'],{encoding:'utf8'});
const source=ts.transpileModule(original,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
test('retained runtime patch rejects unlisted staff without provider fallback',async()=>{
  const result=patch(source);const calls=[];const exports={};
  vm.runInNewContext(result.output,{exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.example.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture'}},fetch:async(url,options)=>{calls.push({url,options});return {ok:false,json:async()=>({message:'This email is not authorised for HIDI Admin'})};}});
  await assert.rejects(()=>exports.sendAdminEmailOtp('unlisted@example.test'),/not authorised/);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/store/auth/admin/otp/request');assert.deepEqual(JSON.parse(calls[0].options.body),{email:'unlisted@example.test'});
  assert.equal(calls[0].options.headers.apikey,undefined);
  assert.throws(()=>exports.normalizeAdminEmail('a@@b.test'),/valid admin email/);
  assert.throws(()=>exports.normalizeAdminEmail('a'.repeat(250)+'@b.test'),/valid admin email/);
  assert(result.inverseTransformsVerified && result.verificationAndSessionPreserved);
});
test('runtime patch fails closed on changed or already patched provider code',()=>{
  assert.throws(()=>patch(source.replace('/auth/v1/otp','/unexpected')));
  assert.throws(()=>patch(patch(source).output));
});
