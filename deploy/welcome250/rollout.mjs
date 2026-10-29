import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {existsSync} from 'node:fs';import {join,resolve} from 'node:path';
import {createAzureOfferStore} from '../offers/storage.mjs';import {welcomePlan,digest} from './plan.mjs';import {activate,recover} from './execute.mjs';
const mode=process.argv[2],privateDir=join(process.env.RUNNER_TEMP||'/tmp','hidi-welcome250-private'),evidence=resolve('evidence/welcome250'),planFile=join(privateDir,'plan.json');
await mkdir(privateDir,{recursive:true,mode:0o700});await mkdir(evidence,{recursive:true});
const az=args=>{try{return execFileSync('az',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw Error('Authorized Azure access is unavailable for this operation');}};
const images=()=>Object.fromEntries(['api','web'].map(app=>[app,az(['containerapp','show','-g','rg-hidi-prod','-n','hidi-'+app,'--query','properties.template.containers[0].image','-o','tsv','--only-show-errors'])]));
const source=()=>execFileSync('git',['ls-remote','origin','refs/heads/migration/azure-sql-blob'],{encoding:'utf8'}).split(/\s/)[0];
const request=async(path,expected=200)=>{const r=await fetch('https://hidiindia.com'+path,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(r.status,expected,path);return r;};
const publicJson=async path=>(await request(path)).json();
const assetPaths=['/offers-assets/editor.js','/offers-assets/offers.css','/offers-assets/checkout.js'];
async function assets(){return Object.fromEntries(await Promise.all(assetPaths.map(async path=>[path,digest(await(await request(path)).text())])));}
process.env.AZURE_STORAGE_ACCOUNT=az(['containerapp','show','-g','rg-hidi-prod','-n','hidi-web','--query',"properties.template.containers[0].env[?name=='AZURE_STORAGE_ACCOUNT'].value | [0]",'-o','tsv','--only-show-errors']);
assert(/^[a-z0-9]{3,24}$/.test(process.env.AZURE_STORAGE_ACCOUNT),'Expected existing private offer storage');
const store=createAzureOfferStore({getToken:async()=>az(['account','get-access-token','--resource','https://storage.azure.com/','--query','accessToken','-o','tsv','--only-show-errors'])});
const save=(name,value)=>writeFile(join(evidence,name),JSON.stringify(value,null,2));
if(mode==='prepare'){
 assert.equal(source(),process.env.GITHUB_SHA,'A newer release exists');
 assert.deepEqual(await publicJson('/api/hidi/offers/checkout-policy'),{available:false});
 assert.deepEqual(await publicJson('/api/hidi/offers'),{visible:false});
 const before=await store.load(),run=process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT;
 const plan={before,after:welcomePlan(before.value,{id:'welcome250-'+run,actor:'github-actions:'+process.env.GITHUB_ACTOR}),backupId:'welcome250-before-'+run,release:{sha:process.env.GITHUB_SHA,run,images:images(),assets:await assets(),paymentOptions:await publicJson('/api/store/checkout/payment-options')}};
 assert(Object.values(plan.release.images).every(image=>/@sha256:[a-f0-9]{64}$/.test(image)),'Release requires immutable live images');
 await writeFile(planFile,JSON.stringify(plan),{mode:0o600});
 await save('plan.json',{passed:true,sourceSha:plan.release.sha,welcomeEnabled:true,dressEnabled:false,minimumPaise:149900,discountPaise:25000,audience:'EVERYONE',version:plan.after.published.version,selectedDressCount:plan.after.draft.eligibleProductIds.length,applicationImageChanges:0,adminPageChanges:0});
 console.log('Prepared WELCOME250-only configuration; GET1 remains disabled. No campaign setting changed.');
}else if(mode==='apply'){
 const plan=JSON.parse(await readFile(planFile,'utf8'));
 for(const name of ['api-preservation.json','web-preservation.json','api-checkout.json','candidate/report.json','purchase-regression/report.json']){
  const report=JSON.parse(await readFile(join('evidence/checkout-offers',name),'utf8'));assert.equal(report.passed,true,name);
  if(name.includes('preservation'))assert.equal(report.unchanged,true,'The tested runtime must exactly match production');
 }
 const pricing=JSON.parse(await readFile(join(evidence,'pricing-payment.json'),'utf8'));assert(pricing.passed&&pricing.checks>=64&&pricing.get1Rejected&&pricing.welcomeOnly);
 const browser=JSON.parse(await readFile(join(evidence,'browser.json'),'utf8'));assert(browser.passed&&browser.results.length===6);
 const unchanged=async()=>{assert.equal(source(),plan.release.sha,'A newer release exists');assert.deepEqual(images(),plan.release.images,'Live application images changed');assert.deepEqual(await assets(),plan.release.assets,'Admin or checkout assets changed');};
 const verify=async()=>{
  const policy=await publicJson('/api/hidi/offers/checkout-policy');assert(policy.available&&policy.welcomeEnabled&&!policy.dressEnabled);assert.equal(policy.version,plan.after.published.version);assert.equal(policy.rules.welcomeMinimumPaise,149900);assert.equal(policy.rules.welcomeDiscountPaise,25000);assert.deepEqual(policy.eligibleProductIds,plan.after.draft.eligibleProductIds);
  const display=await publicJson('/api/hidi/offers');assert(display.visible);assert.equal(display.secondary,'');assert(display.primary.includes('WELCOME250'));assert(!display.terms.includes('GET1'));
  assert.deepEqual(await publicJson('/api/store/checkout/payment-options'),plan.release.paymentOptions);
  await request('/admin/offers',401);await request('/api/hidi/offers/admin',401);
 };
 try{const result=await activate({store,plan,unchanged,verify});await save('after.json',{...result,welcome250Active:true,get1Active:false,applicationImagesUnchanged:true,adminPageUnchanged:true,customerOrdersCreated:0,paymentsCreated:0,sourceSha:plan.release.sha});console.log('WELCOME250 is active. GET1 is inactive. Images, admin page and payment options are unchanged.');}
 catch(error){await save('failure.json',{passed:false,message:error.message,rollback:error.rollback});throw error;}
}else if(mode==='recover'){
 if(existsSync(planFile)){const plan=JSON.parse(await readFile(planFile,'utf8'));const result=await recover(store,plan);await save('recovery.json',result);console.log(JSON.stringify(result));}
}else throw Error('Use prepare, apply or recover');
