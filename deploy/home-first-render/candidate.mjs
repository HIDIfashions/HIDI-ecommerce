import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {startPreview} from '../responsive-hero/fixture.mjs';
import {probe} from './probe.mjs';
const runtime=resolve(process.env.HIDI_CANDIDATE_RUNTIME),root=resolve(process.env.RUNNER_TEMP,'hidi-first-render-fixture');
const snapshot=JSON.parse(await readFile(process.env.HIDI_FIRST_RENDER_SNAPSHOT,'utf8')),hero=snapshot.hero;
assert.equal(hero.items[0].type,'image','Review any independently changed hero before release');
await mkdir(join(root,'fixtures'),{recursive:true});
await symlink(runtime,join(root,'candidate'),'dir');await symlink(runtime,join(root,'baseline'),'dir');
await writeFile(join(root,'public-before.json'),JSON.stringify({'/api/hidi/landing-media-config':snapshot.landing}));
await writeFile(join(root,'fixtures/hero-config.json'),JSON.stringify(hero));
// The shared harness reads this unused video fixture even for image selections.
await writeFile(join(root,'fixtures/existing-hero.webm'),Buffer.alloc(0));
const initialAssets=[];
for(const item of hero.items){
 for(const url of [item.url,item.type==='image'?item.mobileUrl:null].filter(Boolean)){
  const response=await fetch(new URL(url,'https://hidiindia.com'));assert(response.ok);
  initialAssets.push({url,bytes:Buffer.from(await response.arrayBuffer()),type:response.headers.get('content-type')});
 }
}
process.env.HIDI_HERO_FIXTURE=root;
const preview=await startPreview(root,{handlerRoot:'candidate',initialHero:hero,initialAssets});
try{await probe(preview.base);assert.deepEqual(preview.writes,[]);assert.deepEqual(preview.unexpected,[]);}
catch(error){console.error(preview.runtimeLogs());throw error;}
finally{await preview.close();}
