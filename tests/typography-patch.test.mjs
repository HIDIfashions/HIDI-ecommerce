import test from 'node:test';
import assert from 'node:assert/strict';
import {patchRuntime,patchNavigation} from '../deploy/typography/patch.mjs';
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
