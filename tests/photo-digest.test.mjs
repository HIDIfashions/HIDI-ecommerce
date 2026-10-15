import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {photoDigest} from '../apps/web/lib/photo-digest.mjs';
const bytes=Buffer.alloc(3*1024*1024+17,90);
const expected=createHash('sha256').update(bytes).digest('hex');
test('photo digest matches SHA-256 without whole-file arrayBuffer',async()=>{
 const file=new File([bytes],'fixture.jpg');file.arrayBuffer=()=>{throw new Error('Whole-file read forbidden');};assert.equal(await photoDigest(file),expected);
});
test('photo digest supports streams without Symbol.asyncIterator',async()=>{
 const file=new File([bytes],'fixture.jpg'),stream=file.stream();const input={stream:()=>({getReader:()=>stream.getReader()})};assert.equal(await photoDigest(input),expected);
});
test('photo digest fallback never reads more than one MiB per slice',async()=>{
 const file=new File([bytes],'fixture.jpg'),sizes=[];const input={size:file.size,slice:(a,b)=>{sizes.push(b-a);return file.slice(a,b);},arrayBuffer:()=>{throw Error('Whole-file read forbidden');}};assert.equal(await photoDigest(input),expected);assert.equal(sizes.length,4);assert.ok(sizes.every(n=>n<=1024*1024));
});
test('photo digest releases the reader lock after a read failure',async()=>{
 let released=false;await assert.rejects(()=>photoDigest({stream:()=>({getReader:()=>({read:async()=>{throw Error('read failed');},releaseLock:()=>{released=true;}})})}),/read failed/);assert.equal(released,true);
});
