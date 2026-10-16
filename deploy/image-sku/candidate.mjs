import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
const root=resolve(process.env.HIDI_CANDIDATE_RUNTIME),output='evidence/image-sku/candidate';
const playwright=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const escaped=[];
const upstream=createServer((req,res)=>{if(!['GET','HEAD'].includes(req.method))escaped.push(req.method+' '+req.url);res.writeHead(401,{'content-type':'application/json'});res.end('{"message":"Read-only fixture"}');});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
const reserve=createServer();await new Promise(done=>reserve.listen(0,'127.0.0.1',done));const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),API_URL:'http://127.0.0.1:'+upstream.address().port+'/v1',INTERNAL_API_URL:'http://127.0.0.1:'+upstream.address().port+'/v1'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
let photoFixture;
const proxy=createServer(async(req,res)=>{
  if(req.method==='POST'&&/^\/api\/admin\/inventory\/variant-[^/]+\/images$/.test(req.url.split('?')[0])&&photoFixture){
    try{await photoFixture(req,res);}catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({message:error.message}));}
    return;
  }
  if(!['GET','HEAD'].includes(req.method)){escaped.push(req.method+' '+req.url);res.writeHead(401);res.end();return;}
  const upstreamRequest=httpRequest({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},upstreamResponse=>{res.writeHead(upstreamResponse.statusCode,upstreamResponse.headers);upstreamResponse.pipe(res);});
  upstreamRequest.on('error',()=>{res.writeHead(503);res.end();});req.pipe(upstreamRequest);
});
await new Promise(done=>proxy.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+proxy.address().port,cases=[],bytes=Buffer.from([255,216,255,217]);
const makeProduct=()=>({id:'fixture-magenta',name:'Fixture Magenta Set',slug:'fixture-magenta',status:'DRAFT',categoryId:'casual',category:{id:'casual',name:'Casual Wear',slug:'casual-wear'},collections:[],updatedAt:'2026-10-10T00:00:00.000Z',shortDescription:'Keep',description:'Old',fabric:'Cotton',care:'Keep care',images:[],variants:['M','L','XL','XXL'].map(size=>({id:'variant-'+size,sku:'FIXTURE-HIDI-'+size,color:'Magenta',size,colorHex:null,active:true,pricePaise:109500,mrpPaise:149900,weightGrams:null,images:[],inventory:{onHand:0,reserved:0}}))});
function photoZip(){let offset=0;const locals=[],central=[];for(const name of ['folder/KUR_001_4.JPEG','folder/KUR_001_3.JPEG']){const filename=Buffer.from(name),local=Buffer.alloc(30),entry=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt32LE(bytes.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);locals.push(local,filename,bytes);central.push(entry,filename);offset+=local.length+filename.length+bytes.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);}
await mkdir(output,{recursive:true});
try{
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error('Candidate exited: '+logs.slice(-1500));await new Promise(done=>setTimeout(done,200));}assert(ready);
  assert.equal((await fetch(base+'/api/hidi/product-image-skus')).status,401,'Registry route must require staff auth');
  for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
    const browser=await playwright[engine].launch({headless:true});
    try{for(const width of [320,1440]){
      const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),product=makeProduct(),bindings=[];
      const errors=[],unexpected=[],photoNumbers=[];let metadataWrites=0,mappingWrites=0,photoWrites=0,statusWrites=0,lost=true;
      // Receive the real multipart bytes; WebKit's intercepted postDataBuffer may decode binary as text.
      photoFixture=async(req,res)=>{
        const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;assert(length<1024*1024,'Fixture upload must remain bounded');chunks.push(chunk);}
        const form=await new Response(Buffer.concat(chunks),{headers:{'content-type':req.headers['content-type']}}).formData();
        assert.equal(form.get('applyToColor'),'true');assert.equal(form.get('imageSku'),'KUR_001');
        const alt=form.get('alt'),number=Number(form.get('photoNumber')),file=form.get('file'),uploadedBytes=Buffer.from(await file.arrayBuffer());assert(uploadedBytes.equals(bytes),'Browser must preserve every uploaded file byte');
        const digest=createHash('sha256').update(uploadedBytes).digest('hex'),key=createHash('sha256').update([form.get('imageSku'),String(number),file.type,digest].join('\u0000')).digest('hex'),photoUrl='/media/products/variants/source/batch-'+key+'.'+({'image/jpeg':'jpg','image/webp':'webp'})[file.type];assert(!alt.includes('sha256'));photoNumbers.push(number);photoWrites++;
        for(const variant of product.variants)variant.images.push({id:'image-'+photoWrites+'-'+variant.id,url:photoUrl,alt,position:variant.images.length});
        const variant=product.variants.find(variant=>req.url.includes('/'+variant.id+'/'));res.writeHead(lost?500:200,{'content-type':'application/json'});res.end(JSON.stringify(lost?{message:'Lost successful response'}:variant));lost=false;
      };
      page.on('pageerror',error=>{if(!error.message.includes('Minified React error #418'))errors.push(error.message);});page.on('dialog',dialog=>dialog.accept());
      await page.route(url=>!(url.origin===base&&/^\/api\/admin\/inventory\/variant-[^/]+\/images$/.test(url.pathname)),async route=>{
        const request=route.request(),url=new URL(request.url()),method=request.method();const send=(status,value)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
        if(url.origin===base&&url.pathname==='/api/admin/session')return send(200,{admin:{id:'fixture-owner',role:'OWNER',displayName:'Fixture',permissions:['catalog:read','catalog:write']}});
        if(url.origin===base&&url.pathname.startsWith('/api/hidi/product-image-skus')){
          if(method==='GET')return send(200,{bindings});const body=request.postDataJSON();
          if(url.pathname.endsWith('/preflight')){assert(body.bindings.length);return send(200,{passed:true});}
          assert.equal(body.imageSku,'KUR_001');assert.equal(body.productId,product.id);assert.equal(body.color,'Magenta');assert.equal(body.expectedUpdatedAt,product.updatedAt);mappingWrites++;
          const binding={imageSku:body.imageSku,productId:product.id,productSlug:product.slug,color:body.color};bindings.push(binding);return send(200,{saved:true,binding});
        }
        if(url.origin===base&&url.pathname==='/api/admin/inventory'&&method==='GET')return send(200,{rows:product.variants.map(variant=>({productId:product.id,productName:product.name,variantId:variant.id,sku:variant.sku,color:variant.color,size:variant.size,onHand:0}))});
        if(url.origin===base&&url.pathname.startsWith('/api/admin/products')){
          const tail=url.pathname.slice('/api/admin/products'.length);
          if(tail==='/options')return send(200,{categories:[product.category],collections:[]});
          if(!tail&&method==='GET')return send(200,{items:[product],total:1,page:1,pageSize:20});
          if(tail==='/'+product.id&&method==='GET')return send(200,product);
          if(tail==='/'+product.id&&method==='PATCH'){metadataWrites++;const body=request.postDataJSON();assert.equal(body.expectedUpdatedAt,product.updatedAt);assert.equal(body.description,'Saved supplier details');assert.equal(body.status,undefined);Object.assign(product,body,{updatedAt:'2026-10-10T00:01:00.000Z'});return send(200,product);}
          if(tail==='/'+product.id+'/status'&&method==='POST'){statusWrites++;assert(product.variants.every(variant=>variant.images.length));assert.equal(request.postDataJSON().expectedUpdatedAt,product.updatedAt);product.status='ACTIVE';return send(200,product);}
        }
        if(!['GET','HEAD'].includes(method)){if(isBlockedTelemetry(method,url,base))return route.abort();unexpected.push(method+' '+url.pathname);return route.abort();}return route.continue();
      });
      try{
        await page.goto(base+'/admin/import',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Import products, stock & photography',exact:true}).waitFor();
        const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download Excel-compatible template',exact:true}).click();const download=await downloadPromise;assert((await readFile(await download.path(),'utf8')).includes('image_sku'));
        const csv='mode,product_name,product_slug,category,description,color,size,selling_price,mrp,opening_qty,image_sku\r\n'+['M','L','XL','XXL'].map(size=>'NEW,Fixture Magenta Set,fixture-magenta,Casual Wear,Saved supplier details,Magenta,'+size+',1095,1499,0,KUR_001').join('\r\n');
        await page.locator('#products-stock input[type=file]').setInputFiles({name:'image-sku-products.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.getByRole('button',{name:'Import 4 rows',exact:true}).click();await page.getByText('Import complete. 4 rows saved.',{exact:false}).waitFor();assert.equal(metadataWrites,1);assert.equal(mappingWrites,1);assert.equal(product.status,'DRAFT');
        const selected=[{name:'KUR_001_10.JPEG',mimeType:'image/jpeg',buffer:bytes},{name:'KUR_001_2.WEBP',mimeType:'image/webp',buffer:bytes},{name:'KUR_001_1.JPEG',mimeType:'image/jpeg',buffer:bytes}];
        await page.locator('#photos input[type=file][multiple]').setInputFiles(selected);await page.getByRole('button',{name:'Upload 3 photos',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:/Apply every uploaded image/}).isChecked(),false);await page.getByRole('button',{name:'Upload 3 photos',exact:true}).click();await page.getByText('3 photos uploaded successfully.',{exact:true}).waitFor();assert.deepEqual(photoNumbers,[1,2,10]);assert(product.variants.every(variant=>variant.images.length===3));
        await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Bulk product photos',exact:true}).waitFor();await page.locator('#photos input[type=file][multiple]').setInputFiles(selected);await page.getByRole('button',{name:'Upload 3 photos',exact:true}).click();await page.getByText('3 photos uploaded successfully.',{exact:true}).waitFor();assert.equal(photoWrites,3,'Reload and reselect must skip completed matching photos');
        await page.locator('#photos input[type=file][accept*=".zip"]').setInputFiles({name:'photos.zip',mimeType:'application/zip',buffer:photoZip()});await page.getByRole('button',{name:'Upload 2 photos',exact:true}).click();await page.getByText('2 photos uploaded successfully.',{exact:true}).waitFor();assert.deepEqual(photoNumbers,[1,2,10,3,4]);assert(product.variants.every(variant=>variant.images.length===5));
        await page.locator('#photos input[type=file][multiple]').setInputFiles([{name:'KUR_001_1.JPEG',mimeType:'image/jpeg',buffer:bytes},{name:'KUR_001_1.WEBP',mimeType:'image/webp',buffer:bytes}]);await page.getByText(/Duplicate photo number/).first().waitFor();assert(await page.getByRole('button',{name:'Upload 2 photos',exact:true}).isDisabled());
        const panel=page.locator('#hidi-bulk-publish');await panel.getByRole('button',{name:'Review latest imported batch',exact:true}).click();await panel.getByText('Ready to publish',{exact:true}).waitFor();await panel.getByRole('button',{name:'Select all ready products',exact:true}).click();await panel.getByRole('button',{name:'Publish selected products (1)',exact:true}).click();await panel.getByText('Published',{exact:true}).waitFor();assert.equal(statusWrites,1);
        assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);
        await page.screenshot({path:join(output,engine+'-'+width+'.png'),fullPage:true});cases.push({engine,width,passed:true,metadataWrites,mappingWrites,photoWrites,statusWrites,sharedSizes:4,reloadIdempotent:true,zip:true,lostResponseReconciled:true,duplicateBlocked:true,realWrites:0});
      }catch(error){await page.screenshot({path:join(output,engine+'-'+width+'-failure.png'),fullPage:true});await writeFile(join(output,engine+'-'+width+'-failure.json'),JSON.stringify({errors,unexpected,photoNumbers,photoWrites,message:await page.locator('body').innerText()},null,2));throw error;}finally{photoFixture=null;await context.close();}
    }}finally{await browser.close();}
  }
  assert.deepEqual(escaped,[]);await writeFile('evidence/image-sku/candidate.json',JSON.stringify({passed:true,cases,retainedRuntime:true,fixtureOnlyWrites:true},null,2));console.log('PASS: Image SKU import, ordered multi-file and ZIP photos, colour-size sharing, reload, interrupted upload, duplicate blocking and publication across three browsers and mobile/desktop');
}catch(error){console.error(logs.slice(-1500));throw error;}finally{proxy.closeAllConnections();await new Promise(done=>proxy.close(done));child.kill('SIGTERM');await new Promise(done=>{child.once('exit',done);setTimeout(()=>{child.kill('SIGKILL');done();},5000).unref();});upstream.closeAllConnections();await new Promise(done=>upstream.close(done));}
