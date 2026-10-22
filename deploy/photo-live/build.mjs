import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,copyFile,access,readFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
const source=resolve(process.argv[2]),overlay=resolve(process.argv[3]);
assert(process.argv[4],'The captured production runtime is required for dependency verification');
const base=resolve(process.argv[4]);
await access(join(base,'apps/web/server.js'));
const retainedRequire=createRequire(join(base,'apps/web/server.js'));
// Resolve through the retained standalone server, not an assumed node_modules
// directory. The public next/server aggregator can be omitted by file tracing.
const retainedModules={
 request:'next/dist/server/web/spec-extension/request.js',
 response:'next/dist/server/web/spec-extension/response.js',
 optimizer:'next/dist/server/image-optimizer.js',
};
for(const [name,specifier] of Object.entries(retainedModules)){
 const resolved=retainedRequire.resolve(specifier);
 const local=relative(base,resolved);
 assert(local&&!local.startsWith('..')&&!local.startsWith('/'),'Dependency must belong to the captured runtime: '+name);
 console.log('Verified retained '+name+': '+local);
}
const {NextRequest}=retainedRequire(retainedModules.request);
const {NextResponse}=retainedRequire(retainedModules.response);
const retainedSharp=retainedRequire(retainedModules.optimizer).getSharp(1,false);
assert.equal(new NextRequest('http://localhost/preflight').nextUrl.pathname,'/preflight');
assert.deepEqual(await NextResponse.json({ready:true}).json(),{ready:true});
assert.equal(typeof retainedSharp,'function');
const require=createRequire(resolve(process.env.HIDI_ESBUILD_MODULE,'package.json'));
const sourceRequire=createRequire(join(source,'apps/web/package.json'));
const {build}=require(process.env.HIDI_ESBUILD_MODULE);
const feature=join(overlay,'photo-stream');await mkdir(feature,{recursive:true});
await build({entryPoints:[join(source,'deploy/photo-live/entry.ts')],outfile:join(feature,'handler.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',tsconfig:join(source,'apps/web/tsconfig.json'),external:['next','next/*','sharp','@azure/identity','@azure/storage-blob'],banner:{js:"import { createRequire as hidiCreateRequire } from 'node:module'; const require = hidiCreateRequire(import.meta.url);"},logLevel:'info'});
const photoHandlerText=await readFile(join(feature,'handler.mjs'),'utf8');
assert(!photoHandlerText.includes('/images/ticket'),'Active packaged upload handler must not depend on legacy size tickets');
const retainedLoader="const {createRequire}=require('node:module');const {resolve}=require('node:path');const retained=createRequire(resolve(__dirname,'../../../apps/web/server.js'));\n";
const shims={
 'next':{files:{'server.cjs':retainedLoader+"exports.NextRequest=retained('next/dist/server/web/spec-extension/request.js').NextRequest;exports.NextResponse=retained('next/dist/server/web/spec-extension/response.js').NextResponse;\n"},exports:{'./server':'./server.cjs'}},
 'sharp':{files:{'index.cjs':retainedLoader+"module.exports=retained('next/dist/server/image-optimizer.js').getSharp(1,false);\n"}},
 '@azure/identity':{files:{'index.cjs':"const a=require('./sdk.cjs');exports.DefaultAzureCredential=a.DefaultAzureCredential;\n"}},
 '@azure/storage-blob':{files:{'index.cjs':"const a=require('./sdk.cjs');exports.BlobServiceClient=a.BlobServiceClient;\n"}},
};
for(const [name,config] of Object.entries(shims)){
 const folder=join(feature,'node_modules',name);await mkdir(folder,{recursive:true});
 await writeFile(join(folder,'package.json'),JSON.stringify({name,private:true,type:'commonjs',main:'index.cjs',...(config.exports?{exports:config.exports}:{})}));
 for(const [path,content]of Object.entries(config.files))await writeFile(join(folder,path),content);
 if(name.startsWith('@azure/'))await build({entryPoints:[sourceRequire.resolve(name)],outfile:join(folder,'sdk.cjs'),bundle:true,platform:'node',format:'cjs',target:'node22',logLevel:'info',legalComments:'eof'});
}
await copyFile(join(source,'apps/web/lib/photo-azure-stream.mjs'),join(feature,'storage.mjs'));
await build({
 entryPoints:[join(source,'deploy/image-derivatives/azure-storage-probe.mjs')],
 outfile:join(feature,'validate-storage.mjs'),
 bundle:true,platform:'node',format:'esm',target:'node22',
 external:['sharp','@azure/identity','@azure/storage-blob'],
 banner:{js:"import { createRequire as hidiCreateRequire } from 'node:module'; const require = hidiCreateRequire(import.meta.url);"},
 logLevel:'info',
});
await build({
 entryPoints:[join(source,'deploy/image-derivatives/backfill.mjs')],
 outfile:join(feature,'backfill.mjs'),
 bundle:true,platform:'node',format:'esm',target:'node22',
 external:['sharp','@azure/identity','@azure/storage-blob'],
 banner:{js:"import { createRequire as hidiCreateRequire } from 'node:module'; const require = hidiCreateRequire(import.meta.url);"},
 logLevel:'info',
});
console.log('Photo route, persistent Azure derivative probe, guarded backfill utility and source-lockfile SDKs packaged privately; verified retained Next and Sharp implementations are reused without modifying them.');
