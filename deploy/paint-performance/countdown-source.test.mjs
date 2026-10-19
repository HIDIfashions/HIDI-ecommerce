import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {COUNTDOWN_SOURCE_FILE,COUNTDOWN_SOURCE_SHA256,COUNTDOWN_OPTIMIZED_SHA256,optimizeCountdownSource,buildCountdownAsset} from './countdown-source.mjs';

const source=await readFile(fileURLToPath(new URL('../launch-countdown/countdown.js',import.meta.url)),'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function withFixture(run){
 const root=await mkdtemp(join(tmpdir(),'hidi-countdown-source-'));
 try{await run(root);}finally{
  assert(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hidi-countdown-source-'),'Only this test fixture may be removed');
  await rm(root,{recursive:true,force:true});
 }
}

test('only the reviewed countdown produces the exact browser-tested copy across checkout line endings',()=>{
 assert.equal(hash(source.replace(/\r\n/g,'\n')),COUNTDOWN_SOURCE_SHA256);
 const lf=optimizeCountdownSource(source),crlf=optimizeCountdownSource(source.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));
 assert.equal(lf,crlf);
 assert.equal(hash(lf),COUNTDOWN_OPTIMIZED_SHA256);
});

test('countdown copy leaves the original file and unrelated assets byte-identical',async()=>withFixture(async root=>{
 const base=join(root,'base'),overlay=join(root,'overlay');
 await mkdir(join(base,'dist'),{recursive:true});
 await mkdir(join(overlay,'dist/assets'),{recursive:true});
 const originalBytes=Buffer.from(source);
 await writeFile(join(base,COUNTDOWN_SOURCE_FILE),originalBytes);
 await writeFile(join(overlay,'dist/assets/unrelated.js'),'window.keepMe=true;');
 const result=await buildCountdownAsset(base,overlay);
 assert.deepEqual(result,{url:'/assets/home-countdown-de2c96f5b53a953c.js',sourceFile:COUNTDOWN_SOURCE_FILE,sourceSha256:COUNTDOWN_SOURCE_SHA256,sha256:COUNTDOWN_OPTIMIZED_SHA256,bytes:3349});
 assert.deepEqual(await readFile(join(base,COUNTDOWN_SOURCE_FILE)),originalBytes);
 assert.equal(await readFile(join(overlay,'dist/assets/unrelated.js'),'utf8'),'window.keepMe=true;');
 assert.equal(hash(await readFile(join(overlay,'dist',result.url))),COUNTDOWN_OPTIMIZED_SHA256);
 assert.equal(existsSync(join(overlay,COUNTDOWN_SOURCE_FILE)),false,'Original path must not be shadowed by an overlay');
 assert.deepEqual((await readdir(join(overlay,'dist/assets'))).sort(),['home-countdown-de2c96f5b53a953c.js','unrelated.js']);
}));

test('an unknown or changed countdown fails before any optimized asset is written',async()=>withFixture(async root=>{
 const base=join(root,'base'),overlay=join(root,'overlay');
 await mkdir(join(base,'dist'),{recursive:true});
 for(const changed of [source+'\n// new release',source.replace('2026-10-11T19:01:00+05:30','2026-10-12T19:01:00+05:30')]){
  await writeFile(join(base,COUNTDOWN_SOURCE_FILE),changed);
  await assert.rejects(buildCountdownAsset(base,overlay),/Unreviewed countdown source/);
  assert.equal(existsSync(overlay),false);
  assert.equal(await readFile(join(base,COUNTDOWN_SOURCE_FILE),'utf8'),changed);
 }
}));
