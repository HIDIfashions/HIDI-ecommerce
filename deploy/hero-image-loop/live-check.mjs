// Read-only verification. Never create live carts, uploads, orders or payments.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const before=process.argv.includes('--before'),base='https://hidiindia.com',out='evidence/hero-image-loop/'+(before?'live-before':'live');await mkdir(out,{recursive:true});
const {chromium}=await import(process.env.HIDI_PLAYWRIGHT_MODULE),browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
const config=await(await fetch(base+'/api/hidi/hero-config')).json();
try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}});
 await context.route('**/*',route=>!['GET','HEAD'].includes(route.request().method())?route.abort():route.continue());
 const page=await context.newPage();await page.goto(base+'/');
 if(!before)await page.locator('style[data-hidi-hero-image-fit]').waitFor({state:'attached'});
 if(config.items.length===1&&config.items[0].type==='video'){
  await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.loop&&!v.paused&&v.currentTime>.2;},{},{timeout:60000});
  assert.equal(await page.locator('img.hero-live-media').count(),0);
 }
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:out+'/'+width+'-home.png'});results.push({width,homepageHealthy:true,videoOnlyVerified:config.items.length===1&&config.items[0].type==='video'});
 await context.close();
}}finally{await browser.close();}
await writeFile(out+'/report.json',JSON.stringify({passed:true,productionWrites:0,results},null,2));
