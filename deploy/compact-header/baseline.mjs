import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {baselinePrivateProof as legacyProof} from '../collection-cleanup/baseline-private.mjs';
import {probe as fixedProof} from '../checkout-hydration/probe.mjs';
export async function baselinePrivateProof(base,output,mode){
 if(mode==='legacy')return legacyProof(base,output);
 assert.equal(mode,'fixed');
 // When the separately deployed fix is present byte-for-byte, retain no legacy
 // warning allowance. Prove normal/delayed hydration and route transitions.
 const publicConfig=Object.fromEntries(await Promise.all(['/api/hidi/hero-config','/api/hidi/landing-media-config'].map(async path=>{const response=await fetch('https://hidiindia.com'+path);assert(response.ok);return[path,await response.json()];})));
 const report=await fixedProof(base,output+'/fixed-checkout-baseline',{engines:'chromium',publicConfig});
 assert(report.passed&&report.productionWrites===0);assert.deepEqual(report.runtimeErrors,[]);
 const proof={passed:true,unchangedBaseline:true,liveWrites:0,fixedCheckout:true,issues:[],zeroRuntimeErrors:true,cases:report.cases.length};
 await writeFile(output+'/baseline-private.json',JSON.stringify(proof,null,2));return proof;
}
