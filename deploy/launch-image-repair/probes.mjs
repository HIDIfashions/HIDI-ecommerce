import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {mkdir,writeFile} from 'node:fs/promises';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
export async function probe(base){const results=[];
 for(const engine of ['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});try{for(const [device,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:1000}]]){
   const ctx=await browser.newContext({viewport,deviceScaleFactor:2});const p=await ctx.newPage();const errors=[];
   await p.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());p.on('response',r=>{if(new URL(r.url()).pathname==='/_next/image'&&r.status()!==200&&r.status()!==304)errors.push({status:r.status(),url:r.url()});});
   const response=await p.goto(base+'/collections/all',{waitUntil:'domcontentloaded',timeout:60000});assert.equal(response.status(),200);
   await p.locator('.collection-page').waitFor();const cards=p.locator('.collection-page img');assert(await cards.count()>1);
   for(let i=0;i<await cards.count();i++){const image=cards.nth(i);await image.scrollIntoViewIfNeeded();await image.evaluate(img=>img.complete&&img.naturalWidth>0?Promise.resolve():new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(Error('Display image failed')),{once:true});setTimeout(()=>reject(Error('Image delivery exceeded 15 seconds')),15000);}));}
   const rows=await cards.evaluateAll(imgs=>imgs.map(i=>({url:i.currentSrc,width:i.naturalWidth})));assert(rows.every(x=>x.width>0));assert.deepEqual(errors,[],'No failing product image HTTP responses');
   const cream=p.locator('a[href*="cream-embroidered-kurta-pant-set"]').first();if(await cream.count()){await cream.click();await p.waitForURL('**/products/cream-embroidered-kurta-pant-set');await p.locator('.product-page').waitFor();await p.locator('.pdp-gallery img').first().evaluate(img=>img.complete&&img.naturalWidth>0?Promise.resolve():new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true});setTimeout(()=>reject(Error('JPEG PDP image failed')),15000);}));}
   const timing=await p.evaluate(()=>({navigation:performance.getEntriesByType('navigation')[0].toJSON(),images:performance.getEntriesByType('resource').filter(x=>x.initiatorType==='img').map(x=>({url:x.name,bytes:x.encodedBodySize,duration:x.duration}))}));
   results.push({engine,device,passed:true,collectionImages:rows.length,timing});await ctx.close();
  }}finally{await browser.close();}
 }
 return {passed:true,results,realWrites:0};
}
