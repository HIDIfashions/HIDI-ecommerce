import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {inlinePosterPath} from './poster-reference.mjs';
test('inline posters must exactly match a verified immutable AVIF digest',()=>{
 const bytes=Buffer.from('encoded AVIF'),sha=createHash('sha256').update(bytes).digest('hex'),path='/media-performance/assets/poster-'+sha.slice(0,16)+'.avif',mirror={files:{[path]:sha}},url='data:image/avif;base64,'+bytes.toString('base64');assert.equal(inlinePosterPath(url,mirror),path);for(const value of [url+'A',url.replace('avif','png'),'data:image/avif;base64,AAAA','https://other.test/image.avif'])assert.equal(inlinePosterPath(value,mirror),null);assert.equal(inlinePosterPath(url,{files:{[path]:'f'.repeat(64)}}),null);
});
