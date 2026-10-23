// Isolated diagnostic: reads one approved original; writes only temporary local files.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdtemp,writeFile,readFile,rm,open,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {persistentDerivativeBlobKey} from '/app/product-images/images.mjs';
const require=createRequire('/app/apps/web/server.js');
const {BlobServiceClient}=require('/app/photo-stream/node_modules/@azure/storage-blob/sdk.cjs');
const {DefaultAzureCredential}=require('/app/photo-stream/node_modules/@azure/identity/sdk.cjs');
const key='products/variants/cmv9owalu00s701evyyeenjza/batch-824a87c8402d5cad8426905948cb85eb42d0af61bdc8240624a903452868fcc9.jpg';
const originalHash='824a87c8402d5cad8426905948cb85eb42d0af61bdc8240624a903452868fcc9';
const fixtureHash='ca24601507789695e9637b5d123df823fd66f8cba9ec3e4ef065b124e6741568';
const directory=await mkdtemp(join(tmpdir(),'hidi-isolated-fixture-'));
const report={kind:'isolated-exact-compiled-handler-diagnostic',diagnosticOnly:true,blobWrites:0,databaseWrites:0,results:[]};
const digest=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
const events=async()=>{const values={};for(const path of ['/sys/fs/cgroup/memory.events','/sys/fs/cgroup/memory/memory.oom_control','/sys/fs/cgroup/memory/memory.failcnt','/sys/fs/cgroup/memory/memory.limit_in_bytes']){try{values[path]=await readFile(path,'utf8');}catch{}}return values;};
const worker="// Diagnostic only. Exact compiled handler; loopback HTTP and local fake storage.\nimport assert from 'node:assert/strict';\nimport {createRequire} from 'node:module';\nimport {createHash} from 'node:crypto';\nimport {createReadStream} from 'node:fs';\nimport {readFile,writeFile,copyFile,stat,mkdir} from 'node:fs/promises';\nimport {createServer,request} from 'node:http';\nimport {Readable} from 'node:stream';\nimport {pipeline} from 'node:stream/promises';\nimport {join,dirname} from 'node:path';\nconst require=createRequire('/app/apps/web/server.js');\nconst directory=dirname(process.argv[2]);\nprocess.env.MEDIA_STORAGE_PROVIDER='azure';\nprocess.env.AZURE_STORAGE_ACCOUNT='photofixture';\nprocess.env.MEDIA_PUBLIC_BASE_URL='https://hidiindia.com/media';\nprocess.env.API_URL='http://127.0.0.1:4219/v1';\nprocess.env.TMPDIR=join(directory,'handler-temp');await mkdir(process.env.TMPDIR,{recursive:true});\nconst state={originals:0,derivatives:0,metadata:0},files=new Map();\nconst hash=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};\nasync function stage(name,extra={}){const cg={};for(const key of ['usage_in_bytes','max_usage_in_bytes','failcnt','oom_control'])try{cg[key]=(await readFile('/sys/fs/cgroup/memory/memory.'+key,'utf8')).trim();}catch{}console.log(JSON.stringify({stage:name,rss:process.memoryUsage().rss,maxRssKiB:process.resourceUsage().maxRSS,cgroup:cg,...extra}));}\nglobalThis.fetch=async(resource,options={})=>{\n const url=String(resource);assert(url.startsWith(process.env.API_URL+'/admin/'),'Non-fixture fetch blocked');\n if(url.endsWith('/admin/me'))return Response.json({admin:{id:'fixture',role:'OWNER'}});\n if(url.endsWith('/images/ticket'))return Response.json({token:'fixture-ticket'});\n if(url.endsWith('/images')){state.metadata++;await stage('metadata-attached');return Response.json({ok:true});}\n throw Error('Unexpected fixture API');\n};\nconst {BlobServiceClient}=require('/app/photo-stream/node_modules/@azure/storage-blob');\nBlobServiceClient.prototype.getContainerClient=function(name){assert.equal(name,'product-media');return {getBlockBlobClient(key){return {\n async uploadFile(file,options){assert.deepEqual(options.conditions,{ifNoneMatch:'*'});if(files.has(key))throw {statusCode:412};const target=join(directory,createHash('sha256').update(key).digest('hex'));await copyFile(file,target);const sha=await hash(file);assert.equal(sha,options.metadata.hidi_source_sha256);files.set(key,{path:target,contentLength:(await stat(file)).size,contentType:options.blobHTTPHeaders.blobContentType,metadata:options.metadata});state.originals++;await stage('original-stored',{bytes:(await stat(file)).size});},\n async uploadData(bytes,options){if(files.has(key))throw {statusCode:412};const target=join(directory,createHash('sha256').update(key).digest('hex'));await writeFile(target,bytes);files.set(key,{path:target,contentLength:bytes.length,contentType:options.blobHTTPHeaders.blobContentType,metadata:options.metadata});state.derivatives++;await stage('derivative-stored',{width:options.metadata.hidi_width});},\n async getProperties(){if(!files.has(key))throw {statusCode:404};return files.get(key);},\n async download(){return {readableStreamBody:createReadStream(files.get(key).path)};},\n async downloadToBuffer(){return readFile(files.get(key).path);},\n async deleteIfExists(){throw Error('Unexpected deletion');}\n };}};};\nconst {handlePhotoUpload}=await import('/app/photo-stream/handler.mjs');\nconst sharp=require('next/dist/server/image-optimizer.js').getSharp(1,false);\nawait stage('handler-loaded',{sharp:sharp.versions.sharp,concurrency:sharp.concurrency(),cache:sharp.cache()});\nconst server=createServer(async(req,res)=>{try{assert(await handlePhotoUpload(req,res,new URL(req.url,'http://localhost').pathname));}catch(e){res.writeHead(500);res.end(String(e));}});\nawait new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));\nasync function upload(file){\n const boundary='hidi-isolated-diagnostic',head=Buffer.from('--'+boundary+'\\r\\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\\r\\nContent-Type: image/jpeg\\r\\n\\r\\n'),tail=Buffer.from('\\r\\n--'+boundary+'--\\r\\n');\n const result=new Promise((resolve,reject)=>{\n const req=request({host:'127.0.0.1',port:server.address().port,path:'/api/admin/inventory/fixture/images',method:'POST',headers:{host:'localhost','content-type':'multipart/form-data; boundary='+boundary,'content-length':head.length+(0)+tail.length,'cookie':'hidi_admin_access=fixture-owner'}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,body:data}));});\n req.on('error',reject);\n stat(file).then(info=>{req.setHeader('content-length',head.length+info.size+tail.length);return pipeline(Readable.from((async function*(){yield head;for await(const chunk of createReadStream(file))yield chunk;yield tail;})()),req);}).catch(reject);\n });\n const response=await result;await stage('upload-response',response);assert.equal(response.status,200);assert(JSON.parse(response.body).ok);\n}\ntry{for(let i=2;i<process.argv.length;i++){await stage('upload-start',{fileIndex:i-2});await upload(process.argv[i]);}await stage('complete',{state});}\nfinally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}\n";
try{
  const blob=new BlobServiceClient('https://'+process.env.AZURE_STORAGE_ACCOUNT+'.blob.core.windows.net',new DefaultAzureCredential()).getContainerClient('product-media').getBlockBlobClient(key);
  const container=new BlobServiceClient('https://'+process.env.AZURE_STORAGE_ACCOUNT+'.blob.core.windows.net',new DefaultAzureCredential()).getContainerClient('product-media');
  const failedKey='products/variants/cmv9owalu00s701evyyeenjza/batch-'+fixtureHash+'.jpg';
  report.failedUploadStorage=[];
  for(const item of [{width:null,key:failedKey},...[384,640,750,828,1080,1200,1920].map(width=>({width,key:persistentDerivativeBlobKey(failedKey,width,'webp')}))]){
    try{const props=await container.getBlockBlobClient(item.key).getProperties();report.failedUploadStorage.push({...item,exists:true,bytes:props.contentLength,lastModified:props.lastModified,sourceSha256:props.metadata?.hidi_source_sha256});}
    catch(error){if(error.statusCode!==404)throw error;report.failedUploadStorage.push({...item,exists:false});}
  }
  const before=await blob.getProperties();
  if(before.contentLength!==24284792)throw Error('Approved source size changed');
  const original=join(directory,'original.jpg');
  await pipeline((await blob.download()).readableStreamBody,createWriteStream(original,{flags:'wx',mode:0o600}));
  if(await digest(original)!==originalHash)throw Error('Approved source hash differs');
  const fixture=join(directory,'fixture-45-MiB.jpg');
  const file=await open(fixture,'wx',0o600);
  try{
    await file.write(Buffer.from([255,216]));let remaining=45*1024*1024-24284792;
    while(remaining){let size=Math.min(65537,remaining);if(remaining-size>0&&remaining-size<4)size-=4-(remaining-size);const part=Buffer.alloc(size);part[0]=255;part[1]=254;part.writeUInt16BE(size-2,2);await file.write(part);remaining-=size;}
    for await(const chunk of createReadStream(original,{start:2}))await file.write(chunk);
  }finally{await file.close();}
  if((await stat(fixture)).size!==47185920||await digest(fixture)!==fixtureHash)throw Error('Fixture is not byte-identical to failed upload');
  report.exactFixtureHashVerified=true;
  const workerPath=join(directory,'worker.mjs');await writeFile(workerPath,worker,{mode:0o600});
  report.runtimeWiring=(await readFile('/app/server.mjs','utf8')).split('\n').filter(line=>/spawn\(|fork\(|sharp|cache\(|PhotoUpload|listen\(/.test(line));
  for(const [label,paths] of [['compiled-handler-sequence',[original,fixture,fixture]]]){
    const beforeEvents=await events();const lines=[];
    const child=spawn(process.execPath,[workerPath,...paths],{stdio:['ignore','pipe','pipe']});
    let text='';child.stdout.on('data',chunk=>{text=(text+chunk).slice(-20000);});child.stderr.on('data',chunk=>{text=(text+chunk).slice(-20000);});
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},300000);
    const result=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
    clearTimeout(timer);
    report.results.push({label,...result,timedOut,eventsBefore:beforeEvents,eventsAfter:await events(),log:text});
    console.log('HIDI_FIXTURE_CASE '+JSON.stringify(report.results.at(-1)));
  }
  report.originalUnchanged=(await blob.getProperties()).etag===before.etag;
  if(!report.originalUnchanged)throw Error('Original changed during diagnostic');
  report.diagnosticCompleted=true;
}catch(error){report.error=String(error.message);process.exitCode=1;}
finally{await rm(directory,{recursive:true,force:true});report.localFilesRemoved=true;console.log('HIDI_FIXTURE_DIAGNOSTIC '+JSON.stringify(report));}


