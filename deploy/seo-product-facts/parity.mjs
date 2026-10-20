import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
export function extracted(source,server){
 const pattern=server?/function e\(a\)\{let b=\[a.description,a.shortDescription\][\s\S]*?model:c\("Model"\)\}\}/:/function a\(e\)\{let t=\[e.description,e.shortDescription\][\s\S]*?model:i\("Model"\)\}\}/;
 const code=source.match(pattern)?.[0];assert(code,'Reviewed pure facts function missing');
 const sandbox={};vm.runInNewContext('const '+(server?'d':'r')+'=value=>value?.trim()||null;'+code+';result='+(server?'e':'a'),sandbox);return sandbox.result;
}
export async function verifyFacts(base,candidate,products,output){
 const ts=await import(pathToFileURL(process.env.HIDI_TYPESCRIPT_MODULE).href);
 const source=await readFile('apps/web/lib/product-facts.ts','utf8');
 const compiled=ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};vm.runInNewContext(compiled,{module,exports:module.exports});const expected=module.exports.productFacts;
 const serverPath='apps/web/.next/server/app/products/[slug]/page.js';
 const server=extracted(await readFile(resolve(candidate,serverPath),'utf8'),true);
 const before=extracted(await readFile(resolve(base,serverPath),'utf8'),true);
 const folder='apps/web/.next/static/chunks/app/products/[slug]';
 const oldNames=new Set(await readdir(resolve(base,folder)));
 const newNames=(await readdir(resolve(candidate,folder))).filter(n=>!oldNames.has(n));assert.equal(newNames.length,1);
 const client=extracted(await readFile(resolve(candidate,folder,newNames[0]),'utf8'),false);
 const cases=[...products,{name:'3-Piece Set Kurta with Bottom and Dupatta',description:null,shortDescription:null},{name:'Ambiguous',shortDescription:'3-Piece Set Kurta with Bottom or Dupatta'},{name:'Label wins',description:'Includes: Kurta only',shortDescription:'2-Piece Set Kurta with Pants'}];
 const changed=[];
 for(const p of cases){const wanted=JSON.stringify(expected(p));assert.equal(JSON.stringify(server(p)),wanted,p.slug||p.name);assert.equal(JSON.stringify(client(p)),wanted,p.slug||p.name);if(JSON.stringify(before(p))!==wanted)changed.push(p.slug||p.name);}
 assert(changed.includes('cream-floral-embroidered-kurta-pant-set'));
 await writeFile(output,JSON.stringify({passed:true,products:products.length,edgeCases:3,changedProducts:changed,serverClientSourceParity:true,clientAssetVersioned:true},null,2));
}
