import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {snapshotServer} from './snapshot-server.mjs';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base=process.env.HIDI_RUNTIME_BASE,out=process.env.HIDI_TEST_OUTPUT;assert(base);
await mkdir(out,{recursive:true});const snapshot=await snapshotServer({directory:out+'/catalogue-snapshot',css:'',upstream:base});
const products=JSON.parse((await snapshot.pull('/api/store/products')).body);assert(products.length>=54,'Full current catalogue required');
const report={passed:false,productCount:products.length,results:[],mediaFailures:[],upstreamWrites:0};
const browser=await chromium.launch(process.platform==='win32'?{channel:'chrome'}:{});
try{
 for(const width of [390,1536]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url());if(!['GET','HEAD'].includes(r.method())||/google-analytics|googletagmanager|facebook.net/.test(u.hostname))return route.abort();
   if(process.env.HIDI_MEDIA_READONLY_ORIGIN&&u.origin===base&&(u.pathname.startsWith('/media/')||u.pathname==='/_next/image')){const data=await snapshot.pull(process.env.HIDI_MEDIA_READONLY_ORIGIN+u.pathname+u.search);return route.fulfill({status:data.status,contentType:data.contentType,body:data.body});}
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('response',r=>{const u=new URL(r.url());if(r.status()>=400&&(u.pathname==='/_next/image'||u.pathname.startsWith('/media/')))report.mediaFailures.push({url:r.url(),status:r.status()});});
  try{for(const product of products){
   report.currentPage={slug:product.slug,width};
   const errors=[];const onerror=e=>errors.push(e.message);page.on('pageerror',onerror);
   assert((await page.goto(base+'/products/'+product.slug,{waitUntil:'domcontentloaded'})).ok());
   await page.locator('[data-hidi-react-pdp][data-hidi-hydrated="true"]').waitFor();
   // Hydration can replace src/srcset while decode() is pending. Require a
   // successfully decoded, stable current image, just as the layout suite does.
   await page.waitForFunction(async()=>{
    const selector='[class*="activeImage"] img',img=document.querySelector(selector);
    if(!img?.complete||!img.naturalWidth)return false;
    const src=img.currentSrc;
    try{await img.decode();return img===document.querySelector(selector)&&img.currentSrc===src&&img.naturalWidth>0;}catch{return false;}
   });
   assert.equal(await page.locator('#reviews h2').textContent(),'Customer Reviews');
   assert.equal(await page.locator('.pdp-related h2').textContent(),'You May Also Like');
   assert.equal(await page.locator('#reviews details').count(),0);
   assert.equal(await page.getByText(/Indian wear with a calm point of view/).count(),0);
   assert.equal(await page.getByRole('link',{name:'Write a review',exact:true}).getAttribute('href'),'/account/orders');
   const layout=await page.evaluate(()=>{const g=document.querySelector('.pdp-grid'),r=document.querySelector('.pdp-related'),v=document.querySelector('#reviews');return {order:g.nextElementSibling===r&&r.nextElementSibling===v,gap:r.getBoundingClientRect().top-g.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth-innerWidth};});
   assert(layout.order);assert(layout.gap<=25);assert(layout.overflow<=1);
   const choices=page.locator('.pdp-info .pdp-purchase .sizes button[aria-pressed]:enabled');let selection='unavailable';
   if(await choices.count()){const choice=choices.first();await choice.click();await page.locator('.pdp-info .sizes button[aria-pressed="true"]').waitFor();await choice.click();await page.waitForFunction(()=>!document.querySelector('.pdp-info .sizes button[aria-pressed="true"]'));selection='passed';}
   // Finish this page's image requests before loading the next product.
   await page.waitForLoadState('networkidle');
   assert.deepEqual(errors,[]);page.off('pageerror',onerror);
   report.results.push({slug:product.slug,width,selection,...layout,passed:true});
   if(report.results.length%10===0)console.log('PASS catalogue '+report.results.length+'/'+products.length*2);
  }}catch(e){
   report.failedImage=await page.locator('[class*="activeImage"] img').evaluate(img=>({src:img.src,currentSrc:img.currentSrc,complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight})).catch(()=>null);
   throw e;
  }finally{await context.close();}
 }
 assert.equal(report.mediaFailures.length,0,'Failed product image requests: '+JSON.stringify(report.mediaFailures.slice(0,3)));
 delete report.currentPage;report.passed=true;
}catch(e){report.error=e.stack;throw e;}
finally{await writeFile(out+'/catalogue-report.json',JSON.stringify(report,null,2));await browser.close();await snapshot.save();await snapshot.close();}
