import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFirstFrames} from './first-frame-probe.mjs';

const observed=()=>({version:1,sampledFrames:12,contentFrames:10,nativeHeroFrames:5,validGeometryFrames:10,emptyLoadingFrames:2,overflow:false,violations:[]});
test('empty parser frames do not invalidate later observed native content',()=>{
 assert.equal(assertFirstFrames(observed()).emptyLoadingFrames,2);
});
test('settled success cannot erase a previously observed text-only frame',()=>{
 const result=observed();result.violations.push({code:'text-only-discovery-frame',firstAt:16,lastAt:32,frames:2});
 assert.throws(()=>assertFirstFrames(result),/text-only-discovery-frame/);
});
test('a final client hero cannot substitute for observing the native first HTML hero',()=>{
 assert.throws(()=>assertFirstFrames({...observed(),nativeHeroFrames:0}),/native first-HTML hero/);
});
test('missing observer or absent frames cannot pass',()=>{
 assert.throws(()=>assertFirstFrames(null),/not installed/);
 assert.throws(()=>assertFirstFrames({...observed(),contentFrames:0}),/no content frame/);
});
test('concealed page, absent geometry or truncated evidence cannot pass',()=>{
 assert.throws(()=>assertFirstFrames({...observed(),validGeometryFrames:0}),/header\/hero\/video/);
 assert.throws(()=>assertFirstFrames({...observed(),overflow:true}),/limit exceeded/);
 assert.throws(()=>assertFirstFrames({...observed(),violations:[{code:'page-concealed',firstAt:16}]}),/page-concealed/);
});
test('a transient announcement and header intersection cannot be hidden by the settled frame',()=>{
 assert.throws(()=>assertFirstFrames({...observed(),violations:[{code:'announcement-header-overlap',firstAt:8,lastAt:24,frames:2}]}),/announcement-header-overlap/);
});
