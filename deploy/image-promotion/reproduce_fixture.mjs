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
const report={kind:'isolated-exact-fixture-memory-diagnostic',diagnosticOnly:true,blobWrites:0,databaseWrites:0,results:[]};
const digest=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
const events=async()=>{const values={};for(const path of ['/sys/fs/cgroup/memory.events','/sys/fs/cgroup/memory/memory.oom_control','/sys/fs/cgroup/memory/memory.failcnt','/sys/fs/cgroup/memory/memory.limit_in_bytes']){try{values[path]=await readFile(path,'utf8');}catch{}}return values;};
const worker=String.raw`
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resizedImage} from '/app/product-images/images.mjs';
const require=createRequire('/app/apps/web/server.js');
const sharp=require('next/dist/server/image-optimizer.js').getSharp(1,false);
const input=process.argv[2];
async function stage(name,extra={}){let memory;try{memory=(await readFile('/sys/fs/cgroup/memory.current','utf8')).trim();}catch{};console.log(JSON.stringify({stage:name,rss:process.memoryUsage().rss,maxRssKiB:process.resourceUsage().maxRSS,cgroupBytes:memory,...extra}));}
await stage('start',{sharp:sharp.versions.sharp,vips:sharp.versions.vips,concurrency:sharp.concurrency(),cache:sharp.cache()});
let meta=await sharp(input,{limitInputPixels:100000000,failOn:'warning'}).metadata();
await stage('metadata',{width:meta.width,height:meta.height});meta=null;
await resizedImage(sharp,input,16,'webp',75);
await stage('validation-render-16');
const master=await resizedImage(sharp,input,1920,'webp',92);
await stage('master-render-1920',{bytes:master.length});
const widths=[384,640,750,828,1080,1200,1920];
for(let index=0;index<widths.length;index+=2){
  const group=widths.slice(index,index+2);
  await Promise.all(group.map(width=>resizedImage(sharp,master,width,'webp',75)));
  await stage('derivatives',{widths:group});
}
await stage('complete');
`;
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
  for(const [label,path] of [['original-24MB',original],['exact-failed-45MiB',fixture]]){
    const beforeEvents=await events();const lines=[];
    const child=spawn(process.execPath,[workerPath,path],{stdio:['ignore','pipe','pipe']});
    let text='';child.stdout.on('data',chunk=>{text=(text+chunk).slice(-20000);});child.stderr.on('data',chunk=>{text=(text+chunk).slice(-20000);});
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},180000);
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
