import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME);
const output=resolve('evidence/landing-media-fix');
await mkdir(output,{recursive:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNMUFRhYGBgYmBgYGBgAAAIIgCp4sFrrgAAAABJRU5ErkJggg==','base64');
const heroKey='brand/hero/media/20261011/hero-fixture.png';
const landingKey='brand/landing-media/media/20261011/ananya-fixture.png';
const badHero=`https://thidigk.thehidi.com/media/${heroKey}`;
const badLanding=`https://thidigk.thehidi.com/media/${landingKey}`;
const proxy=key=>`/api/hidi/hero-asset/${key}`;
const blobs=new Map();
let fixtureBlobWrites=0,productionWrites=0,logs='';const fixturePutPaths=[];

const item=(key,url)=>({assetId:'fixture-'+key.split('/').at(-1),type:'image',url,originalName:key.split('/').at(-1),altText:'HIDI fixture',desktopPosition:'50% 50%',mobilePosition:'50% 50%',fitMode:'cover'});
blobs.set('/hero/brand/hero/current.json',{type:'application/json',body:Buffer.from(JSON.stringify({version:1,active:true,source:'uploaded',...item(heroKey,badHero),items:[item(heroKey,badHero)],autoPlay:false,intervalSeconds:6}))});
blobs.set('/hero/brand/landing-media/current.json',{type:'application/json',body:Buffer.from(JSON.stringify({version:1,slots:{'range-everyday':{version:1,active:true,source:'uploaded',...item(landingKey,'DIRECT_BLOB_URL')}},ananya:{version:1,active:true,source:'uploaded',items:[item(landingKey,badLanding)],autoPlay:false,intervalSeconds:6}}))});
blobs.set('/hero/'+heroKey,{type:'image/png',body:png});
blobs.set('/hero/'+landingKey,{type:'image/png',body:png});

const blob=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  if(req.headers.authorization!=='Bearer fixture-token'){res.writeHead(401).end();return;}
  if(req.method==='PUT'){
    fixtureBlobWrites++;fixturePutPaths.push(req.url);
    blobs.set(req.url,{type:req.headers['x-ms-blob-content-type']||req.headers['content-type']||'application/octet-stream',body:Buffer.concat(chunks)});
    res.writeHead(201).end();return;
  }
  if(!['GET','HEAD'].includes(req.method)){productionWrites++;res.writeHead(405).end();return;}
  const saved=blobs.get(req.url);
  if(!saved){res.writeHead(404).end();return;}
  let body=saved.body,status=200;const range=req.headers.range||req.headers['x-ms-range'];
  const match=/^bytes=(\d*)-(\d*)$/.exec(range||'');
  const headers={'Content-Type':saved.type,'Accept-Ranges':'bytes','ETag':'"fixture"'};
  if(match){const start=match[1]?Number(match[1]):0;const end=match[2]?Number(match[2]):saved.body.length-1;body=saved.body.subarray(start,end+1);status=206;headers['Content-Range']=`bytes ${start}-${end}/${saved.body.length}`;}
  headers['Content-Length']=String(body.length);res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:body);
});
await new Promise(done=>blob.listen(0,'127.0.0.1',done));
const blobBase=`http://127.0.0.1:${blob.address().port}`;
{
  const saved=blobs.get('/hero/brand/landing-media/current.json');
  const value=JSON.parse(saved.body);
  value.slots['range-everyday'].url=`${blobBase}/hero/${landingKey}`;
  saved.body=Buffer.from(JSON.stringify(value));
}

const upstream=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://fixture').pathname;
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  if(!['GET','HEAD'].includes(req.method)){productionWrites++;res.writeHead(403).end();return;}
  if(path==='/api/admin/session'){res.writeHead(200,{'Content-Type':'application/json'}).end('{"authenticated":true}');return;}
  if(path.includes('/health')){res.writeHead(200,{'Content-Type':'application/json'}).end('{"status":"ok"}');return;}
  if(/^\/v1\/products(?:\/(?:featured|best-sellers))?$/.test(path)){res.writeHead(200,{'Content-Type':'application/json'}).end('[]');return;}
  res.writeHead(401,{'Content-Type':'application/json'}).end('{"message":"Authentication required"}');
});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));

const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,NODE_ENV:'production',PORT:String(port),LANDING_DIST_DIR:join(root,'dist'),STOREFRONT_ORIGIN:`http://127.0.0.1:${upstream.address().port}`,API_URL:`http://127.0.0.1:${upstream.address().port}/v1`,INTERNAL_API_URL:`http://127.0.0.1:${upstream.address().port}/v1`,MEDIA_STORAGE_PROVIDER:'azure',AZURE_STORAGE_ACCOUNT:'fixturestore',AZURE_STORAGE_CONTAINER:'hero',AZURE_STORAGE_ACCESS_TOKEN:'fixture-token',AZURE_STORAGE_BLOB_ENDPOINT:blobBase,MEDIA_PUBLIC_BASE_URL:'https://thidigk.thehidi.com/media'},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
const base='http://127.0.0.1:'+port;

async function response(path,options={}){const result=await fetch(base+path,options);return {result,body:Buffer.from(await result.arrayBuffer())};}

try{
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error('Candidate exited: '+logs.slice(-3000));await new Promise(done=>setTimeout(done,200));}assert(ready,'Retained candidate readiness');

  const hero=await (await fetch(base+'/api/hidi/hero-config')).json();
  const landing=await (await fetch(base+'/api/hidi/landing-media-config')).json();
  assert.equal(hero.url,proxy(heroKey));assert.equal(hero.items[0].url,proxy(heroKey));
  assert.equal(landing.slots['range-everyday'].url,proxy(landingKey));
  assert.equal(landing.ananya.items[0].url,proxy(landingKey));
  for(const url of [hero.url,landing.slots['range-everyday'].url,landing.ananya.items[0].url]){
    const loaded=await response(url,{headers:{Range:'bytes=0-7'}});assert.equal(loaded.result.status,206);assert.equal(loaded.result.headers.get('content-type'),'image/png');assert.deepEqual(loaded.body,png.subarray(0,8));
    const head=await fetch(base+url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'image/png');assert(Number(head.headers.get('content-length'))>0);
  }

  const uploadBytes=Buffer.from('future landing upload fixture');
  const uploaded=await fetch(base+'/api/hidi/landing-media-upload',{method:'POST',headers:{'Content-Type':'image/png','Content-Length':String(uploadBytes.length),'X-HIDI-Filename':encodeURIComponent('Future Ananya.png'),Cookie:'session=fixture'},body:uploadBytes});
  const uploadBody=await uploaded.text();assert.equal(uploaded.status,201,uploadBody);
  const uploadedAsset=JSON.parse(uploadBody).asset;
  assert.match(uploadedAsset.url,/^\/api\/hidi\/hero-asset\/brand\/landing-media\/media\/\d{8}\/.+\.png$/);
  assert(!uploadedAsset.url.startsWith('https://thidigk.thehidi.com/media/'));
  const uploadedRead=await response(uploadedAsset.url);assert.equal(uploadedRead.result.status,200);assert.deepEqual(uploadedRead.body,uploadBytes);

  const admin=await (await fetch(base+'/admin/landing-media')).text();
  const slotBlock=/const slots = \[\n(.*?)\n\];/s.exec(admin);assert(slotBlock,'Admin slots block');
  const adminSlots=[...slotBlock[1].matchAll(/id:"([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(adminSlots,['hero','range-everyday','range-work-edit','range-occasion','ananya','hidi-edit-banner']);
  assert(!admin.includes('Range 02 - New arrivals'));assert(!admin.includes('Range 05 - Shop all'));
  assert(admin.includes('first active photo also powers the Ananya’s Pick category card'));

  const playwright=await import(process.env.HIDI_PLAYWRIGHT_MODULE);const browserResults=[];
  for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
    const browser=await playwright[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',hasTouch:true});
    const page=await context.newPage();const mediaFailures=[],pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('response',result=>{const path=new URL(result.url()).pathname;if((path.startsWith('/api/hidi/hero')||path.startsWith('/api/hidi/landing-media'))&&result.status()>=400)mediaFailures.push({path,status:result.status()});});
    try{
      await page.goto(base+'/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>{const image=document.querySelector('.hero-live-media');return image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0&&image.style.visibility!=='hidden';},null,{timeout:30000});
      const heroPaint=await page.evaluate(()=>{const image=document.querySelector('.hero-live-media');const media=document.querySelector('.hero-media');return {src:new URL(image.src).pathname,frameReady:media.dataset.frameReady,naturalWidth:image.naturalWidth,visibility:getComputedStyle(image).visibility};});
      assert.equal(heroPaint.src,proxy(heroKey));assert.equal(heroPaint.frameReady,'true');assert(heroPaint.naturalWidth>0);assert.equal(heroPaint.visibility,'visible');
      const casual=page.locator('.hidi-collection-card[aria-label$=": Casual Wear"] img');await casual.waitFor();await casual.scrollIntoViewIfNeeded();await casual.evaluate(image=>image.decode());
      const casualPaint=await casual.evaluate(image=>({src:new URL(image.currentSrc||image.src).pathname,width:image.naturalWidth,visibility:getComputedStyle(image).visibility}));
      assert.equal(casualPaint.src,proxy(landingKey));assert(casualPaint.width>0);assert.notEqual(casualPaint.visibility,'hidden');
      const ananyaCard=page.locator('.hidi-collection-card[aria-label$=": Ananya’s Pick"] img');await ananyaCard.waitFor();await ananyaCard.scrollIntoViewIfNeeded();await ananyaCard.evaluate(image=>image.decode());
      assert.equal(await ananyaCard.evaluate(image=>new URL(image.currentSrc||image.src).pathname),proxy(landingKey));
      const ananya=page.locator('.meet-cinematic--photo .meet-cinematic__model');await ananya.waitFor();await ananya.scrollIntoViewIfNeeded();await ananya.evaluate(image=>image.decode());
      const ananyaPaint=await ananya.evaluate(image=>({src:new URL(image.currentSrc||image.src).pathname,width:image.naturalWidth,height:image.naturalHeight,visibility:getComputedStyle(image).visibility}));
      assert.equal(ananyaPaint.src,proxy(landingKey));assert(ananyaPaint.width>0&&ananyaPaint.height>0);assert.notEqual(ananyaPaint.visibility,'hidden');
      await page.locator('.meet-cinematic--photo').screenshot({path:join(output,`candidate-${engine}-ananya.png`)});
      await new Promise(done=>setTimeout(done,250));
      const blockingPageErrors=pageErrors.filter(error=>!error.startsWith('Minified React error #418;'));
      assert.deepEqual(mediaFailures,[]);assert.deepEqual(blockingPageErrors,[]);
      browserResults.push({engine,heroPaint,casualPaint,ananyaPaint,mediaFailures,pageErrors,blockingPageErrors});
    }finally{await context.close();await browser.close();}
  }

  assert.equal(fixtureBlobWrites,2);assert.equal(fixturePutPaths.filter(path=>path==='/hero/brand/landing-media/library.json').length,1);assert.equal(fixturePutPaths.filter(path=>/^\/hero\/brand\/landing-media\/media\/\d{8}\/.+\.png$/.test(path)).length,1);
  const report={passed:true,legacyUrlsNormalized:true,futureUploadsUsePrivateProxy:true,directBlobUrlsNormalized:true,r2ProviderGuardPresent:(await readFile(join(root,'hero-media.mjs'),'utf8')).includes('config.provider !== "azure"'),adminSlots,browserResults,fixtureBlobWrites,fixturePutPaths,productionWrites,blobWrites:0,databaseWrites:0};
  assert.equal(report.r2ProviderGuardPresent,true);assert.equal(productionWrites,0);
  await mkdir(output,{recursive:true});await writeFile(join(output,'candidate.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(logs.slice(-3000));throw error;}
finally{child.kill('SIGTERM');await new Promise(done=>{if(child.exitCode!==null)return done();child.once('exit',done);setTimeout(()=>{child.kill('SIGKILL');done();},5000).unref();});blob.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(done=>blob.close(done)),new Promise(done=>upstream.close(done))]);}
