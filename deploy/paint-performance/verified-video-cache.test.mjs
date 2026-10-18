import test from 'node:test';import assert from 'node:assert/strict';
import {reuseVerifiedVideo,encodingRecipe,desktopEncodingRecipe,verifiedVideoFor} from './verified-video-cache.mjs';
test('the two current source videos cannot exchange their independently verified encoding recipes',()=>{
 const mobile='a0480a593165481d0a05f35c2cda7c66fbf1c591206b02249ce83cfab45d5202',desktop='7249196281f97f69519aac8f1a338239d1435b7f00728de49bc82748c0bddc9e';
 assert(verifiedVideoFor(mobile,encodingRecipe));assert(verifiedVideoFor(desktop,desktopEncodingRecipe));assert.equal(verifiedVideoFor(mobile,desktopEncodingRecipe),null);assert.equal(verifiedVideoFor(desktop,encodingRecipe),null);assert.equal(verifiedVideoFor(desktop,{...desktopEncodingRecipe,crf:42}),null);assert.equal(verifiedVideoFor('0'.repeat(64),desktopEncodingRecipe),null);
});
test('new originals never reuse a pinned encoding or request a remote asset',async()=>{
 let requests=0;assert.equal(await reuseVerifiedVideo(Buffer.from('new original'),'/unused',encodingRecipe,()=>requests++),false);assert.equal(requests,0);
});
test('a changed encoding recipe cannot silently use older cached bytes',async()=>{
 let requests=0;assert.equal(await reuseVerifiedVideo(Buffer.from('original'),'/unused',{...encodingRecipe,crf:32},()=>requests++),false);assert.equal(requests,0);
});
