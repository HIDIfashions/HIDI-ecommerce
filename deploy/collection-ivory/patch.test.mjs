import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'hidi-ivory-')),base=join(dir,'base'),out=join(dir,'out');
  const name='apps/web/.next/server/app/collections/all/page.js';
  const heading='(0,d.jsx)("header",{className:"collection-header",children:(0,d.jsx)("h1",{children:i})})';
  const guide='(0,d.jsxs)("details",{className:"hidi-collection-guidance",children:[(0,d.jsx)("summary",{children:"Discover HIDI kurta sets"})]})';
  const before='const i="HIDI Kurta Sets & Indian Wear";const metadata={title:i,description:"KEEP METADATA"};const breadcrumb={position:2,name:i,item:absoluteUrl("/collections/all")};const page=['+heading+',browser(products),'+guide+'];const keep="UNCHANGED";';
  const wrapper='const storefrontLayerFix = `<style>:root{--hidi-page-bg:#fbf6f2}</style>`;const purchasing="KEEP";';
  mkdirSync(dirname(join(base,name)),{recursive:true});writeFileSync(join(base,name),before);writeFileSync(join(base,'server.mjs'),wrapper);
  return {base,out,name,before,wrapper,heading,guide};
}
const run=f=>spawnSync(process.execPath,['deploy/collection-ivory/patch.mjs',f.base,f.out],{encoding:'utf8'});
test('only approved collection nodes and background token change; metadata and runtime remain intact',()=>{
  const f=fixture(),result=run(f);assert.equal(result.status,0,result.stderr);
  const page=readFileSync(join(f.out,f.name),'utf8');
  assert.equal(page,f.before.replace(f.heading,f.heading.replace('children:i','children:"Shop All"')).replace('position:2,name:i','position:2,name:"Shop All"').replace(f.guide,'null'));
  assert.equal(readFileSync(join(f.base,f.name),'utf8'),f.before);
  const wrapper=readFileSync(join(f.out,'server.mjs'),'utf8');assert(wrapper.includes('--hidi-page-bg: #f3ebdd;'));
  assert.equal(wrapper.replace(/\n\/\* hidi-collection-ivory-20261104 \*\/[\s\S]*?(?=<\/style>)/,''),f.wrapper);
  const report=JSON.parse(readFileSync('evidence/collection-ivory/patch.json','utf8'));assert.deepEqual(report.allowedFiles,[f.name,'server.mjs']);
  for(const file of report.allowedFiles)assert.equal(spawnSync(process.execPath,['--check',join(f.out,file)]).status,0);
});
test('unexpected live heading fails before producing any overlay',()=>{
  const f=fixture();writeFileSync(join(f.base,f.name),f.before.replace('children:i','children:changed'));
  assert.notEqual(run(f).status,0);assert.throws(()=>readdirSync(f.out));
});
test('duplicate guidance fails closed',()=>{
  const f=fixture();writeFileSync(join(f.base,f.name),f.before+'const extra='+f.guide+';');
  assert.notEqual(run(f).status,0);assert.throws(()=>readdirSync(f.out));
});
