import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium,firefox,webkit}=await import(process.env.HIDI_PLAYWRIGHT_MODULE||'playwright');
const item={variantId:'fixture-M',productId:'fixture',productName:'3 Piece Embroidered Kurta Set Along With Bottom Straight Pants & Full Length Dupatta',category:'Occasional Wear',color:'Red',sku:'HIDI-NILA-NAVY-FLORAL-KURTA-8A95F2A6B641-NAVY-BLUE-WITH-PINK-AND-MULTICOLOUR-EMBR-XXL',size:'XL',barcode:'H10001901',mrpPaise:219900,onHand:1,reserved:0,fabric:'Cotton',care:'Gentle Hand Wash / Dry Clean',bustMm:960,waistMm:880,hipMm:1020,shoulderMm:370,sleeveLengthMm:450,garmentLengthMm:1120};
const details={legalName:'HIDI',address:'2-58/1/704,Sy.No 11/29, Hyma Arcade Building, Flat No:704, Khanamet\nAyyappa Society, Serilingampally',consumerCareEmail:'contact@hidiindia.com',consumerCarePhone:'+919000812818',website:'www.hidiindia.com',countryOfOrigin:'India'};
export async function probe(base,mode='candidate',routePatch){
 const out='evidence/price-tag-release/'+mode;await mkdir(out,{recursive:true});const cases=[];
 for(const [engine,type] of Object.entries({chromium,firefox,webkit}).filter(([e])=>(process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',').includes(e))){const browser=await type.launch({headless:true});try{for(const width of [390,1440])for(const preset of ["50x50","50x40","40x50"]){
 console.log('Checking',engine,width,preset);const context=await browser.newContext({viewport:{width,height:1100}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({details})=>{localStorage.setItem('hidi.price-tags.business-details.v1',JSON.stringify(details));window.print=()=>{};},{details});
 await context.route('**/*',route=>new URL(route.request().url()).origin!==new URL(base).origin?route.abort():route.continue());
 await context.route('**/admin/**',route=>new URL(route.request().url()).searchParams.has('_rsc')?route.fulfill({status:204,body:''}):route.continue());
 await context.route('**/api/admin/**',async route=>{assert.equal(route.request().method(),'GET','No production mutations');const path=new URL(route.request().url()).pathname;let data;
 if(path==='/api/admin/session')data={admin:{id:'preview-owner',displayName:'Preview',email:'preview@example.test',role:'OWNER'}};
 else if(path.includes('/price-tags'))data={items:[item],total:1,productCount:1,totalOnHand:1,truncated:false};
 else if(path.endsWith('/options'))data={categories:[],collections:[]};else data={};
 await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 if(routePatch)await routePatch(context);
 await page.goto(base+'/admin/products/price-tags',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator(`input[value="${preset}"]`).evaluate(el=>el.click());
 await page.getByRole('button',{name:'One each',exact:true}).evaluate(el=>el.click());
 const preview=page.locator('[data-square="true"]');await preview.waitFor();const box=await preview.boundingBox();assert(Math.abs(box.width/box.height-(preset==="40x50"?.8:preset==="50x40"?1.25:1))<.01);
 await page.getByRole('button',{name:'Print selected tags',exact:true}).evaluate(el=>el.click());
 const frame=page.frameLocator('iframe[title="HIDI price tag print job"]');await frame.locator('.price-tag[data-raster-ready]').waitFor();
 const metrics=await frame.locator('.price-tag').evaluate(el=>{const image=el.querySelector('.thermal-label-image');return {...JSON.parse(el.dataset.layoutMetrics),rasterWidth:image.naturalWidth,rasterHeight:image.naturalHeight,rasterReady:image.complete,html:el.ownerDocument.documentElement.outerHTML};});

 assert(Math.abs(metrics.width-(preset==="40x50"?151.18:188.976))<1);assert(Math.abs(metrics.height-(preset==="50x40"?151.18:188.976))<1);assert(metrics.bottomGap>=6,"Footer needs bottom clearance "+JSON.stringify(metrics));assert(metrics.titleFont<=6.01,"Smaller product title");assert(metrics.legalScroll<=metrics.legalClient+1,'Footer clipped '+JSON.stringify(metrics));
 assert(metrics.rasterReady);assert.equal(metrics.rasterWidth,preset==="40x50"?320:400);assert.equal(metrics.rasterHeight,preset==="50x40"?320:400);
 assert.equal(metrics.addressLines,2);assert(metrics.addressFits,"Address must fit two lines");assert(metrics.logoPaths>0&&metrics.logoHeight>10,"Embedded printable logo must be visible");
 assert(!metrics.text.includes(item.sku),"SKU removed from print");
 for(const text of [item.barcode,details.consumerCareEmail,'Gentle Hand Wash'])assert(metrics.text.includes(text));
 if(width===1440&&engine==='chromium'){
 await page.screenshot({path:out+'/'+preset+'-size-option.png',fullPage:true});
 const printPage=await context.newPage();await printPage.setViewportSize({width:650,height:650});await printPage.setContent(metrics.html);await printPage.waitForTimeout(300);await printPage.locator('.price-tag').screenshot({path:out+'/'+preset+'-tag.png',scale:'css'});await writeFile(out+'/'+preset+'-print.html',metrics.html);
 }
 await page.reload({waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(key=>document.querySelector('input[value="'+key+'"]')?.checked,preset);assert(await page.locator(`input[value="${preset}"]`).isChecked(),'Preset persists');assert.deepEqual(errors,[]);
 cases.push({engine,width,preset,passed:true,exactDimensions:true,footerFits:true});await context.close();
 }}finally{await browser.close();}}
 await writeFile(out+'/report.json',JSON.stringify({passed:true,cases,productionWrites:0},null,2));console.log(JSON.stringify(cases));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')))await probe(process.argv[2],process.argv[3]);
