import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base='https://thidigk.thehidi.com';const output='evidence/live';await mkdir(output,{recursive:true});
const results=[];
for(const engine of['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{for(const[width,height]of[[320,740],[390,844],[768,1024],[844,390],[1024,768],[1440,900]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1100,reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Playback is covered by the unchanged media layer and the source tests.
  // This public check performs no writes and avoids downloading the full film.
  await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())&&route.request().resourceType()!=='media'?route.continue():route.abort());
  try{
   const response=await page.goto(base,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
   await page.locator('#meet-hidi img').waitFor();await page.locator('#hidi-edit').scrollIntoViewIfNeeded();
   await page.locator('#meet-hidi img').evaluate(i=>i.decode());await page.locator('#hidi-edit img').evaluate(i=>i.decode());
   const g=await page.evaluate(()=>{
    const photo=document.querySelector('#meet-hidi img'),banner=document.querySelector('#hidi-edit img'),p=photo.getBoundingClientRect(),b=banner.getBoundingClientRect(),canvas=document.querySelector('.meet-cinematic--photo').getBoundingClientRect(),cta=document.querySelector('.meet-cinematic__content').getBoundingClientRect(),action=document.querySelector('.edit-campaign__button').getBoundingClientRect();
    return{width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,photoRatio:p.width/p.height,naturalRatio:photo.naturalWidth/photo.naturalHeight,bannerRatio:b.width/b.height,bannerNatural:banner.naturalWidth/banner.naturalHeight,extraPhotoHeight:canvas.height-p.height,photoBottom:p.bottom,ctaTop:cta.top,bannerBottom:b.bottom,bannerCtaTop:action.top,photoControls:!!document.querySelector('#meet-hidi .media-sequence-controls'),tapTargets:[...document.querySelectorAll('.footer-column>a,.footer-column>button,.social-link,.hidi-collection-dot,.promise .small-link,.newsletter-field input,.newsletter-field button,.footer-app-download,.footer-bottom>a')].map(e=>e.getBoundingClientRect().height)};
   });
   assert(g.overflow<=1);assert(Math.abs(g.bannerRatio-g.bannerNatural)<.02);
   if(width<=700||(width<=1000&&height>width)){assert(Math.abs(g.photoRatio-g.naturalRatio)<.02);assert(g.extraPhotoHeight<(g.photoControls?200:140));assert(g.ctaTop>=g.photoBottom-1);}
   if(width<1100){assert(g.bannerCtaTop>=g.bannerBottom-1);assert(g.tapTargets.every(v=>v>=43.5));}
   await page.locator('#our-range').scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Next collection',exact:true}).click();await page.getByRole('button',{name:'Previous collection',exact:true}).click();
   await page.getByRole('button',{name:'Open HIDI menu',exact:true}).click();assert(await page.getByRole('dialog').isVisible());await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Search HIDI products',exact:true}).click();await page.getByLabel('Search products',{exact:true}).fill('kurta');await page.locator('.campaign-search-feedback').waitFor();assert(!await page.getByText('Search is temporarily unavailable.',{exact:false}).count());await page.keyboard.press('Escape');
   await page.locator('#meet-hidi').scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${engine}-${width}-home.png`,fullPage:true,timeout:30000});
   assert.deepEqual(errors,[]);results.push({engine,width,height,status:'PASS',geometry:g});console.log(`PASS live ${engine} ${width}: full images, spacing, touch targets, gallery, menu and search`);
  }finally{await context.close();}
 }}finally{await browser.close();await writeFile(output+'/report.json',JSON.stringify(results,null,2));}
}
console.log('PASS: 18 live browser/viewport cases; read-only requests only');
