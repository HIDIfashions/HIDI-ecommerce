import test from 'node:test';
import assert from 'node:assert/strict';
import {patchRuntime,patchNavigation,compose} from '../deploy/typography/patch.mjs';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const source=['import { createHeroMediaHandler } from "./hero-media.mjs";','const handleHeroMedia = createHeroMediaHandler({ origin, hasStorefront });','function injectSeo(html, request, pathname) {\nreturn html;\n}','function injectStorefrontLayerFix(html, pathname) {\nreturn html;\n}','  if (await performanceHandler.handle(request, response, pathname)) return;'].join('\n');
test('runtime installer covers landing, streamed shopping and early admin handlers',()=>{const output=patchRuntime(source);assert.match(output,/wrapTypography\(request/);assert.equal(output.match(/html = injectTypography/g).length,2);assert(output.indexOf('handleTypography(request')<output.indexOf('performanceHandler.handle'));});
test('installer refuses changed, duplicate and already-patched anchors',()=>{assert.throws(()=>patchRuntime(source.replace('function injectSeo','function other')));assert.throws(()=>patchRuntime(source+source));assert.throws(()=>patchRuntime(patchRuntime(source)));});
test('navigation installer adds an owner-only entry without replacing existing tools',()=>{const input='  const tools = [\n {key:"existing"}\n];\n      for (const tool of tools) {\n}';const output=patchNavigation(input);assert.match(output,/owner: true/);assert.match(output,/privacy-policy/);assert.match(output,/key:"existing"/);assert.throws(()=>patchNavigation(output));});

test('explicit upgrade retains every installed runtime and navigation byte',()=>{
 const runtime=patchRuntime(source),nav=patchNavigation('  const tools = [\n];\n      for (const tool of tools) {\n}');
 assert.equal(patchRuntime(runtime,{allowInstalled:true}),runtime);
 assert.equal(patchNavigation(nav,{allowInstalled:true}),nav);
 assert.throws(()=>patchRuntime(runtime.replace('  wrapTypography(request, response, pathname);',''),{allowInstalled:true}));
 assert.throws(()=>patchNavigation(nav.replace('owner: true','owner: false'),{allowInstalled:true}));
});
test('library upgrade protects all previously installed font bytes and provenance',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'hidi-type-upgrade-'));
 try{
  const base=join(folder,'base'),overlay=join(folder,'overlay');
  await mkdir(join(base,'admin-tools'),{recursive:true});
  await cp(new URL('../deploy/typography/',import.meta.url),join(base,'typography'),{recursive:true,filter:path=>!path.endsWith('__pycache__')});
  await writeFile(join(base,'server.mjs'),patchRuntime(source));
  await writeFile(join(base,'admin-tools/navigation.js'),patchNavigation('  const tools = [\n];\n      for (const tool of tools) {\n}'));
  const manifestPath=join(base,'typography/fonts/manifest.json');
  const installedFiles=JSON.parse(await readFile(new URL('fixtures/typography-installed-fonts.json',import.meta.url),'utf8'));
  const manifest=JSON.parse(await readFile(manifestPath,'utf8')).filter(entry=>(entry.files||[{file:entry.name+'.woff2'}]).every(face=>Object.hasOwn(installedFiles,face.file)));
  assert.equal(manifest.length,11);await writeFile(manifestPath,JSON.stringify(manifest));
  const report=await compose(base,overlay);assert.equal(report.allowedFiles.length,70);assert(report.protectedFilesUnchanged);
  for(const file of Object.keys(installedFiles))assert(report.protectedFiles.includes('typography/fonts/'+file));
  const poppins=join(base,'typography/fonts/poppins-400.woff2'),original=await readFile(poppins);
  await writeFile(poppins,Buffer.from('modified previous font'));
  await assert.rejects(compose(base,overlay),/Protected file changed: typography\/fonts\/poppins-400.woff2/);
  await writeFile(poppins,original);manifest.find(entry=>entry.name==='poppins').version='unexpected';await writeFile(manifestPath,JSON.stringify(manifest));
  await assert.rejects(compose(base,overlay),/Installed font provenance changed: poppins/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
