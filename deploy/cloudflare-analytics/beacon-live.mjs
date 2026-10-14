import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch();
const reports=[];
try {
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile});
    const page=await context.newPage();
    const beacons=[];let scriptStatus;
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(/googletagmanager|google-analytics|facebook\.net/.test(url.hostname))return route.fulfill({status:200,contentType:'application/javascript',body:''});
      if(!['GET','HEAD'].includes(req.method()) && url.hostname!=='cloudflareinsights.com')return route.abort();
      return route.continue();
    });
    page.on('response',async response=>{
      const request=response.request(),url=new URL(response.url());
      if(url.hostname==='static.cloudflareinsights.com'&&url.pathname==='/beacon.min.js')scriptStatus=response.status();
      if(url.hostname==='cloudflareinsights.com'&&url.pathname==='/cdn-cgi/rum'&&request.method()==='POST') {
        let data;try {data=request.postDataJSON();}catch{}
        beacons.push({status:response.status(),token:data?.siteToken,eventType:data?.eventType});
      }
    });
    await page.goto('https://hidiindia.com/',{waitUntil:'load',timeout:60000});
    const tracker=page.locator('script[src="https://static.cloudflareinsights.com/beacon.min.js"]');
    await tracker.waitFor({state:'attached'});
    assert.equal(await tracker.count(),1);
    assert.equal(JSON.parse(await tracker.getAttribute('data-cf-beacon')).token,'5ab1ee3a7e1b457d90ad7bd08206b7ed');
    for(let i=0;i<20&&!beacons.length;i++)await page.waitForTimeout(1000);
    if(!beacons.length) {
      await page.goto('https://hidiindia.com/collections/all',{waitUntil:'load',timeout:60000});
      for(let i=0;i<10&&!beacons.length;i++)await page.waitForTimeout(1000);
    }
    assert.equal(scriptStatus,200,'Cloudflare module must load');
    assert(beacons.some(b=>b.status>=200&&b.status<300&&b.token==='5ab1ee3a7e1b457d90ad7bd08206b7ed'),'Cloudflare must accept telemetry for the supplied property');
    reports.push({device:mobile?'mobile':'desktop',scriptStatus,beacons,shoppingWrites:0});
    await context.close();
  }
}finally {await browser.close();}
await mkdir('evidence/cloudflare-analytics',{recursive:true});
await writeFile('evidence/cloudflare-analytics/beacon-live.json',JSON.stringify({passed:true,reports},null,2));
console.log('CLOUDFLARE_ACCEPTED',JSON.stringify(reports));
