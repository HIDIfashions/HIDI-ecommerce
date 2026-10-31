// Read-only browser regression for the retired launch strip.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function probe(base,{output='evidence/launch-strip-removal/candidate',live=false}={}){
 const engines=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),results=[];await mkdir(output,{recursive:true});
 for(const engine of (process.env.HIDI_BROWSER_ENGINES||'chromium,firefox,webkit').split(',')){
  const server=await engines[engine].launchServer(),browser=await engines[engine].connect(server.wsEndpoint());
  try{for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:1000}}),requests=[];context.setDefaultTimeout(20000);context.setDefaultNavigationTimeout(30000);
   await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
   const page=await context.newPage();page.on('request',r=>{if(/(?:launch-countdown|home-countdown-)/.test(r.url()))requests.push(r.url());});
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('.hidi-page .site-header').waitFor();
   await page.waitForFunction(()=>document.querySelector('.hidi-page .site-header')&&getComputedStyle(document.querySelector('.hidi-page .site-header')).backgroundColor==='rgb(89, 30, 34)');
   assert.equal(await page.locator('#hidi-launch-countdown').count(),0);assert.deepEqual(requests,[]);
   assert.equal(await page.getByText('We’re live',{exact:true}).count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const hero=page.locator('.hero-media').first();await hero.waitFor();
   const headerBox=await page.locator('.hidi-page .site-header').boundingBox(),heroBox=await hero.boundingBox();
   assert(headerBox&&heroBox&&heroBox.height>100,'Header and hero remain rendered');
   await page.screenshot({path:output+'/'+engine+'-'+width+'-home.png',animations:'disabled'});
   await page.evaluate(()=>window.scrollTo(0,500));await page.setViewportSize({width:width===390?430:1280,height:900});
   assert.equal(await page.locator('#hidi-launch-countdown').count(),0);
   await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});await page.locator('body').waitFor();
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('.hidi-page .site-header').waitFor();
   assert.equal(await page.locator('#hidi-launch-countdown').count(),0);assert.deepEqual(requests,[]);
   results.push({engine,width,stripAbsent:true,noCountdownRequests:true,burgundyHeader:true,heroRendered:true,noOverflow:true,resizeAndReturn:true});
   await context.close();console.log('PASS launch strip removal '+engine+' '+width);
  }}finally{await server.kill();}
 }
 const report={passed:true,actualRuntime:!live,productionWrites:0,results};await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
if(process.argv.includes('--live'))await probe('https://hidiindia.com',{output:'evidence/launch-strip-removal/live',live:true});
