/** Syntax/contract checks only: this is NOT a complete Next/Nest typecheck/build. */
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),ts=require(process.env.HIDI_TEST_TYPESCRIPT||'typescript');
const report=JSON.parse(await readFile('image-source-report.json','utf8'));
for(const name of Object.keys(report.files)){
 if(!/\.tsx?$/.test(name))continue;
 const diagnostics=ts.transpileModule(await readFile(name,'utf8'),{fileName:name,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,experimentalDecorators:true}}).diagnostics||[];
 assert.equal(diagnostics.filter(item=>item.category===ts.DiagnosticCategory.Error).length,0,name+': '+diagnostics.map(item=>ts.flattenDiagnosticMessageText(item.messageText,'\n')).join('\n'));
}
const read=name=>readFile(name,'utf8');
for(const name of ['apps/web/lib/sku-photo-batch.ts','apps/web/lib/hidi-bulk-photos.ts','deploy/admin-tools/image-sku-client.mjs','apps/api/src/admin/admin-inventory.service.ts','apps/web/app/api/admin/inventory/[variantId]/images/route.ts'])assert.match(await read(name),/40 \* 1024 \* 1024/,name);
assert.match(await read('apps/web/next.config.ts'),/proxyClientMaxBodySize: 42 \* 1024 \* 1024/);
const route=await read('apps/web/app/api/admin/inventory/[variantId]/images/route.ts');
assert.match(route,/releasePhotoUpload = acquirePhotoUploadSlot\(\)/);assert.match(route,/finally \{\s+releasePhotoUpload\?\.\(\);/);assert.match(route,/await readPhotoForm\(request\)/);
assert.match(route,/if \(!isAdminRequest\(request\)\)/);assert.match(route,/await createUploadTicket\(request, variantId, file\)/);
assert.match(await read('apps/web/lib/product-image.ts'),/searchParams.set\("hidi_image", "3"\)/);
console.log('Source syntax and image integration contracts passed; complete application build remains a release gate.');
