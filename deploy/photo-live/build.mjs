import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const source=resolve(process.argv[2]),overlay=resolve(process.argv[3]);
const require=createRequire(resolve(process.env.HIDI_ESBUILD_MODULE,'package.json'));
const {build}=require(process.env.HIDI_ESBUILD_MODULE);
const feature=join(overlay,'photo-stream');await mkdir(feature,{recursive:true});
await build({entryPoints:[join(source,'deploy/photo-live/entry.ts')],outfile:join(feature,'handler.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',tsconfig:join(source,'apps/web/tsconfig.json'),external:['next','next/*','sharp','@azure/identity','@azure/storage-blob'],banner:{js:"import { createRequire as hidiCreateRequire } from 'node:module'; const require = hidiCreateRequire(import.meta.url);"},logLevel:'info'});
const shims={
 'next':{files:{'server.cjs':"const n=require('../../../apps/web/node_modules/next/server.js');exports.NextRequest=n.NextRequest;exports.NextResponse=n.NextResponse;\n"},exports:{'./server':'./server.cjs'}},
 'sharp':{files:{'index.cjs':"module.exports=require('../../../apps/web/node_modules/sharp');\n"}},
 '@azure/identity':{files:{'index.cjs':"const a=require('../../../../apps/web/node_modules/@azure/identity');exports.DefaultAzureCredential=a.DefaultAzureCredential;\n"}},
 '@azure/storage-blob':{files:{'index.cjs':"const a=require('../../../../apps/web/node_modules/@azure/storage-blob');exports.BlobServiceClient=a.BlobServiceClient;\n"}},
};
for(const [name,config] of Object.entries(shims)){
 const folder=join(feature,'node_modules',name);await mkdir(folder,{recursive:true});
 await writeFile(join(folder,'package.json'),JSON.stringify({name,private:true,type:'commonjs',main:'index.cjs',...(config.exports?{exports:config.exports}:{})}));
 for(const [path,content]of Object.entries(config.files))await writeFile(join(folder,path),content);
}
console.log('Bundled photo route only; existing Next, Sharp and Azure dependency versions are retained.');
