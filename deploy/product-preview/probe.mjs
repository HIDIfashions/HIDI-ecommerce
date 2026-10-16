import assert from 'node:assert/strict';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const playwright=await import(process.env.HIDI_PLAYWRIGHT_MODULE||'playwright');
const make=i=>({id:'preview-fixture-'+i,name:'Preview dress '+i,slug:'preview-dress-'+i,status:i===22?'ARCHIVED':'ACTIVE',skn:String(10000+i),categoryId:'retain-category',collections:[{collectionId:'retain-collection'}],shortDescription:'Three piece cotton set',description:'**Cotton** kurta.\n\nElegant embroidery.\nIncludes: Kurta, bottom, dupatta',fabric:'Cotton',care:'Gentle hand wash',updatedAt:'2026-10-16T00:00:00.000Z',images:[],variants:['M','L'].map(size=>({id:i+size,sku:'PREVIEW-'+i+size,size,color:'Royal blue',active:true,pricePaise:182750,mrpPaise:215000,images:[],inventory:{onHand:3,reserved:0}}))});
export async function probe(base,output){
 await mkdir(output,{recursive:true});const cases=[];const catalogueResponse=await fetch(base+'/api/store/products');assert.equal(catalogueResponse.status,200);const catalogue=await catalogueResponse.json();assert(catalogue.length>0);const product=catalogue.find(p=>/royal blue/i.test(p.name))||catalogue[0];
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await playwright[engine].launch({headless:true});try{for(const width of [375,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],escaped=[];let fixtureWrites=0;
 page.on('pageerror',e=>{if(!e.message.includes('Minified React error #418'))errors.push(e.message);});page.on('dialog',d=>d.accept());
 const records=new Map(Array.from({length:23},(_,i)=>{const p=make(i);return [p.id,p];}));
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();const send=(status,value)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
 if(url.origin===base&&path.startsWith('/api/admin/products')){
 const id=decodeURIComponent(path.slice('/api/admin/products/'.length));
 if(path==='/api/admin/products'&&method==='GET'){const q=url.searchParams.get('q')||'',items=[...records.values()].filter(p=>!q||p.name.includes(q)),page=Number(url.searchParams.get('page')||1);return send(200,{items:items.slice((page-1)*20,page*20),total:items.length,page,pageSize:20});}
 const record=records.get(id);if(!record)return send(404,{});if(method==='GET')return send(200,record);
 if(method==='PATCH'){const body=req.postDataJSON();assert.equal(body.expectedUpdatedAt,record.updatedAt);for(const key of ['status','variants','images','pricePaise','stock'])assert.equal(body[key],undefined);assert.equal(body.categoryId,'retain-category');assert.deepEqual(body.collectionIds,['retain-collection']);fixtureWrites++;const next={...record,...body,updatedAt:new Date(Date.parse(record.updatedAt)+1).toISOString()};records.set(id,next);return send(200,next);}}
 if(isBlockedTelemetry(method,url.href,base))return route.fulfill({status:204,body:''});
 if(url.origin===base&&method==='POST'&&/\/checkout\/(?:offers\/)?quote$/.test(path))return send(400,{message:'Select a dress and size to request a quote.'});
 if(!['GET','HEAD','OPTIONS'].includes(method)){escaped.push(method+' '+path);return send(403,{message:'Read-only live regression'});}
 if(url.origin!==base&&!path.match(/\.(?:jpg|jpeg|png|webp|svg|avif)$/i))return route.fulfill({status:204,body:''});
 return route.continue();});
 try{
 await page.goto(base+'/admin/product-preview');await page.getByText('23 dresses',{exact:true}).waitFor();assert.equal(await page.locator('.dress-row').count(),20);await page.locator('#next').click();await page.getByText('Page 2 of 2').waitFor();await page.locator('[data-id="preview-fixture-22"]').click();await page.locator('#copy-name').waitFor();
 await page.locator('#copy-description').fill('# Details\n**Soft cotton** and *embroidery*\n\n- Kurta\n- Dupatta\n<script>window.bad=true</script>');await page.locator('#copy-care').fill('**Cold** hand wash\n\nDry flat');assert.equal(fixtureWrites,0);assert.equal(await page.locator('#preview li').count(),2);assert.equal(await page.evaluate(()=>window.bad),undefined);
 await page.locator('#save').click();await page.getByText('Saved Preview dress 22. Product text updated.').waitFor();assert.equal(fixtureWrites,1);await page.reload();await page.locator('#copy-care').waitFor();assert.equal(await page.locator('#copy-care').inputValue(),'**Cold** hand wash\n\nDry flat');
 await page.locator('#copy-care').fill('Unsaved text');await page.locator('#reset').click();assert.equal(await page.locator('#copy-care').inputValue(),'**Cold** hand wash\n\nDry flat');
 await page.route('**/api/admin/products/preview-fixture-22',async route=>route.request().method()==='PATCH'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Changed elsewhere; review before saving.'})}):route.fallback());await page.locator('#copy-care').fill('Keep on conflict');await page.locator('#save').click();await page.getByText('Changed elsewhere; review before saving.').waitFor();assert.equal(await page.locator('#copy-care').inputValue(),'Keep on conflict');await page.locator('#reset').click();
 await page.route('**/api/admin/products/preview-fixture-22',route=>route.request().method()==='PATCH'?route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Please sign in again.'})}):route.fallback());await page.locator('#copy-care').fill('Retain expired-session draft');await page.locator('#save').click();await page.locator('#auth').waitFor({state:'visible'});assert.equal(await page.locator('#copy-care').inputValue(),'Retain expired-session draft');await page.locator('#reset').click();
 await page.locator('#device').selectOption('desktop');await page.locator('#framing').selectOption('original');assert.equal(await page.locator('#preview').getAttribute('data-framing'),'original');await page.locator('#framing').selectOption('portrait');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:output+'/'+engine+'-'+width+'-editor.png',fullPage:true});
 await page.goto(base+'/products/'+encodeURIComponent(product.slug));await page.locator('.pdp-gallery [data-hidi-portrait]').waitFor();await page.locator('[data-hidi-copy="description"]').waitFor();const frame=page.locator('.pdp-gallery [data-hidi-portrait]').first();const box=await frame.boundingBox();assert(Math.abs(box.width/box.height-.75)<.015,'Primary photo uses a 3:4 frame');assert.equal(await frame.locator('img').evaluate(i=>getComputedStyle(i).objectFit),'cover');
 await frame.click();await page.locator('[role="dialog"]').waitFor();assert.equal(await page.locator('[role="dialog"] img').first().evaluate(i=>getComputedStyle(i).objectFit),'contain');await page.keyboard.press('Escape');
 await page.screenshot({path:output+'/'+engine+'-'+width+'-product.png',fullPage:true});
 for(const path of ['/collections/all','/cart','/checkout','/account','/wishlist']){const response=await page.goto(base+path);assert(response.status()<400,path+' available');}
 assert.deepEqual(escaped,[]);assert.deepEqual(errors,[]);cases.push({engine,width,passed:true,editorSaveAndReload:true,conflictsRetainDraft:true,portraitFrame:true,fullOriginalInspection:true,retainedCommerce:true});
 }finally{await context.close();}
 }}finally{await browser.close();}
 }
 const report={passed:true,cases,productionWrites:0,adminFixtureWritesOnly:true};await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
