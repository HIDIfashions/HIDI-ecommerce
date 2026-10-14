/** Loopback integration: production-built Next UI, actual upload route and optimizer.
 * Storage/API are explicit fixtures. No Azure, real login, payment or catalogue writes.
 */
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPhotoRouteFixture,NextRequest} from './photo-route.fixture.mjs';
import {createProductImageHandler,mediaPath} from '../deploy/collection-speed/images.mjs';
const require=createRequire(resolve('apps/web/package.json')),sharp=require('sharp');
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const port=3219,nextPort=3220,apiPort=4219,base='http://127.0.0.1:'+port;
const directory=await mkdtemp(join(tmpdir(),'hidi-web-upload-')),output=resolve('test-results/photo-web-upload');
await mkdir(output,{recursive:true});process.env.MEDIA_STORAGE_PROVIDER='azure';
const h=await createPhotoRouteFixture(directory,{apiBase:'http://127.0.0.1:'+apiPort+'/v1'});
const results=[],snapshots=[],contexts=[];let browser,child,log='';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stock={onHand:8,reserved:1,safetyStock:0,reorderLevel:1};
function product(){const images=h.state.metadata.map((item,i)=>({id:'photo-'+i,url:item.url,alt:'Upload fixture photograph',isMain:i===0}));return {
 id:'photo-fixture',slug:'photo-fixture',name:'Upload fixture kurta',status:'ACTIVE',currency:'INR',pricePaise:199900,minPricePaise:199900,maxPricePaise:199900,shortDescription:'Isolated image test product',description:'Synthetic fixture. Not an item for sale.',fabric:'Fixture fabric',care:'Fixture care',categoryId:null,category:null,collections:[],images,createdAt:'2026-10-15T00:00:00Z',updatedAt:'2026-10-15T00:00:00Z',
 variants:['M','L'].map((size,i)=>({id:'v'+(i+1),productId:'photo-fixture',sku:'PHOTO-'+size,size,color:'Cream',colorHex:'#e7d7c7',active:true,pricePaise:199900,mrpPaise:249900,currency:'INR',weightGrams:400,available:7,inventory:{...stock},images,bustMm:1000,waistMm:null,hipMm:null,shoulderMm:null,sleeveLengthMm:null,garmentLengthMm:1100}))};}
const upstream=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname.replace(/^\/v1/,'');
 const send=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(path.startsWith('/admin/')&&req.headers.authorization!=='Bearer fixture-owner')return send({message:'Fixture session denied'},401);
 if(req.method!=='GET')return send({message:'Unexpected fixture write'},405);
 if(path==='/admin/me')return send({admin:{id:'fixture-staff',displayName:'Upload Fixture',email:'fixture@example.invalid',role:'OWNER',authMode:'SUPABASE'}});
 if(path==='/admin/products/options')return send({categories:[],collections:[]});
 if(path==='/admin/products/photo-fixture')return send(product());
 if(path==='/products')return send([product()]);
 if(path.startsWith('/products/'))return send(product());
 if(path==='/health')return send({status:'ok'});
 return send([]);
});
const optimizer=createProductImageHandler({origin:base,sharp,cacheDir:join(directory,'image-cache'),seedDir:join(directory,'none'),fetchSource:async source=>{
 const file=h.state.files.get(source.replace(/^\/media\//,''));if(!file)throw new Error('Fixture source missing');return {path:file.path};
}});
const front=createServer(async(req,res)=>{
 const url=new URL(req.url,base),path=url.pathname;
 try{
  if(path==='/api/admin/inventory/v1/images'&&req.method==='POST'){
   const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
   const request=new NextRequest(base+req.url,{method:'POST',headers,body:Readable.toWeb(req),duplex:'half'});
   const result=await h.route.POST(request,{params:Promise.resolve({variantId:'v1'})});
   res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));
  }
  if(await optimizer.handle(req,res,path))return;
  if(path.startsWith('/media/products/')){
   const canonical=mediaPath(path),file=canonical&&h.state.files.get(canonical.replace(/^\/media\//,''));
   if(!file){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':file.type,'content-length':file.size});return res.end(await readFile(file.path));
  }
  const proxy=httpRequest({hostname:'127.0.0.1',port:nextPort,path:req.url,method:req.method,headers:req.headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});
  proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(proxy);
 }catch(error){if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({message:String(error.message)}));}
});
const listen=(server,p)=>new Promise((done,reject)=>{server.once('error',reject);server.listen(p,'127.0.0.1',done);});
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function until(check,label,timeout=30000){const start=Date.now();while(!await check()){assert(Date.now()-start<timeout,'Timed out: '+label);await delay(50);}}
async function record(engine,name,work){try{await work();results.push({engine,case:name,status:'PASS'});}catch(error){results.push({engine,case:name,status:'FAIL',error:String(error.stack||error)});throw error;}finally{await writeFile(join(output,'results.json'),JSON.stringify({results,snapshots,storage:'isolated filesystem fixture',productionChanged:false},null,2));}}
const jpeg=await sharp({create:{width:900,height:1350,channels:3,background:'#e7d7c7'}}).jpeg({quality:90}).toBuffer();
const padded=Buffer.alloc(45*1024*1024);jpeg.copy(padded);
const largePath=join(directory,'large-45-MiB.jpg'),smallPath=join(directory,'small.png'),badPath=join(directory,'corrupt.jpg');
await writeFile(largePath,padded);await writeFile(smallPath,await sharp({create:{width:400,height:600,channels:3,background:'#591d20'}}).png().toBuffer());await writeFile(badPath,'Not an image');
const largeHash=hash(padded);
try{
 await listen(upstream,apiPort);await listen(front,port);
 child=spawn(process.execPath,[resolve('apps/web/node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(nextPort)],{cwd:resolve('apps/web'),env:{...process.env,NODE_ENV:'production',API_URL:'http://127.0.0.1:'+apiPort+'/v1',INTERNAL_API_URL:'http://127.0.0.1:'+apiPort+'/v1'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
 await until(async()=>{if(child.exitCode!==null)throw new Error('Next server exited: '+log);try{return (await fetch(base+'/admin')).ok;}catch{return false;}},'Next fixture startup');
 for(const engine of ['chromium','firefox','webkit']){
  h.state.metadata=[];h.state.files.clear();h.state.reads=0;h.state.writes=0;h.state.role='OWNER';h.state.authStatus=200;
  browser=await pw[engine].launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});contexts.push(context);
  await context.addCookies([{name:'hidi_admin_access',value:'fixture-owner',url:base,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage(),errors=[],served=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('response',response=>{if(response.url().includes('/_next/image?'))served.push(response);});
  await record(engine,'Real product-editor screen loads with isolated stock and prices',async()=>{await page.goto(base+'/admin/products/photo-fixture',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Upload fixture kurta',exact:true}).waitFor();assert.equal(await page.locator('input[type="file"]').count(),2);});
  await record(engine,'45 MiB JPEG plus PNG upload through the real sequential web client',async()=>{await page.locator('input[type="file"]').first().setInputFiles([largePath,smallPath]);await page.getByRole('status').filter({hasText:'2 photos attached to all existing Cream sizes.'}).waitFor({timeout:90000});assert.equal(h.state.metadata.length,2);assert.equal(h.state.writes,2);assert.equal(await page.locator('tbody img').count(),4);await h.assertClean();assert.deepEqual(product().variants[0].inventory,stock);assert.equal(product().variants[0].pricePaise,199900);await page.screenshot({path:join(output,engine+'-uploaded.png'),fullPage:true});});
  await record(engine,'The original large upload is byte-for-byte unchanged',async()=>{const file=[...h.state.files.values()].find(file=>file.size===45*1024*1024);assert(file);assert.equal(hash(await readFile(file.path)),largeHash);});
  await record(engine,'Corrupted upload shows an error without attaching a photo',async()=>{await page.locator('input[type="file"]').first().setInputFiles(badPath);await page.getByRole('alert').filter({hasText:/cannot be decoded|malformed/i}).waitFor();assert.equal(h.state.metadata.length,2);assert.equal(h.state.writes,2);await h.assertClean();});
  await record(engine,'Uploaded photos render in the production-built product page as optimized images',async()=>{served.length=0;await page.goto(base+'/products/photo-fixture',{waitUntil:'networkidle'});await page.locator('.pdp-gallery img').first().waitFor();await page.locator('.pdp-gallery img').first().evaluate(img=>img.decode());await until(()=>served.length>0,'optimized image requests');const rows=[];for(const response of served){const headers=await response.allHeaders();if(headers['x-hidi-image-version']==='3'){assert.equal(response.status(),200);const size=Number(headers['content-length']);assert(size>0&&size<45*1024*1024);rows.push({url:response.url(),bytes:size,format:headers['content-type']});}}assert(rows.length>0,'Custom image optimizer served product images');snapshots.push({engine,images:rows});});
  await record(engine,'Desktop and mobile product rendering has no horizontal page overflow',async()=>{for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Overflow '+width);}await page.screenshot({path:join(output,engine+'-product-mobile.png'),fullPage:true});});
  await record(engine,'Uploaded photo opens in zoom and Escape returns to the product page',async()=>{await page.locator('.pdp-gallery button').first().click();const dialog=page.getByRole('dialog',{name:/detailed image viewer/});await dialog.waitFor();await dialog.locator('img').first().evaluate(img=>img.decode());await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(errors,[]);});
  await record(engine,'Missing and expired admin sessions cannot read or store photo uploads',async()=>{const before=h.state.reads;const make=()=>{const form=new FormData();form.set('file',new File([jpeg],'a.jpg',{type:'image/jpeg'}));return form;};assert.equal((await fetch(base+'/api/admin/inventory/v1/images',{method:'POST',body:make()})).status,401);h.state.authStatus=401;assert.equal((await fetch(base+'/api/admin/inventory/v1/images',{method:'POST',headers:{cookie:'hidi_admin_access=fixture-expired',origin:base},body:make()})).status,401);h.state.authStatus=200;assert.equal(h.state.reads,before);await h.assertClean();});
  await context.close();await browser.close();browser=undefined;
 }
}finally{
 await writeFile(join(output,'server.log'),log);await writeFile(join(output,'results.json'),JSON.stringify({results,snapshots,storage:'isolated filesystem fixture; not Azure',largeFile:'Valid JPEG padded to 45 MiB for transport-boundary testing',productionChanged:false},null,2));
 for(const context of contexts)await context.close().catch(()=>{});await browser?.close().catch(()=>{});child?.kill('SIGTERM');for(const server of [front,upstream]){server.closeAllConnections();server.close();}await rm(directory,{recursive:true,force:true});
}
console.log(JSON.stringify({results,snapshots}));assert.equal(results.filter(item=>item.status==='FAIL').length,0);
