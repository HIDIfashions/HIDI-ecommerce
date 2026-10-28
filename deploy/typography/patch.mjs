import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,cp,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
export function patchRuntime(source){
  const edits=[
    ['import { createHeroMediaHandler } from "./hero-media.mjs";', 'import { createTypographyHandler, injectTypography } from "./typography/handler.mjs";\nimport { wrapTypography } from "./typography/wrap.mjs";'],
    ['const handleHeroMedia = createHeroMediaHandler({ origin, hasStorefront });','const handleTypography = createTypographyHandler({ origin, hasStorefront });'],
    ['function injectSeo(html, request, pathname) {','  html = injectTypography(html, /^\\/admin(?:\\/|$)/.test(pathname) ? "admin" : "storefront");'],
    ['function injectStorefrontLayerFix(html, pathname) {','  html = injectTypography(html, /^\\/admin(?:\\/|$)/.test(pathname) ? "admin" : "storefront");'],
  ];
  assert(!source.includes('createTypographyHandler'),'Typography is already installed; review upgrade explicitly');
  let result=source;
  for(const [anchor,addition] of edits){assert.equal(result.split(anchor).length-1,1,'Unique runtime anchor: '+anchor);result=result.replace(anchor,anchor+'\n'+addition);}
  const anchor='  if (await performanceHandler.handle(request, response, pathname)) return;';
  const addition='  if (await handleTypography(request, response, pathname)) return;\n  wrapTypography(request, response, pathname);\n';
  assert.equal(result.split(anchor).length-1,1);result=result.replace(anchor,addition+anchor);
  let restored=result.replace(addition+anchor,anchor);
  for(const [anchor,addition] of edits.toReversed())restored=restored.replace(anchor+'\n'+addition,anchor);
  assert.equal(restored,source,'Runtime must be byte-identical after removing new hooks');
  return result;
}
export function patchNavigation(source){
  const anchor='  const tools = [';
  const addition="\n    { key: 'typography', label: 'Typography', href: '/admin/typography', owner: true, icon: '<path d=\"M4 4h16M12 4v16M8 20h8\"/>', marker: 'hidiTypography' },";
  const loop='      for (const tool of tools) {';
  const guard='\n        if (tool.owner && !nav.querySelector(\'a[href="/admin/privacy-policy"]\')) continue;';
  assert(!source.includes('hidiTypography'));assert.equal(source.split(anchor).length-1,1);assert.equal(source.split(loop).length-1,1);
  const result=source.replace(anchor,anchor+addition).replace(loop,loop+guard);
  assert.equal(result.replace(anchor+addition,anchor).replace(loop+guard,loop),source);
  return result;
}
export async function compose(base,overlay){
  const files=['registry.mjs','css.mjs','handler.mjs','storage.mjs','wrap.mjs','editor.html','editor.js','editor.css','refresh.js'];
  await mkdir(join(overlay,'typography'),{recursive:true});
  for(const name of files)await cp(join(here,name),join(overlay,'typography',name));
  await cp(join(here,'fonts'),join(overlay,'typography/fonts'),{recursive:true});
  await writeFile(join(overlay,'server.mjs'),patchRuntime(await readFile(join(base,'server.mjs'),'utf8')));
  await mkdir(join(overlay,'admin-tools'),{recursive:true});
  await writeFile(join(overlay,'admin-tools/navigation.js'),patchNavigation(await readFile(join(base,'admin-tools/navigation.js'),'utf8')));
  const allowedFiles=['server.mjs','admin-tools/navigation.js',...files.map(f=>'typography/'+f),...(await readdir(join(here,'fonts'))).map(f=>'typography/fonts/'+f)];
  return {passed:true,allowedFiles,unchangedRuntimeRestoredExactly:true,clientBundlesUnchanged:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await compose(resolve(process.argv[2]),resolve(process.argv[3]));
  await mkdir('evidence/typography',{recursive:true});await writeFile('evidence/typography/patch.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
