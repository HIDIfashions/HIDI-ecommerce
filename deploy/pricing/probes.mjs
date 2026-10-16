import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function probe(base,output,{engines=['chromium','firefox','webkit']}={}){
 const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);await mkdir(output,{recursive:true});const results=[];
 for(const engine of engines){const browser=await pw[engine].launch({headless:true});try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'hidi_admin_access',value:'owner',url:base}]);
  const variant={id:'fixture-m',sku:'PRICE-M',color:'Ivory',size:'M',pricePaise:100000,mrpPaise:115000,active:true,available:4,weightGrams:null,bustMm:1000,waistMm:800,hipMm:null,shoulderMm:null,sleeveLengthMm:null,garmentLengthMm:null};
  let products=Array.from({length:21},(_,i)=>({id:'price-'+i,skn:String(10000+i),name:'Price style '+i,slug:'price-style-'+i,status:'ACTIVE',updatedAt:'2026-10-16T00:00:00.000Z',variants:[{...variant,id:'v-'+i,sku:'SKU-'+i}]})),writes=0,conflict=false,sitewide=false;
  await context.route('**/api/admin/products**',async route=>{
   const req=route.request(),u=new URL(req.url()),parts=u.pathname.split('/').filter(Boolean);let data,status=200;
   if(parts.length===3){const page=Number(u.searchParams.get('page')||1);assert.equal(u.searchParams.get('status'),'ACTIVE');data={total:21,items:products.slice((page-1)*20,page*20)};}
   else{const p=products.find(p=>p.id===parts[3]);if(req.method()==='PATCH'){
    const body=req.postDataJSON();assert.equal(parts[4],'variants');assert.equal(body.weightGrams,null);assert.equal(body.bustMm,1000);assert.equal(body.waistMm,800);assert.equal(body.active,true);
    if(conflict||body.expectedUpdatedAt!==p.updatedAt){status=409;data={message:'Product changed since preview. Reload before saving.'};}
    else{p.variants[0]={...p.variants[0],pricePaise:body.pricePaise,mrpPaise:body.mrpPaise};p.updatedAt=new Date(Date.parse(p.updatedAt)+1000).toISOString();writes++;data=p;}
   }else data=p;}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.route('**/api/store/products',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([{id:'isolated-product',slug:'isolated-style',name:'Isolated candidate style',minPricePaise:sitewide?85000:100000,inStock:true,images:[],variants:[{...variant,pricePaise:sitewide?85000:100000,mrpPaise:100000}]}])}));
  const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(base+'/admin/product-pricing');await page.getByText('All published prices loaded. Nothing has been changed.',{exact:true}).waitFor();assert.equal(await page.locator('#rows tr').count(),21);assert.equal(writes,0);
  await page.getByLabel('Selling price for SKU-1',{exact:true}).fill('900');
  await page.getByLabel('Selling price for SKU-0',{exact:true}).fill('977.50');await page.locator('#rows tr').first().getByRole('button',{name:'Save row',exact:true}).click();await page.getByText('Saved SKU-0. Other rows and product details are unchanged.',{exact:true}).waitFor();assert.equal(writes,1);assert.equal(products[0].variants[0].mrpPaise,115000);assert.equal(products[0].variants[0].pricePaise,97750);assert.equal(await page.getByLabel('Selling price for SKU-1',{exact:true}).inputValue(),'900');
  conflict=true;await page.getByLabel('Selling price for SKU-0',{exact:true}).fill('950');await page.locator('#rows tr').first().getByRole('button',{name:'Save row',exact:true}).click();await page.locator('#status').filter({hasText:'Save was not confirmed'}).waitFor();assert.equal(writes,1);assert.equal(await page.getByLabel('Selling price for SKU-0',{exact:true}).inputValue(),'950');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/'+engine+'-'+width+'-admin.png',fullPage:false});
  // The storefront must suppress the blanket claim for even one mismatch.
  page.on('dialog',dialog=>dialog.accept());await page.goto(base+'/collections/all');await page.locator('[data-hidi-pricing-loader]').waitFor({state:'attached'});await page.waitForLoadState('networkidle');assert.equal(await page.locator('[data-hidi-price-announcement]').count(),0);
  // Real catalogue card prices retain their actual percentages rather than 15.
  const badges=await page.locator('[data-hidi-price-badge]').allTextContents();assert(badges.every(label=>label!=='15% OFF'));
  sitewide=true;await page.reload();await page.locator('[data-hidi-price-announcement]').waitFor();assert.match(await page.locator('[data-hidi-price-announcement]').innerText(),/Prices already reduced/);
  await page.screenshot({path:output+'/'+engine+'-'+width+'-qualified-banner.png'});
  const checkout=await(await fetch(base+'/offers-assets/checkout.js')).text();assert(!checkout.includes("+'15% off',()=>changed"));assert(checkout.includes('Your private ₹1 dress test'));
  await context.close();results.push({engine,width,pagination:true,noAutomaticPriceWrites:true,manualSave:true,measurementsPreserved:true,unsavedSiblingPreserved:true,conflictsRejected:true,falseSitewideClaimSuppressed:true,qualifiedBanner:true,extraPercentButtonRemoved:true});
 }}finally{await browser.close();}}
 const report={passed:true,results,productionWrites:0};await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
