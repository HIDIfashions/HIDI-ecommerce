"""Generate an isolated fixture around the actual deployable handler, not a replacement handler."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
p=root/'tests/photo-web-upload.browser.mjs';s=p.read_text()
def once(a,b):
 global s
 assert s.count(a)==1,'Retained-browser fixture anchor differs: '+a[:120]
 s=s.replace(a,b,1)
once("import {createProductImageHandler,mediaPath} from '../deploy/collection-speed/images.mjs';", "const candidateRoot=resolve(process.env.HIDI_CANDIDATE_RUNTIME);\nconst {createProductImageHandler,mediaPath}=await import(pathToFileURL(join(candidateRoot,'product-images/images.mjs')).href);")
anchor="const results=[],snapshots=[],contexts=[];let browser,child,log='';"
once(anchor,anchor+'''
const {copyFile,stat:diskStat,readdir}=await import('node:fs/promises');
const {createReadStream}=await import('node:fs');
const {BlobServiceClient}=require(join(candidateRoot,'apps/web/node_modules/@azure/storage-blob'));
process.env.AZURE_STORAGE_ACCOUNT='photofixture';
process.env.MEDIA_PUBLIC_BASE_URL='https://hidiindia.com/media';
process.env.API_URL='http://127.0.0.1:'+apiPort+'/v1';
const uploadTemp=join(directory,'stream-temp');await mkdir(uploadTemp);process.env.TMPDIR=uploadTemp;
h.assertClean=async()=>assert.deepEqual(await readdir(uploadTemp),[],'Actual compiled route removed its temporary files');
const actualFetch=globalThis.fetch;
globalThis.fetch=(resource,options)=>String(resource).startsWith(process.env.API_URL+'/admin/')?h.send(resource,options):actualFetch(resource,options);
async function diskHash(file){const digest=createHash('sha256');for await(const b of createReadStream(file))digest.update(b);return digest.digest('hex');}
BlobServiceClient.prototype.getContainerClient=function(container){
 assert.equal(container,'product-media');
 return {getBlockBlobClient(key){return {name:key,
  async uploadFile(file,options){
   assert.deepEqual(options.conditions,{ifNoneMatch:'*'});assert.equal(options.concurrency,2);assert.equal(options.blockSize,4*1024*1024);
   if(h.state.files.has(key))throw Object.assign(new Error('Already stored'),{statusCode:412});
   const target=join(directory,createHash('sha256').update(key).digest('hex'));await copyFile(file,target);
   const sha256=await diskHash(file),size=(await diskStat(file)).size;
   assert.equal(options.metadata.hidi_source_sha256,sha256);h.state.writes++;
   h.state.files.set(key,{path:target,sha256,size,type:options.blobHTTPHeaders.blobContentType});
  },
  async getProperties(){const saved=h.state.files.get(key);if(!saved)throw Error('Missing fixture blob');return {contentLength:saved.size,contentType:saved.type};},
  async download(){return {readableStreamBody:createReadStream(h.state.files.get(key).path)};}
 };}};
};
const {handlePhotoUpload:compiledUpload}=await import(pathToFileURL(join(candidateRoot,'photo-stream/handler.mjs')).href);
''')
start=s.index("  if(path==='/api/admin/inventory/v1/images'&&req.method==='POST'){")
end=s.index('  if(await optimizer.handle(req,res,path))return;',start)
s=s[:start]+"  if(await compiledUpload(req,res,path))return;\n"+s[end:]
once("[resolve('apps/web/node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(nextPort)]", "[join(candidateRoot,'apps/web/server.js')]")
once("cwd:resolve('apps/web'),env:{...process.env,NODE_ENV:'production',", "cwd:join(candidateRoot,'apps/web'),env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(nextPort),")
dest=root/'tests/photo-retained-compiled.browser.mjs';dest.write_text(s)
subprocess.run(['node','--check',str(dest)],cwd=root,check=True)
subprocess.run(['node','--experimental-strip-types',str(dest)],cwd=root,check=True)
