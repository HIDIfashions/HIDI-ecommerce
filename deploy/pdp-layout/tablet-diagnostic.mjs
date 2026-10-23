import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const css=await readFile(new URL('./pdp-layout.css',import.meta.url),'utf8');
await mkdir('outputs/tablet-diagnostic',{recursive:true});
const browser=await pw.firefox.launch();const results=[];
try{
 for(const width of [761,1000])for(let run=0;run<5;run++){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(30000);
  await page.route('**/*',r=>['GET','HEAD'].includes(r.request().method())&&!/googletagmanager|cloudflareinsights|google-analytics/.test(r.request().url())?r.continue():r.abort());
  await page.goto('https://hidiindia.com/products/kur-036-women-s-wine-purple-embroidered-kurta-set-with-dupatta',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('[class*="activeImage"] img')?.naturalWidth>0);
  await page.evaluate(()=>document.fonts.ready);
  const data=await page.evaluate(async css=>{
   const frame=document.querySelector('[class*="activeImage"]'),gallery=document.querySelector('[class*="galleryLayout"]'),style=document.querySelector('style[data-hidi-storefront-layer-fix]');
   if(style.textContent.includes('hidi-pdp-layout-20261023'))throw Error('Diagnostic requires restored original production image');
   const read=()=>({height:frame.getBoundingClientRect().height,width:frame.getBoundingClientRect().width,top:getComputedStyle(frame).getPropertyValue('--pdp-gallery-top'),scrollY,headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom,galleryTop:gallery.getBoundingClientRect().top});
   const initial=read();scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const before=read(),original=style.textContent;style.textContent=original+'\n'+css;const after=read();
   style.textContent=original;const restored=read();
   return {initial,before,after,restored};
  },css);
  assert.equal(data.before.height,data.after.height,'Approved CSS must not change tablet height within identical header state');
  assert.equal(data.before.width,data.after.width);assert.deepEqual(data.before,data.restored);
  results.push({width,run,...data});console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 await writeFile('outputs/tablet-diagnostic/report.json',JSON.stringify({passed:true,results,upstreamWrites:0},null,2));
}finally{await browser.close();}
