import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
export const categories=[['casual-wear','Casual Wear'],['work-wear','Work Wear'],['occasional-wear','Occasional Wear'],['ananyas-pick','Ananya’s Pick']];
const old=/^(New Arrivals|New arrivals|Workwear Edit|Everyday|Occasion|Shop All|Occasion Collection)$/;
export async function probe(base,output,{candidate=false}={}){
 await mkdir(output,{recursive:true});const results=[];
 const cms=candidate?Object.fromEntries(await Promise.all(['hero-config','landing-media-config','privacy-policy'].map(async name=>[name,await readFile(process.env.HIDI_CATEGORY_PRIVATE+'/'+name+'.json','utf8')]))):null;
 for(const engine of ['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
  try{for(const [width,height] of [[320,740],[390,844],[1440,900]]){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',hasTouch:width<1000});
   const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
   const writes=[],telemetryBlocked=[];
   await context.route('**/*',route=>{
    const url=route.request().url();if(/google-analytics|googletagmanager|facebook\.net/.test(url))return route.abort();
    if(candidate&&url.includes('/api/hidi/')){const name=new URL(url).pathname.split('/').at(-1);if(cms[name])return route.fulfill({status:200,contentType:'application/json',body:cms[name]});}
    if(!['GET','HEAD'].includes(route.request().method())){
     const request=route.request(),parsed=new URL(url);
     (isBlockedTelemetry(request.method(),url,new URL(base).origin)?telemetryBlocked:writes).push({method:request.method(),host:parsed.hostname,path:parsed.pathname});
     return route.abort();
    }
    if(route.request().resourceType()==='media')return route.abort();
    return route.continue();
   });
   try{
    assert.equal((await page.goto(base+'/',{waitUntil:'domcontentloaded'})).status(),200);
    await page.locator('#our-range .hidi-collection-card').first().waitFor();
    assert.deepEqual(await page.locator('#our-range .hidi-collection-caption h3').allTextContents(),categories.map(([,title])=>title));
    assert.equal(await page.locator('#our-range .hidi-collection-dot').count(),4);
    const footer=page.locator('.footer-column').filter({has:page.getByRole('heading',{name:'Collections',exact:true})});
    assert.deepEqual(await footer.locator('button').allTextContents(),categories.map(([,title])=>title));
    await page.getByRole('button',{name:'Open HIDI menu',exact:true}).click();
    const navigation=page.locator('.campaign-panel-nav');await navigation.waitFor();
    assert.deepEqual((await navigation.locator('a').allTextContents()).map(value=>value.trim()),categories.map(([,title])=>title));
    assert.deepEqual(await navigation.locator('a').evaluateAll(links=>links.map(link=>new URL(link.href).pathname)),categories.map(([slug])=>'/collections/'+slug));
    await page.screenshot({path:`${output}/${engine}-${width}-home-menu.png`});await page.keyboard.press('Escape');
    for(const [slug,title] of categories){
     assert.equal((await page.goto(base+'/collections/'+slug,{waitUntil:'domcontentloaded'})).status(),200);
     await page.getByRole('heading',{name:title,exact:true,level:1,includeHidden:true}).waitFor({state:'attached'});
     if(width>=1000){
      const nav=page.getByRole('navigation',{name:'Primary navigation',exact:true});
      assert.deepEqual(await nav.locator('a').allTextContents(),categories.map(([,name])=>name));
     }else{
      await page.getByRole('button',{name:'Open menu',exact:true}).click();
      const nav=page.locator('.mobile-nav-links');await nav.waitFor();
      assert.deepEqual((await nav.locator('a').allTextContents()).map(value=>value.replace('→','').trim()),categories.map(([,name])=>name));
      assert.deepEqual(await nav.locator('a').evaluateAll(links=>links.map(link=>new URL(link.href).pathname)),categories.map(([id])=>'/collections/'+id));
      await page.screenshot({path:`${output}/${engine}-${width}-${slug}.png`});await page.keyboard.press('Escape');
     }
     assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,'Category navigation must fit viewport');
     const visible=await page.locator('a,button,h1,h2,h3').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>n.textContent.trim()));
     assert(!visible.some(value=>old.test(value)),'An old category is still visible');
    }
    await page.getByRole('button',{name:'Search',exact:true}).click();
    const suggestions=page.getByRole('navigation',{name:'Suggested searches'});await suggestions.waitFor();
    assert.deepEqual(await suggestions.locator('a').allTextContents(),categories.map(([,title])=>title));
    await page.keyboard.press('Escape');
    assert.deepEqual(errors.filter(error=>!error.startsWith('Minified React error #418;')),[],'No new browser exceptions');
    assert.deepEqual(writes,[],'Live category verification may not submit any writes');
    results.push({engine,width,height,passed:true,fourCategoryMenu:true,fourCarouselItems:true,fourFooterLinks:true,allCategoryViews:true,searchSuggestions:true,telemetryRequestsBlocked:telemetryBlocked.length});
    console.log(`PASS ${candidate?'candidate':'live'} ${engine} ${width}: exactly four categories, menu/footer/carousel, filtered views, search and viewport bounds`);
   }catch(error){
    await page.screenshot({path:`${output}/${engine}-${width}-failure.png`,fullPage:true}).catch(()=>{});
    await writeFile(`${output}/${engine}-${width}-failure.html`,await page.content()).catch(()=>{});
    await writeFile(`${output}/${engine}-${width}-failure.json`,JSON.stringify({url:page.url(),errors,writes,telemetryBlocked,headings:await page.locator('h1,h2,h3').allTextContents()},null,2)).catch(()=>{});
    throw error;
   }finally{await context.close();}
  }}finally{await browser.close();}
 }
 const report={passed:true,results,cases:results.length,productionWrites:0};await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
