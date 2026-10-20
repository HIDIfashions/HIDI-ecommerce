import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME),children=[];
function run(args,options={}){const child=spawn(process.execPath,args,{stdio:'inherit',...options});children.push(child);return child;}
const fixture=run(['tests/pdp-refinement-fixture.mjs']);
const runtime=run([root+'/server.mjs'],{cwd:root,env:{...process.env,PORT:'3117',API_URL:'http://127.0.0.1:4000/v1',INTERNAL_API_URL:'http://127.0.0.1:4000/v1'}});
try{
 let ready=false;for(let i=0;i<180;i++){if(runtime.exitCode!==null||fixture.exitCode!==null)throw Error('Candidate runtime stopped');try{const r=await fetch('http://127.0.0.1:3117/healthz');if(r.ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,500));}assert(ready);
 const test=run(['tests/pdp-refinement.browser.mjs'],{env:{...process.env,PDP_BASE_URL:'http://127.0.0.1:3117',HIDI_BROWSER_ENGINES:'chromium,firefox,webkit',HIDI_VERIFY_COLLECTION_NAVIGATION:'1'}});
 assert.equal(await new Promise(done=>test.on('exit',done)),0);
 const cases=JSON.parse(await readFile('evidence/product-page/functional-results.json','utf8'));assert.equal(cases.length,15);
 await mkdir('evidence/product-page-release',{recursive:true});await writeFile('evidence/product-page-release/candidate.json',JSON.stringify({passed:true,cases,productionWrites:0},null,2));
}finally{for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');}
