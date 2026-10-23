// Isolated Azure validation: approved original read; owned temporary blob prefix only, verified cleanup.
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
let validationContainer,validationTargets=[],validationOwned=false;
const validationRun=process.env.HIDI_PHOTO_VALIDATION_RUN;
if(!/^\d+-\d+$/.test(validationRun||''))throw Error('Explicit validation run required');
const validationPrefix='products/validation/fullruntime-'+validationRun+'/';
const report={realAzureEnabled:true,validationPrefix,kind:'isolated-exact-full-runtime-diagnostic',diagnosticOnly:true,blobWrites:0,databaseWrites:0,results:[]};
const digest=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
const events=async()=>{const values={};for(const path of ['/sys/fs/cgroup/memory.events','/sys/fs/cgroup/memory/memory.oom_control','/sys/fs/cgroup/memory/memory.failcnt','/sys/fs/cgroup/memory/memory.limit_in_bytes']){try{values[path]=await readFile(path,'utf8');}catch{}}return values;};
const worker="// Diagnostic controller only. Starts the exact retained server; synthetic API/storage.\nimport assert from 'node:assert/strict';\nimport {createReadStream} from 'node:fs';\nimport {readFile,stat} from 'node:fs/promises';\nimport {createServer,request} from 'node:http';\nimport {Readable} from 'node:stream';\nimport {pipeline} from 'node:stream/promises';\nimport {join,dirname} from 'node:path';\nimport {spawn} from 'node:child_process';\nconst directory=dirname(process.argv[2]),port=3219;\nconst stock={onHand:8,reserved:1,safetyStock:0,reorderLevel:1};\nconst product={id:'photo-fixture',slug:'photo-fixture',name:'Upload fixture kurta',status:'ACTIVE',inStock:true,currency:'INR',pricePaise:199900,minPricePaise:199900,maxPricePaise:199900,shortDescription:'Isolated image test product',description:'Synthetic fixture',fabric:'Fixture fabric',care:'Fixture care',categoryId:null,category:null,collections:[],images:[],createdAt:'2026-10-15T00:00:00Z',updatedAt:'2026-10-15T00:00:00Z',variants:['M','L'].map((size,i)=>({id:'v'+(i+1),productId:'photo-fixture',sku:'PHOTO-'+size,size,color:'Cream',colorHex:'#e7d7c7',active:true,pricePaise:199900,mrpPaise:249900,currency:'INR',weightGrams:400,available:7,inventory:{...stock},images:[],bustMm:1000,waistMm:null,hipMm:null,shoulderMm:null,sleeveLengthMm:null,garmentLengthMm:1100}))};\nconst api=createServer((req,res)=>{let body=[];const path=new URL(req.url,'http://localhost').pathname.replace(/^\\/v1/,'');\n if(path==='/admin/me')body={admin:{id:'fixture-staff',displayName:'Fixture',email:'fixture@example.invalid',role:'OWNER',authMode:'SUPABASE'}};\n if(path==='/admin/products/options')body={categories:[],collections:[]};\n if(path==='/admin/products/photo-fixture'||path==='/products/photo-fixture')body=product;\n if(path==='/products')body=[product];\n if(path==='/reviews/products/photo-fixture')body={averageRating:0,reviewCount:0,verifiedReviewCount:0,ratingDistribution:{1:0,2:0,3:0,4:0,5:0},reviews:[]};\n res.writeHead(req.method==='GET'?200:405,{'content-type':'application/json'});res.end(JSON.stringify(body));});\nawait new Promise(resolve=>api.listen(4219,'127.0.0.1',resolve));\nasync function stage(name,extra={}){const cg={};for(const key of ['usage_in_bytes','max_usage_in_bytes','failcnt','oom_control'])try{cg[key]=(await readFile('/sys/fs/cgroup/memory/memory.'+key,'utf8')).trim();}catch{}console.log(JSON.stringify({stage:name,controllerRss:process.memoryUsage().rss,cgroup:cg,...extra}));}\nconst child=spawn(process.execPath,['--import',join(directory,'bootstrap.mjs'),'/app/server.mjs',...process.argv.slice(2)],{cwd:'/app',env:{...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',API_URL:'http://127.0.0.1:4219/v1',MEDIA_STORAGE_PROVIDER:'azure',AZURE_STORAGE_ACCOUNT:process.env.AZURE_STORAGE_ACCOUNT,MEDIA_PUBLIC_BASE_URL:'https://hidiindia.com/media'},stdio:['ignore','pipe','pipe']});\nlet exited=false;child.on('exit',(code,signal)=>{exited=true;console.log(JSON.stringify({stage:'runtime-exit',code,signal}));});\nchild.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>process.stdout.write(chunk));\nconst sample=setInterval(()=>stage('runtime-sample').catch(()=>{}),1000);sample.unref();\nasync function upload(file){\n const boundary='hidi-isolated-diagnostic',head=Buffer.from('--'+boundary+'\\r\\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\\r\\nContent-Type: image/jpeg\\r\\n\\r\\n'),tail=Buffer.from('\\r\\n--'+boundary+'--\\r\\n'),info=await stat(file);\n const response=await new Promise((resolve,reject)=>{\n  const req=request({host:'127.0.0.1',port,path:'/api/admin/inventory/fixture/images',method:'POST',headers:{host:'localhost','content-type':'multipart/form-data; boundary='+boundary,'content-length':head.length+info.size+tail.length,cookie:'hidi_admin_access=fixture-owner'}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,body}));});\n  req.on('error',reject);req.setTimeout(90000,()=>req.destroy(Error('Diagnostic request timed out')));\n  pipeline(Readable.from((async function*(){yield head;for await(const chunk of createReadStream(file))yield chunk;yield tail;})()),req).catch(reject);\n });\n await stage('full-runtime-upload-response',response);assert.equal(response.status,200);assert(JSON.parse(response.body).ok);\n}\ntry{\n let ready=false;\n for(let i=0;i<60;i++){if(exited)throw Error('Retained runtime exited before readiness');try{await new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port,path:'/',headers:{host:'localhost'}},res=>{res.resume();res.on('end',resolve);});req.setTimeout(1000,()=>req.destroy());req.on('error',reject);req.end();});ready=true;break;}catch{}await new Promise(r=>setTimeout(r,500));}\n assert(ready,'Retained runtime did not listen');await stage('full-runtime-ready');\n for(const path of ['/admin/products/photo-fixture','/products/photo-fixture']){\n  let page;\n  for(let attempt=0;attempt<30;attempt++){\n   if(exited)throw Error('Runtime exited during initial page readiness');\n   page=await new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port,path,headers:{host:'localhost',cookie:'hidi_admin_access=fixture-owner'}},res=>{let bytes=0;res.on('data',b=>bytes+=b.length);res.on('end',()=>resolve({path,status:res.statusCode,bytes}));});req.setTimeout(60000,()=>req.destroy(Error('Fixture page timed out')));req.on('error',reject);req.end();});\n   if(page.status!==503)break;\n   await new Promise(resolve=>setTimeout(resolve,1000));\n  }\n  await stage('retained-page-warmed',page);assert.equal(page.status,200);assert(page.bytes>1000);\n }\n await stage('retained-pages-ready');\n for(let i=2;i<process.argv.length;i++){\n  await stage('full-runtime-upload-start',{fileIndex:i-2});\n  const images=i===3?[1920,1200,828].map((width,index)=>new Promise((resolve,reject)=>{\n   const path='/_next/image?url='+encodeURIComponent('/media/products/variants/fixture/legacy-client-'+index+'.jpg')+'&w='+width+'&q=75';\n   const req=request({host:'127.0.0.1',port,path,headers:{host:'localhost',accept:'image/webp'}},res=>{let bytes=0;res.on('data',b=>bytes+=b.length);res.on('end',async()=>{const result={stage:'legacy-image-response',width,status:res.statusCode,bytes,cache:res.headers['x-hidi-image-cache']};console.log(JSON.stringify(result));resolve(result);});});\n   req.setTimeout(90000,()=>req.destroy(Error('Legacy image fixture timed out')));req.on('error',reject);req.end();\n  })):[];\n  const settled=await Promise.allSettled([upload(process.argv[i]),...images]);\n  for(const item of settled){if(item.status==='rejected')throw item.reason;if(item.value)assert.equal(item.value.status,200);}\n }\n await stage('full-runtime-complete');\n}finally{\n clearInterval(sample);child.kill('SIGTERM');await new Promise(resolve=>{if(exited)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},5000).unref();});api.closeAllConnections();await new Promise(resolve=>api.close(resolve));\n}\n";
const bootstrap="// Diagnostic only. Exact compiled handler; loopback HTTP and local fake storage.\nimport assert from 'node:assert/strict';\nimport {createRequire} from 'node:module';\nimport {createHash} from 'node:crypto';\nimport {createReadStream} from 'node:fs';\nimport {readFile,writeFile,copyFile,stat,mkdir} from 'node:fs/promises';\nimport {createServer,request} from 'node:http';\nimport {Readable} from 'node:stream';\nimport {pipeline} from 'node:stream/promises';\nimport {join,dirname} from 'node:path';\nconst require=createRequire('/app/apps/web/server.js');\nconst directory=dirname(process.argv[2]);\nprocess.env.MEDIA_STORAGE_PROVIDER='azure';\nassert(/^[a-z0-9]{3,24}$/.test(process.env.AZURE_STORAGE_ACCOUNT||''));\nprocess.env.MEDIA_PUBLIC_BASE_URL='https://hidiindia.com/media';\nprocess.env.API_URL='http://127.0.0.1:4219/v1';\nprocess.env.TMPDIR=join(directory,'handler-temp');await mkdir(process.env.TMPDIR,{recursive:true});\nconst state={originals:0,derivatives:0,metadata:0},files=new Map();\nconst hash=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};\nasync function stage(name,extra={}){const cg={};for(const key of ['usage_in_bytes','max_usage_in_bytes','failcnt','oom_control'])try{cg[key]=(await readFile('/sys/fs/cgroup/memory/memory.'+key,'utf8')).trim();}catch{}console.log(JSON.stringify({stage:name,rss:process.memoryUsage().rss,maxRssKiB:process.resourceUsage().maxRSS,cgroup:cg,...extra}));}\nconst realFetch=globalThis.fetch;\nglobalThis.fetch=async(resource,options={})=>{\n const url=String(resource);\n const path=new URL(url).pathname;\n if(path==='/api/store/products')return Response.json([{images:[{url:'/media/products/variants/fixture/legacy-warm.jpg'}],variants:[]}]);\n if(path.startsWith('/media/products/_derivatives/'))return new Response(null,{status:404});\n if(/^\\/media\\/products\\/variants\\/fixture\\/legacy-[a-z0-9-]+\\.jpg$/.test(path)){await stage('legacy-source-read');return new Response(Readable.toWeb(createReadStream(process.argv[2])),{headers:{'content-type':'image/jpeg','content-length':String((await stat(process.argv[2])).size)}});}\n if(!url.startsWith(process.env.API_URL+'/admin/')){assert(url.startsWith('http://127.0.0.1:4219/')||url.startsWith('http://localhost:4219/'),'Non-fixture fetch blocked');return realFetch(resource,options);}\n if((options.method||'GET')==='GET'&&!url.endsWith('/admin/me'))return realFetch(resource,options);\n if(url.endsWith('/admin/me'))return Response.json({admin:{id:'fixture',role:'OWNER'}});\n if(url.endsWith('/images/ticket'))return Response.json({token:'fixture-ticket'});\n if(url.endsWith('/images')){state.metadata++;await stage('metadata-attached');return Response.json({ok:true});}\n throw Error('Unexpected fixture API');\n};\nconst {BlobServiceClient}=require('/app/photo-stream/node_modules/@azure/storage-blob');\nconst originalContainerClient=BlobServiceClient.prototype.getContainerClient;\nconst validationRun=process.env.HIDI_PHOTO_VALIDATION_RUN;\nassert(/^\\d+-\\d+$/.test(validationRun||''),'Explicit validation run required');\nconst validationPrefix='products/validation/fullruntime-'+validationRun+'/';\nconst {persistentDerivativeBlobKey}=await import('/app/product-images/images.mjs');\nconst allowedKeys=new Set();\nfor(const hash of ['824a87c8402d5cad8426905948cb85eb42d0af61bdc8240624a903452868fcc9','ca24601507789695e9637b5d123df823fd66f8cba9ec3e4ef065b124e6741568']){\n const key='products/variants/fixture/batch-'+hash+'.jpg';allowedKeys.add(key);\n for(const width of [384,640,750,828,1080,1200,1920])allowedKeys.add(persistentDerivativeBlobKey(key,width,'webp'));\n}\nBlobServiceClient.prototype.getContainerClient=function(name){\n assert.equal(name,'product-media');const container=originalContainerClient.call(this,name);\n return {getBlockBlobClient(key){\n  assert(allowedKeys.has(key),'Unapproved diagnostic blob key');const target=container.getBlockBlobClient(validationPrefix+key);\n  return new Proxy(target,{get(object,property){\n   if(property==='name')return key;\n   if(property==='uploadFile'||property==='uploadData')return async(input,options)=>{\n    assert.deepEqual(options.conditions,{ifNoneMatch:'*'});\n    const result=await object[property](input,{...options,metadata:{...options.metadata,hidi_validation_run:validationRun}});\n    await stage(property==='uploadFile'?'original-stored':'derivative-stored',{width:options.metadata.hidi_width,realAzure:true});return result;\n   };\n   if(['getProperties','download','downloadToBuffer'].includes(property))return object[property].bind(object);\n   if(typeof object[property]==='function')return ()=>{throw Error('Unapproved diagnostic Blob method');};\n   return object[property];\n  }});\n }};\n};\nconst {handlePhotoUpload}=await import('/app/photo-stream/handler.mjs');\nconst sharp=require('next/dist/server/image-optimizer.js').getSharp(1,false);\nawait stage('handler-loaded',{sharp:sharp.versions.sharp,concurrency:sharp.concurrency(),cache:sharp.cache()});\n";
try{
  const blob=new BlobServiceClient('https://'+process.env.AZURE_STORAGE_ACCOUNT+'.blob.core.windows.net',new DefaultAzureCredential()).getContainerClient('product-media').getBlockBlobClient(key);
  const container=new BlobServiceClient('https://'+process.env.AZURE_STORAGE_ACCOUNT+'.blob.core.windows.net',new DefaultAzureCredential()).getContainerClient('product-media');

  validationContainer=container;
  for(const hash of [originalHash,fixtureHash]){
    const original='products/variants/fixture/batch-'+hash+'.jpg';
    validationTargets.push({hash,width:null,key:validationPrefix+original});
    for(const width of [384,640,750,828,1080,1200,1920])validationTargets.push({hash,width,key:validationPrefix+persistentDerivativeBlobKey(original,width,'webp')});
  }
  for(const item of validationTargets){try{await container.getBlockBlobClient(item.key).getProperties();throw Error('Validation key already exists');}catch(error){if(error.statusCode!==404)throw error;}}
  validationOwned=true;
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
  const workerPath=join(directory,'worker.mjs');await writeFile(workerPath,worker,{mode:0o600});await writeFile(join(directory,'bootstrap.mjs'),bootstrap,{mode:0o600});
  report.runtimeWiring=(await readFile('/app/server.mjs','utf8')).split('\n').filter(line=>/spawn\(|fork\(|sharp|cache\(|PhotoUpload|listen\(/.test(line));
  for(const [label,paths] of [['full-retained-runtime-sequence',[original,fixture,fixture]]]){
    const beforeEvents=await events();const lines=[];
    const child=spawn(process.execPath,[workerPath,...paths],{stdio:['ignore','pipe','pipe'],detached:true});
    let text='',pending='',peakCgroupBytes=0;const responses=[],stageCounts={};
    const collect=chunk=>{text=(text+chunk).slice(-3000);pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){try{const event=JSON.parse(line);if(event.stage)stageCounts[event.stage]=(stageCounts[event.stage]||0)+1;peakCgroupBytes=Math.max(peakCgroupBytes,Number(event.cgroup?.max_usage_in_bytes||0));if(/response|runtime-exit|complete|warmed|pages-ready/.test(event.stage||''))responses.push(event);}catch{}}};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    const killOwnedGroup=()=>{try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}};
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;killOwnedGroup();},300000);
    const result=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
    clearTimeout(timer);killOwnedGroup();
    report.results.push({label,...result,timedOut,eventsBefore:beforeEvents,eventsAfter:await events(),peakCgroupBytes,stageCounts,responses,log:text});
    console.log('HIDI_FIXTURE_CASE '+JSON.stringify(report.results.at(-1)));
  }

  report.realAzureResults=[];
  const sharp=require('next/dist/server/image-optimizer.js').getSharp(1,false);
  for(const item of validationTargets){
    const saved=container.getBlockBlobClient(item.key),props=await saved.getProperties(),meta=props.metadata||{};
    if(meta.hidi_validation_run!==validationRun||meta.hidi_source_sha256!==item.hash)throw Error('Validation ownership or source hash differs');
    const stream=(await saved.download()).readableStreamBody,hash=createHash('sha256');let bytes=0;const chunks=[];
    for await(const chunk of stream){bytes+=chunk.length;hash.update(chunk);if(item.width){if(bytes>10*1024*1024)throw Error('Oversized derivative');chunks.push(chunk);}}
    const sha=hash.digest('hex');
    if(!item.width){if(sha!==item.hash||bytes!==(item.hash===originalHash?24284792:47185920)||props.contentType!=='image/jpeg')throw Error('Original byte preservation failed');}
    else{const image=await sharp(Buffer.concat(chunks,bytes)).metadata();if(sha!==meta.hidi_derivative_sha256||meta.hidi_derivative_version!=='v1'||meta.hidi_width!==String(item.width)||meta.hidi_format!=='webp'||props.contentType!=='image/webp'||image.format!=='webp'||image.width!==item.width)throw Error('Derivative verification failed');}
    report.realAzureResults.push({...item,bytes,sha256:sha,valid:true});
  }
  report.blobWrites=report.realAzureResults.length;
  report.realAzurePassed=report.results.every(item=>item.code===0&&!item.timedOut)&&report.realAzureResults.length===16;
  report.originalUnchanged=(await blob.getProperties()).etag===before.etag;
  if(!report.originalUnchanged)throw Error('Original changed during diagnostic');
  report.diagnosticCompleted=true;
}catch(error){report.error=String(error.message);process.exitCode=1;}
finally{
  let cleanup=true,count=0;
  if(validationOwned){for(const item of validationTargets){try{
    const blob=validationContainer.getBlockBlobClient(item.key);let props;
    try{props=await blob.getProperties();}catch(error){if(error.statusCode===404)continue;throw error;}
    if(!item.key.startsWith(validationPrefix)||props.metadata?.hidi_validation_run!==validationRun)throw Error('Validation cleanup ownership differs');
    await blob.deleteIfExists({deleteSnapshots:'include',conditions:{ifMatch:props.etag}});count++;
    try{await blob.getProperties();throw Error('Validation blob remains');}catch(error){if(error.statusCode!==404)throw error;}
  }catch(error){cleanup=false;report.cleanupError=String(error.message);}}}
  report.validationBlobsRemoved=cleanup;report.validationBlobsDeleted=count;report.blobWrites=Math.max(report.blobWrites||0,count);
  if(!cleanup){report.realAzurePassed=false;process.exitCode=1;}
  await rm(directory,{recursive:true,force:true});report.localFilesRemoved=true;const encoded=JSON.stringify(report),total=Math.ceil(encoded.length/1500);for(let index=0;index<total;index++)console.log('HIDI_FIXTURE_CHUNK '+JSON.stringify({index,total,data:encoded.slice(index*1500,(index+1)*1500)}));
}








