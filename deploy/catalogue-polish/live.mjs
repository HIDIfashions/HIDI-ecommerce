import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base='https://hidiindia.com',results=[];
const css=await readFile(new URL('./catalogue-polish.css',import.meta.url),'utf8');
for(const engine of ['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{
    for(const width of [320,390,844,1440]){
      const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
      await context.route('**/*',route=>{
        const r=route.request(),url=new URL(r.url());
        if(!['GET','HEAD'].includes(r.method())||/razorpay\.com|google-analytics|googletagmanager|facebook\.net/.test(url.hostname)||r.resourceType()==='media')return route.abort();
        return route.continue();
      });
      const page=await context.newPage();page.setDefaultTimeout(45000);
      await page.goto(base+'/collections/all',{waitUntil:'domcontentloaded'});
      await page.locator('[class*="collection-browser_productGrid__"] article').first().waitFor();
      const style=await page.locator('style[data-hidi-storefront-layer-fix="true"]').textContent();
      assert(style.includes(css),'Live wrapper contains exact approved CSS');
      assert.equal(await page.locator('[class*="product-card-media_expandIcon__"]:visible,[class*="product-card_mobileQuickAdd__"]:visible').count(),0);
      assert(await page.getByRole('button',{name:/wishlist/}).count()>0,'Wishlist retained');
      const state=await page.evaluate(()=>({padding:parseFloat(getComputedStyle(document.querySelector('.collection-page')).paddingTop),weight:getComputedStyle(document.querySelector('[class*="product-card_name__"]')).fontWeight,overflow:document.documentElement.scrollWidth>innerWidth}));
      assert.equal(state.padding,width<=720?12:20);assert.equal(state.weight,'400');assert.equal(state.overflow,false);
      results.push({engine,width,...state,passed:true});await context.close();
    }
  }finally{await browser.close();}
}
await mkdir('evidence/catalogue-polish',{recursive:true});
await writeFile('evidence/catalogue-polish/live.json',JSON.stringify({passed:true,results,liveWrites:0},null,2));
console.log('PASS approved CSS, absent photo overlays and retained wishlist in all three browsers');
