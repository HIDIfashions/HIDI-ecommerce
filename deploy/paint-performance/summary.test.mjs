import test from 'node:test';import assert from 'node:assert/strict';import {summarizeTrials} from './summary.mjs';
test('each performance metric uses its own median rather than the LCP-middle trial',()=>{
 const trials=[{score:99,lcp:1865,blocking:20,cls:.03,bytes:6686444},{score:74,lcp:2461,blocking:0,cls:.01,bytes:2041517},{score:70,lcp:2691,blocking:10,cls:.02,bytes:6686420}],original=structuredClone(trials);
 const result=summarizeTrials(trials);assert.deepEqual(Object.fromEntries(['score','lcp','blocking','cls','bytes'].map(key=>[key,result[key]])),{score:74,lcp:2461,blocking:10,cls:.02,bytes:6686420});assert.deepEqual(trials,original);assert.equal(result.samples.length,3);
});
test('incomplete or nonnumeric measurements cannot silently pass the budget',()=>{
 assert.throws(()=>summarizeTrials([]));assert.throws(()=>summarizeTrials(Array(3).fill({score:99,lcp:2000,blocking:0,cls:0})));assert.throws(()=>summarizeTrials(Array(3).fill({score:99,lcp:NaN,blocking:0,cls:0,bytes:1000})));
});
