import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { handleQuickTools, injectQuickTools } from '../deploy/admin-tools/handler.mjs';
import {workbookFixture} from './fixtures/product-workbook.mjs';
import {parseCreate,parseEdit} from '../apps/api/src/admin/products/product-input.ts';
const modulePath=process.env.HIDI_PLAYWRIGHT_MODULE||'/tmp/hidi-otp-playwright-20261009/node_modules/playwright/index.mjs';
const {chromium,firefox,webkit}=await import(modulePath);
const root=new URL('../',import.meta.url);
const out=new URL('../test-results/admin-quick-tools/',import.meta.url);await mkdir(out,{recursive:true});
const sample="Product Name\tWomen's Cream Floral Printed Kurta Set with Dupatta\nSKU / Style Code\tKUR_001\nCategory\tWomen's Ethnic Wear\nSubcategory\tKurta Set with Bottom and Dupatta\nIncluded Components\tKurta, Bottom and Dupatta\nTop / Kurta\nFabric: Cotton\nSize- L, XL, XXL, 3XXL\nNeckline: V neck\nGentle Hand Wash / Dry Clean\nBottom / Pants\nFabric: Cotton\nStyle: Straight-fit\nDupatta / Chunni\nFabric: Cotton\nPattern: Floral print";
const original={id:'product1',name:'Existing product',categoryId:'cat1',category:{name:"Women's Ethnic Wear"},shortDescription:'Existing short text',fabric:'Silk',care:'Dry clean',description:'Old product details',status:'ACTIVE',updatedAt:'2026-10-10T00:00:00.000Z',collections:[{collectionId:'retain-collection'}],variants:[{id:'variant1',pricePaise:199900}]};
function fixtures(){return {queue:[{orderNumber:'ORDER-001',status:'CONFIRMED',createdAt:'2026-10-10T00:00:00.000Z',itemCount:3,totalPaise:399900,customerPhone:'9000000000',shippingAddress:{firstName:'Ananya',lastName:'Test',city:'Hyderabad',state:'TS',postalCode:'500001'},items:[{productName:'Cream Floral Kurta',sku:'SKU-L',size:'L',color:'Cream',quantity:2,image:'/fixture-product.svg'},{productName:'Office Kurta',sku:'SKU-XL',size:'XL',color:'Pink',quantity:1,image:'/fixture-product.svg'}]},{orderNumber:'ORDER-002',status:'CONFIRMED',createdAt:'2026-10-10T01:00:00.000Z',itemCount:1,totalPaise:199900,customerPhone:'9000000001',shippingAddress:{firstName:'Second',lastName:'Customer'},items:[{productName:'Second Kurta',sku:'SKU-M',size:'M',color:'Blue',quantity:1}]}],failComplete:0,failLoad:false,denied:false,deniedStatus:401,planStatus:'CONFIRMED',writes:[],completeWrites:[]};}
let state=fixtures();
function products(){return state.products??=structuredClone([{...original,slug:'existing-product',variants:[{id:'v1',sku:'HIDI-EXISTING-L',pricePaise:199900}]},{...original,id:'product2',name:'Second product',slug:'second-product',variants:[{id:'v2',sku:'HIDI-SECOND-L',pricePaise:199900}]}]);}
const server=createServer(async(q,s)=>{
  const url=new URL(q.url,'http://localhost'),path=url.pathname;
  if(path==='/fixture-product.svg'){s.writeHead(200,{'content-type':'image/svg+xml'});s.end('<svg xmlns="http://www.w3.org/2000/svg" width="70" height="94" viewBox="0 0 70 94"><rect width="70" height="94" fill="#f3e9db"/><path d="M25 12 L18 18 L8 33 L17 39 L23 29 L17 81 L53 81 L47 29 L53 39 L62 33 L52 18 L45 12 L39 20 L31 20 Z" fill="#c2a783" stroke="#8f7959"/><path d="M35 20 V72" stroke="#f6f0e7"/></svg>');return;}
  if(await handleQuickTools(q,s,path))return;
  const json=(data,status=200)=>{s.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});s.end(JSON.stringify(data));};
  let raw='';for await(const chunk of q)raw+=chunk;const body=raw?JSON.parse(raw):null;
  if(path.startsWith('/api/')&&state.denied)return json({message:state.deniedStatus===403?'Your role does not allow this action':'Admin session expired'},state.deniedStatus);
  if(path==='/api/admin/products/options')return json({categories:[{id:'cat1',name:"Women's Ethnic Wear"}],collections:[]});
  if(path==='/api/admin/products'&&q.method==='GET'){const result=products().filter(p=>!url.searchParams.get('q')||p.name.includes(url.searchParams.get('q'))||p.variants.some(v=>v.sku===url.searchParams.get('q')));return json({items:result.map(({variants,...p})=>({...p,variantCount:variants.length})),total:result.length,page:1,pageSize:20});}
  if(path.startsWith('/api/admin/products/')&&q.method==='GET')return json(products().find(p=>p.id===path.split('/').at(-1))||{message:'Not found'});
  if(path.startsWith('/api/admin/products')&&['POST','PATCH'].includes(q.method)){
    state.writes.push({path,method:q.method,body});try{q.method==='POST'?parseCreate(body):parseEdit(body);}catch(e){return json({message:e.message},400);}
    if(state.failProduct===path){state.failProduct=null;return json({message:'Temporary product failure'},503);}
    if(state.delayProduct)await new Promise(r=>setTimeout(r,state.delayProduct));
    const id=q.method==='POST'?'pm_'+body.requestId.replace(/-/g,''):path.split('/').at(-1),old=products().find(p=>p.id===id)||original;
    if(q.method==='PATCH'&&body.expectedUpdatedAt!==old.updatedAt)return json({message:'Product changed since preview. Reload before saving.'},409);
    const saved={...old,...body,id,status:q.method==='POST'?'DRAFT':old.status,collections:body.collectionIds.map(collectionId=>({collectionId})),variants:old.variants};const at=products().findIndex(p=>p.id===id);if(at<0)products().push(saved);else products()[at]=saved;
    if(state.lostReply){state.lostReply=false;return json({message:'Reply lost after save'},503);}return json(saved);
  }
  if(path==='/api/admin/orders')return json({orders:state.queue.filter(o=>!url.searchParams.get('q')||o.orderNumber.includes(url.searchParams.get('q')))});
  if(path.startsWith('/api/admin/orders/'))return json({order:state.queue.find(o=>o.orderNumber===path.split('/').at(-1))});
  if(path==='/api/hidi/packing-plan'){
    if(state.failLoad)return json({message:'Order not found'},404);
    const order=state.queue.find(o=>o.orderNumber===url.searchParams.get('order'));if(!order)return json({message:'Order not found'},404);
    return json({order:{...order,status:state.planStatus,items:order.items.map((i,n)=>({...i,barcode:n===0?'H000000000001':'H000000000002'}))}});
  }
  if(path==='/api/hidi/packing-complete'){
    state.completeWrites.push(body);if(state.failComplete-->0)return json({message:'Temporary save failure'},503);
    const order=url.searchParams.get('order');state.queue=state.queue.filter(o=>o.orderNumber!==order);return json({packed:true,status:'PACKED',orderNumber:order});
  }
  if(path==='/admin/import'){
    s.writeHead(200,{'content-type':'text/html'});s.end(injectQuickTools('<html><body><main><h1>Import</h1><section id="products-stock"><button onclick="window.originalTemplateFired=true">Download Excel-compatible template</button><button id="choose">Choose CSV / XLSX</button></section><section id="receipt"><button onclick="window.originalTemplateFired=true">Download receipt template</button></section></main></body></html>'));return;
  }
  if(path==='/admin/orders'||path==='/admin/products/product1'){
    s.writeHead(200,{'content-type':'text/html'});s.end(injectQuickTools('<html><body><main><h1>HIDI Admin</h1><nav aria-label="Admin navigation"></nav><table><tr><td><a href="/admin/orders/ORDER-001">ORDER-001</a></td><td>CONFIRMED</td></tr></table></main></body></html>'));return;
  }
  s.writeHead(404);s.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let checks=0;const results=[],opened=[];
async function waitText(page,id,text){await page.locator('#'+id).filter({hasText:text}).waitFor();checks++;}
async function scan(page,code,key='Enter'){await page.locator('#scan').fill(code);await page.locator('#scan').press(key);}
try{
for(const [engine,type] of Object.entries({chromium,firefox,webkit}).filter(([engine])=>!process.env.HIDI_TEST_ENGINE||process.env.HIDI_TEST_ENGINE===engine)){
  console.log(engine+': starting product and packing flows');
  const browser=await type.launch({headless:true,timeout:15000,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});opened.push(browser);console.log(engine+': browser launched');const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(12000);page.on('dialog',dialog=>dialog.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
  state=fixtures();await page.goto(base+'/admin/product-quick-fill?product=product1');await waitText(page,'target','Existing product');console.log(engine+': existing product ready');
  await page.locator('#source').fill(sample);await page.locator('#preview').click();await page.locator('#review').waitFor();
  assert.equal(await page.locator('#field-fabric').inputValue(),'Cotton');assert.match(await page.locator('#field-description').inputValue(),/Dupatta \/ Chunni/);checks+=2;
  await page.getByRole('checkbox',{name:'Save Product name',exact:true}).uncheck();await page.locator('#save').click();await waitText(page,'status','Product details saved');
  const update=state.writes.at(-1);assert.equal(update.method,'PATCH');assert.equal(update.body.name,original.name);assert.deepEqual(update.body.collectionIds,['retain-collection']);assert.equal(update.body.expectedUpdatedAt,original.updatedAt);assert.equal(update.body.fabric,'Cotton');assert.equal(update.body.pricePaise,undefined);assert.equal(update.body.stock,undefined);checks+=7;
  // New draft: required price validation, explicit size review and zero inventory inputs.
  await page.goto(base+'/admin/product-quick-fill');await waitText(page,'target','Creating a new draft');await page.locator('#source').fill(sample);await page.locator('#preview').click();assert.equal(await page.locator('#sizes').inputValue(),'L, XL, XXL, 3XXL');checks++;
  await page.locator('#color').fill('Pale Yellow');await page.locator('#price').fill('2499');await page.locator('#mrp').fill('1999');await page.locator('#save').click();await waitText(page,'status','Selling price cannot exceed');assert.equal(state.writes.length,1);checks++;
  await page.locator('#mrp').fill('3499');await page.locator('#save').click();await waitText(page,'status','Product details saved');const create=state.writes.at(-1);assert.equal(create.method,'POST');assert.equal(create.body.pricePaise,249900);assert.equal(create.body.mrpPaise,349900);assert.deepEqual(create.body.sizes,['L','XL','XXL','3XXL']);assert.equal(create.body.stock,undefined);assert.match(create.body.requestId,/^[a-f0-9-]{36}$/);checks+=6;
  // Actual compressed multi-sheet XLSX: exact matches, unmatched rows and safe retries.
  state=fixtures();await page.goto(base+'/admin/product-bulk');await waitText(page,'status','Ready.');assert.equal(await page.locator('.batch-product').count(),0);checks++;
  const downloadEvent=page.waitForEvent('download');await page.locator('#template').click();const blank=await readFile(await (await downloadEvent).path(),'utf8');assert.equal(blank.trim().split(/\r?\n/).length,1);assert.match(blank,/product_id,hidi_sku/);checks+=2;
  await page.locator('#file').setInputFiles({name:'supplier.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbookFixture()});await page.locator('#preview').click();await waitText(page,'status','Batch preview ready');assert.equal(await page.locator('.batch-product').count(),3);assert.match(await page.locator('#status').innerText(),/Instructions/);assert.doesNotMatch(await page.locator('#rows').innerText(),/Hidden product/);checks+=3;
  await page.locator('#saveTop').click();await waitText(page,'status','Fix or unselect');assert.equal(state.writes.length,0);checks++;
  await page.getByRole('checkbox',{name:'Include product 3',exact:true}).uncheck();state.failProduct='/api/admin/products/product2';state.lostReply=true;await page.locator('#save').click();await waitText(page,'status','Batch finished');await waitText(page,'summary','2 failed');assert.equal(state.writes.length,2);assert.equal(products()[0].fabric,'Cotton');assert.equal(products()[1].fabric,'Silk');checks+=3;
  await page.locator('#save').click();await waitText(page,'summary','2 saved');assert.equal(state.writes.length,3);assert.equal(products()[1].fabric,'Linen');assert.equal(state.writes.at(-1).body.pricePaise,undefined);assert.deepEqual(state.writes.at(-1).body.collectionIds,['retain-collection']);checks+=4;
  await page.locator('#save').click();await waitText(page,'status','Select at least one');assert.equal(state.writes.length,3);checks++;
  // New draft CSV batch: common values, explicit NEW mode, stable idempotent retry IDs.
  state=fixtures();await page.goto(base+'/admin/product-bulk');await waitText(page,'status','Ready.');await page.locator('#mode').selectOption('NEW');await page.locator('#defaults summary').click();for(const [k,v]of Object.entries({price:'1999',mrp:'2999',sizes:'L, XL'}))await page.locator('#default-'+k).fill(v);
  await page.locator('#file').setInputFiles({name:'new-products.csv',mimeType:'text/csv',buffer:Buffer.from('product_name,color,fabric\nFirst new kurta,Cream,Cotton\nSecond new kurta,Pink,Linen\n')});await page.locator('#preview').click();await waitText(page,'status','Batch preview ready');assert.equal(await page.locator('.batch-product').count(),2);checks++;
  await page.screenshot({path:new URL('bulk-desktop-'+engine+'.png',out).pathname,fullPage:true});await page.setViewportSize({width:390,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;await page.screenshot({path:new URL('bulk-mobile-'+engine+'.png',out).pathname,fullPage:true});await page.setViewportSize({width:1440,height:1000});
  state.lostReply=true;await page.locator('#save').click();await waitText(page,'summary','1 saved');assert.equal(state.writes.length,2);const firstId=state.writes[0].body.requestId;await page.locator('#save').click();await waitText(page,'summary','2 saved');assert.equal(state.writes.length,3);assert.equal(state.writes[2].body.requestId,firstId);assert.equal(products().length,4);assert.ok(products().slice(2).every(p=>p.status==='DRAFT'));assert.deepEqual(state.writes[0].body.sizes,['L','XL']);assert.equal(state.writes[0].body.pricePaise,199900);checks+=7;
  // Pausing completes the current request and leaves the next product unsaved.
  state=fixtures();await page.goto(base+'/admin/product-bulk');await waitText(page,'status','Ready.');await page.locator('#file').setInputFiles({name:'pause.csv',mimeType:'text/csv',buffer:Buffer.from('product_id,fabric\nproduct1,Cotton\nproduct2,Linen\n')});await page.locator('#preview').click();await waitText(page,'status','Batch preview ready');state.delayProduct=300;await page.locator('#saveTop').click();await page.locator('.batch-state').first().filter({hasText:'Saving…'}).waitFor();await page.locator('#stop').click();await waitText(page,'status','Batch paused');assert.equal(state.writes.length,1);await waitText(page,'summary','1 saved');assert.equal(products()[1].fabric,'Silk');checks+=2;state.delayProduct=0;await page.locator('#saveTop').click();await waitText(page,'summary','2 saved');assert.equal(state.writes.length,2);checks++;
  // Duplicate products stop the whole selected batch before any writes.
  state=fixtures();await page.goto(base+'/admin/product-bulk');await waitText(page,'status','Ready.');await page.locator('#file').setInputFiles({name:'duplicate.csv',mimeType:'text/csv',buffer:Buffer.from('product_id,fabric\nproduct1,Cotton\nproduct1,Linen\n')});await page.locator('#preview').click();await waitText(page,'status','Batch preview ready');await page.locator('#save').click();await waitText(page,'status','Fix or unselect 2');assert.equal(state.writes.length,0);checks++;
  // Conflicting file identities block a save until the staff member chooses the target.
  state=fixtures();await page.goto(base+'/admin/product-bulk');await waitText(page,'status','Ready.');await page.locator('#file').setInputFiles({name:'conflict.csv',mimeType:'text/csv',buffer:Buffer.from('product_id,product_slug,fabric\nproduct1,wrong-url,Cotton\n')});await page.locator('#preview').click();await waitText(page,'status','Batch preview ready');await page.locator('#save').click();await waitText(page,'status','Fix or unselect');assert.equal(state.writes.length,0);checks++;
  await page.getByRole('combobox',{name:'Match product 1',exact:true}).selectOption('');await page.locator('.batch-state').filter({hasText:'Choose an existing'}).waitFor();await page.getByRole('combobox',{name:'Match product 1',exact:true}).focus();await page.getByRole('combobox',{name:'Match product 1',exact:true}).selectOption('product1');await page.locator('.batch-state').filter({hasText:'Manually selected'}).waitFor();await page.locator('#save').click();await waitText(page,'summary','1 saved');assert.equal(state.writes.length,1);checks++;
  // A concurrent edit is rejected; the batch never silently overwrites it.
  state=fixtures();await page.goto(base+'/admin/product-bulk');await waitText(page,'status','Ready.');await page.locator('#file').setInputFiles({name:'revision.csv',mimeType:'text/csv',buffer:Buffer.from('product_id,fabric\nproduct1,Cotton\n')});await page.locator('#preview').click();await waitText(page,'status','Batch preview ready');products()[0].updatedAt='2026-10-10T01:00:00.000Z';await page.locator('#save').click();await waitText(page,'summary','1 failed');assert.equal(products()[0].fabric,'Silk');assert.match(await page.locator('.batch-state').innerText(),/changed since preview/);checks+=2;
  // Damaged / formula-incomplete workbooks are rejected rather than silently imported.
  const previousWrites=state.writes.length;await page.locator('#file').setInputFiles({name:'broken.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbookFixture({formulaMissing:true})});await page.locator('#preview').click();await waitText(page,'status','Formula results are missing');assert.equal(state.writes.length,previousWrites);assert.equal(await page.locator('#batch').isVisible(),false);checks+=2;
  await page.locator('#file').setInputFiles({name:'duplicate-zip.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbookFixture({duplicatePath:true})});await page.locator('#preview').click();await waitText(page,'status','Unsupported or oversized');assert.equal(state.writes.length,previousWrites);checks++;
  // Queue, manual-free order selection, wrong/extra scan rejection and undo.
  state=fixtures();await page.goto(base+'/admin/packing-scanner');await waitText(page,'queueCount','2 confirmed');await page.locator('.order').first().click();await waitText(page,'customer','Ananya Test');await page.locator('#scan:enabled').waitFor();assert.match(await page.locator('#items').innerText(),/SKU-XL/);assert.equal(await page.locator('#items img').count(),2);checks+=2;
  await page.screenshot({path:new URL('packing-desktop-'+engine+'.png',out).pathname,fullPage:true});
  await scan(page,'H999999999999');await waitText(page,'message','Wrong garment');await scan(page,'invalid');await waitText(page,'message','Invalid garment');assert.equal(state.completeWrites.length,0);checks++;
  await scan(page,'H000000000001','Tab');await waitText(page,'summary','1 of 3');await scan(page,'H000000000001');await waitText(page,'summary','2 of 3');await scan(page,'H000000000001');await waitText(page,'message','Extra scan rejected');assert.equal(state.completeWrites.length,0);checks++;
  await page.locator('#undo').click();await waitText(page,'summary','1 of 3');await scan(page,'H000000000001');state.failComplete=1;await scan(page,'H000000000002');await waitText(page,'message','Temporary save failure');assert.equal(await page.locator('#scan').isDisabled(),true);checks++;
  await page.locator('#retry').click();await waitText(page,'message','Packed successfully');assert.deepEqual(state.completeWrites.at(-1).scannedBarcodes,['H000000000001','H000000000001','H000000000002']);checks++;
  await page.locator('#next:enabled').waitFor();await page.locator('#next').click();await waitText(page,'customer','Second Customer');await waitText(page,'summary','0 of 1');
  // Failed selection must never leave the preceding order scannable.
  state.failLoad=true;await page.locator('summary').click();await page.locator('#orderNo').fill('MISSING');await page.locator('#load').click();await waitText(page,'message','Order not found');assert.equal(await page.locator('#workspace').isVisible(),false);checks++;
  state=fixtures();state.planStatus='CANCELLED';await page.goto(base+'/admin/packing-scanner?order=ORDER-001');await waitText(page,'message','Only confirmed');assert.equal(await page.locator('#scan').isDisabled(),true);checks++;
  state=fixtures();await page.goto(base+'/admin/packing-scanner?order=ORDER-001');await waitText(page,'customer','Ananya Test');assert.equal(await page.locator('#orderNo').inputValue(),'ORDER-001');checks++;
  // Mobile portrait / tablet: no horizontal overflow or overlapping work areas.
  for(const width of [360,390,768]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;}
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:new URL('packing-mobile-'+engine+'.png',out).pathname,fullPage:true});
  await page.goto(base+'/admin/product-quick-fill?product=product1');await waitText(page,'target','Existing product');await page.locator('#source').fill(sample);await page.locator('#preview').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
  await page.screenshot({path:new URL('product-mobile-'+engine+'.png',out).pathname,fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:new URL('product-desktop-'+engine+'.png',out).pathname,fullPage:true});
  state=fixtures();state.denied=true;await page.goto(base+'/admin/packing-scanner');await waitText(page,'queueMessage','Admin session expired');assert.equal(await page.locator('.order').count(),0);await page.locator('#auth').waitFor({state:'visible'});checks+=2;
  await page.goto(base+'/admin/product-quick-fill');await waitText(page,'status','Admin session expired');assert.equal(await page.locator('#preview').isDisabled(),true);checks++;
  await page.goto(base+'/admin/product-bulk');await waitText(page,'status','Admin session expired');assert.equal(await page.locator('#preview').isDisabled(),true);assert.equal(await page.locator('.batch-product').count(),0);checks+=2;
  state.deniedStatus=403;await page.goto(base+'/admin/packing-scanner');await waitText(page,'queueMessage','Your role does not allow');assert.equal(await page.locator('.order').count(),0);checks++;
  state=fixtures();await page.goto(base+'/admin/orders');await page.locator('[data-hidi-quick-fill]').waitFor();assert.equal(await page.getByText('Pack order',{exact:true}).getAttribute('href'),'/admin/packing-scanner?order=ORDER-001');checks++;
  assert.equal(await page.locator('[data-hidi-bulk-details]').getAttribute('href'),'/admin/product-bulk');checks++;
  await page.goto(base+'/admin/products/product1');await page.locator('#hidi-product-quick-fill-link').waitFor();assert.equal(await page.locator('#hidi-product-quick-fill-link').getAttribute('href'),'/admin/product-quick-fill?product=product1');checks++;
  // Retained stock and receipt screens download blank headers, no fabricated products/stock.
  await page.goto(base+'/admin/import');for(const selector of ['#products-stock button:first-child','#receipt button']){const event=page.waitForEvent('download');await page.locator(selector).click();const body=await readFile(await (await event).path(),'utf8');assert.equal(body.trim().split(/\r?\n/).length,1);assert.equal(await page.evaluate(()=>Boolean(window.originalTemplateFired)),false);checks+=2;}
  await page.locator('#choose').click();assert.equal(await page.evaluate(()=>Boolean(window.originalTemplateFired)),false);checks++;
  assert.deepEqual(errors,[]);checks++;results.push({engine,passed:true});await writeFile(new URL('report-'+engine+'.json',out),JSON.stringify({passed:true,engine,checks},null,2));console.log(engine+': passed');await context.close();await browser.close();
}
await writeFile(new URL('report.json',out),JSON.stringify({passed:true,checks,results},null,2));console.log(JSON.stringify({passed:true,checks,results}));
}finally{for(const browser of opened)await browser.close().catch(()=>{});server.closeAllConnections();server.close();}
