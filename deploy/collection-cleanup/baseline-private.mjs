import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';

// Exercise the unchanged production image under delayed React startup. The
// existing pricing script can insert its cart/checkout note before hydration.
// This proves the private-route warning predates this collection-only overlay.
export async function baselinePrivateProof(base,output){
  const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  await mkdir(output,{recursive:true});
  const browser=await chromium.launch({headless:true}),issues=[],writes=[];
  try{for(const path of ['/cart','/checkout']){
    const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{'x-forwarded-host':'hidiindia.com','x-forwarded-proto':'https'}});
    let release;const gate=new Promise(done=>release=done);
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD'].includes(request.method())){
        const beacon=/(^|\.)(?:google-analytics\.com|analytics\.google\.com|cloudflareinsights\.com)$/.test(url.hostname);
        if(isBlockedTelemetry(request.method(),request.url(),base)||beacon)return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
        writes.push({path:url.pathname,method:request.method()});return route.abort();
      }
      if(request.resourceType()==='script'&&url.origin===base&&url.pathname.startsWith('/_next/static/chunks/'))await gate;
      if(request.resourceType()==='script'&&/(^|\.)(?:googletagmanager\.com|google-analytics\.com|analytics\.google\.com|cloudflareinsights\.com)$/.test(url.hostname))return route.fulfill({status:200,contentType:'application/javascript',body:'/* Tracking isolated in baseline regression. */'});
      if(['image','media'].includes(request.resourceType())||/razorpay\.com$/.test(url.hostname))return route.abort();
      return route.continue();
    });
    const page=await context.newPage();let resolveIssue;
    const observed=new Promise(done=>resolveIssue=done);
    page.on('pageerror',error=>{if(/Minified React error #418;/.test(error.message))resolveIssue(error.message);});
    try{
      assert((await page.goto(base+path,{waitUntil:'commit'})).ok());
      await page.locator('main [data-hidi-price-note]').waitFor({state:'attached',timeout:15000});
      const note=await page.locator('main [data-hidi-price-note]').textContent();
      assert.match(note,/prices already include 15% off/);
      release();
      let timeout;const message=await Promise.race([observed,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Unchanged baseline did not reproduce the private hydration issue: '+path)),15000);})]).finally(()=>clearTimeout(timeout));
      await page.waitForLoadState('load');
      await page.locator('h1').waitFor({state:'attached'});
      assert.equal(await page.locator('h1').count(),1,'Baseline private page recovers');
      await page.screenshot({path:output+'/baseline-'+path.slice(1)+'.png'});
      issues.push({path,message,baseline:base,trigger:'Existing pricing note inserted before delayed React startup',privatePageRecovered:true});
    }finally{release();await context.close();}
  }}finally{await browser.close();}
  assert.deepEqual(writes,[]);
  const result={passed:true,unchangedBaseline:true,issues,liveWrites:0};
  await writeFile(output+'/baseline-private.json',JSON.stringify(result,null,2));
  console.log('PASS: unchanged baseline reproduces and recovers from its existing cart/checkout pricing-note hydration race');
  return result;
}
