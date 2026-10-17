import test from 'node:test';import assert from 'node:assert/strict';
import {reuseVerifiedVideo,encodingRecipe} from './verified-video-cache.mjs';
test('new originals never reuse a pinned encoding or request a remote asset',async()=>{
 let requests=0;assert.equal(await reuseVerifiedVideo(Buffer.from('new original'),'/unused',encodingRecipe,()=>requests++),false);assert.equal(requests,0);
});
test('a changed encoding recipe cannot silently use older cached bytes',async()=>{
 let requests=0;assert.equal(await reuseVerifiedVideo(Buffer.from('original'),'/unused',{...encodingRecipe,crf:32},()=>requests++),false);assert.equal(requests,0);
});
