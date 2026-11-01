// Only public reads. Never upload, publish, create carts/orders, or call payment APIs.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const before=process.argv.includes('--before'),base='https://hidiindia.com',out='evidence/responsive-hero/'+(before?'live-before':'live');await mkdir(out,{recursive:true});
const {chromium}=await import(process.env.HIDI_PLAYWRIGHT_MODULE),server=await chromium.launchServer({headless:true,channel:'chrome'}),browser=await chromium.connect(server.wsEndpoint()),results=[];
const config=await(await fetch(base+'/api/hidi/hero-config')).json();
try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}});context.setDefaultTimeout(45000);
 await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
 console.log('Live hero viewport',width);const page=await context.newPage();await page.goto(base+'/',{waitUntil:'commit'});await page.locator('.hero-media').waitFor();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.site-header')).backgroundColor==='rgb(89, 30, 34)');
 assert.equal(await page.locator('#hidi-launch-countdown').count(),0);
 const checked=[];
 // Verify each currently published slide. Manual navigation avoids waiting for
 // a customer's full-length video; natural looping is covered in the fixture.
 for(const [index,item]of (config.items||[]).entries()){
  console.log('Live slide',width,index,item.type);if(config.items.length>1)await page.locator('.hero .media-sequence-dots button').nth(index).click();
  await page.waitForFunction(index=>Number(document.querySelector('.hero-media')?.dataset.mediaIndex)===index,index);
  if(item.type==='image'){
   const expected=new URL(width<=700&&item.mobileUrl?item.mobileUrl:item.url,base).pathname;
   await page.waitForFunction(expected=>{const i=document.querySelector('img.hero-live-media');return i?.naturalWidth>0&&new URL(i.currentSrc).pathname===expected&&getComputedStyle(i).visibility==='visible';},expected);
  }else {
   // Selecting a slide intentionally pauses rotation in the retained carousel.
   const start=page.locator('.hero .media-sequence-controls button[aria-label^="Start"]');
   if(await start.count())await start.click();
   await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.currentTime>.2&&!v.paused;});
  }
  checked.push({index,type:item.type,visible:true});
  if(index===0)await page.screenshot({path:out+'/'+width+'-home.png'});
 }
 if(config.items?.length===1&&config.items[0].type==='video')assert(await page.locator('video.hero-live-media').evaluate(v=>v.loop));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const admin=await context.request.get(base+'/admin/landing-media');assert(admin.ok());const html=await admin.text();
 if(!before)for(const id of ['heroDeviceImages','heroReplaceDesktop','heroReplaceMobile','heroChooseVideo','heroChooseImage'])assert(html.includes('id="'+id+'"'));
 console.log('PASS live hero',width);results.push({width,slides:checked,burgundyHeader:true,noOverflow:true,controlsAvailable:!before});await context.close();
}}finally{await server.kill();}
assert.deepEqual(await(await fetch(base+'/api/hidi/hero-config')).json(),config,'Read-only verification preserves current hero');
await writeFile(out+'/report.json',JSON.stringify({passed:true,productionWrites:0,results},null,2));
