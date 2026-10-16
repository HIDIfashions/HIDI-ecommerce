import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';
import {probe as retainedHomepage} from './retained-homepage.mjs';
const names=['DSC01671','DSC01431','DSC01567','DSC01529','DSC01849'];
const titles=['Her softer side.','Her little sunshine.','Her spirited side.','Her bold moments.','Her quiet confidence.'];
export async function probe(base,output,{candidate=false,retained=true}={}){
  await mkdir(output,{recursive:true});
  if(retained)await retainedHomepage(base,output+'/retained-homepage',{candidate});
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  const captured=candidate?JSON.parse(await readFile(process.env.HIDI_CATEGORY_PRIVATE+'/public-before.json','utf8')):null;
  const landing=captured?.landing||await(await fetch(base+'/api/hidi/landing-media-config')).json();
  const banner=candidate?await readFile(process.env.HIDI_CATEGORY_PRIVATE+'/banner-image'):null;
  for(const name of names){
    const response=await fetch(`${base}/assets/images/ananya-portraits/${name}.jpg`);assert(response.ok);
    const bytes=Buffer.from(await response.arrayBuffer()),original=await readFile(new URL('./photos/'+name+'.jpg',import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(original).digest('hex'),'Original photograph bytes retained');
  }
  const results=[];
  for(const engine of (process.env.HIDI_BROWSER_ENGINES||(candidate?'chromium,firefox,webkit':'chromium')).split(',')){
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try{for(const width of [320,390,768,1440]){
      const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,reducedMotion:'reduce'}),page=await context.newPage();
      page.setDefaultTimeout(30000);
      const errors=[],writes=[];let failed=false,custom=false,delay=false;
      page.on('pageerror',error=>errors.push(error.message));
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(isBlockedTelemetry(req.method(),req.url(),new URL(base).origin)||/googletagmanager|google-analytics|facebook\.net/.test(url.hostname))return route.abort();
        if(!['GET','HEAD'].includes(req.method())){writes.push(req.method()+' '+url.pathname);return route.abort();}
        if(req.resourceType()==='media')return route.abort();
        if(candidate&&url.pathname==='/api/hidi/hero-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({active:false,source:'bundled'})});
        if(candidate&&url.pathname==='/api/hidi/landing-media-config'){
          if(delay)await new Promise(done=>setTimeout(done,1000));
          const value=structuredClone(landing);
          if(custom)value.ananya={active:true,autoPlay:true,intervalSeconds:3,items:names.slice(1,3).map(name=>({type:'image',url:'/assets/images/ananya-portraits/'+name+'.jpg',altText:'Admin '+name,fitMode:'cover',desktopPosition:'10% 50%',mobilePosition:'90% 50%'}))};
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
        }
        if(failed&&url.pathname==='/assets/images/ananya-portraits/DSC01671.jpg')return route.fulfill({status:404,body:'Unavailable'});
        if(candidate&&url.pathname.startsWith('/api/hidi/hero-asset/'))return route.fulfill({status:200,contentType:'image/jpeg',body:banner});
        return route.continue();
      });
      const section=page.locator('#meet-hidi'),image=section.locator('.portrait-gallery__portrait'),previews=section.locator('.portrait-gallery__preview');
      try{
        assert.equal((await page.goto(base+'/',{waitUntil:'domcontentloaded'})).status(),200);
        await section.scrollIntoViewIfNeeded();await image.waitFor();
        assert.equal((await section.locator('#meet-title').textContent()).replace(/\s+/g,' ').trim(),'Many versions of her');
        assert.equal(await section.locator('.portrait-gallery__eyebrow').textContent(),'Ananya’s Pick');
        assert.equal(await previews.count(),5);assert.equal(await section.getByRole('link',{name:'Explore Ananya’s Pick'}).getAttribute('href'),'/collections/ananyas-pick');
        for(let index=0;index<5;index++){
          await previews.nth(index).click();await image.evaluate(element=>element.decode());
          assert((await image.getAttribute('src')).endsWith(names[index]+'.jpg'));
          assert.equal(await image.getAttribute('data-media-index'),String(index));
          assert.equal(await section.locator('.portrait-gallery__story h3').textContent(),titles[index]);
          assert.equal(await section.locator('.portrait-gallery__preview[aria-pressed="true"]').count(),1);
          const metrics=await image.evaluate(element=>({width:element.naturalWidth,height:element.naturalHeight,fit:getComputedStyle(element).objectFit}));
          assert.deepEqual(metrics,{width:1365,height:2048,fit:'contain'});
          const target=await previews.nth(index).boundingBox();assert(target.width>=44&&target.height>=44);
        }
        await previews.nth(4).focus();await page.keyboard.press('ArrowRight');assert.equal(await image.getAttribute('data-media-index'),'0');
        await page.keyboard.press('ArrowLeft');assert.equal(await image.getAttribute('data-media-index'),'4');
        await previews.nth(0).click();await image.evaluate(element=>element.decode());
        const layout=await section.evaluate(section=>{
          const photo=section.querySelector('.portrait-gallery__visual').getBoundingClientRect(),copy=section.querySelector('.portrait-gallery__copy').getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth-innerWidth,photo:{left:photo.left,right:photo.right,top:photo.top,bottom:photo.bottom},copy:{left:copy.left,right:copy.right,top:copy.top,bottom:copy.bottom},order:[section.id,section.nextElementSibling?.id,section.nextElementSibling?.nextElementSibling?.id]};
        });
        assert(layout.overflow<=1);assert.deepEqual(layout.order,['meet-hidi','our-promises','hidi-edit']);
        if(width<=700)assert(layout.copy.top>=layout.photo.bottom-1);else assert(layout.copy.left>=layout.photo.right-1);
        await section.screenshot({path:`${output}/${engine}-${width}.png`,animations:'disabled'});
        if(candidate&&width===390){
          failed=true;await page.reload({waitUntil:'domcontentloaded'});await section.scrollIntoViewIfNeeded();
          await section.getByRole('status').filter({hasText:'This photograph is unavailable.'}).waitFor();
          await previews.nth(1).click();await image.evaluate(element=>element.decode());assert((await image.getAttribute('src')).endsWith('DSC01431.jpg'));
          failed=false;custom=true;await page.reload({waitUntil:'domcontentloaded'});await section.scrollIntoViewIfNeeded();await image.waitFor();
          assert.equal(await previews.count(),2,'Future admin uploads keep priority');
          assert.equal(await image.getAttribute('alt'),'Admin DSC01431');
          await page.mouse.move(0,0);await image.evaluate(element=>element.decode());
          await page.waitForTimeout(3500);assert.equal(await image.getAttribute('data-media-index'),'0','Reduced motion prevents automatic rotation');
          await section.getByRole('button',{name:'Pause photographs'}).click();
          await page.emulateMedia({reducedMotion:'no-preference'});
          await section.getByRole('button',{name:'Resume photographs'}).click();
          await page.locator('body').evaluate(element=>element.focus());await page.keyboard.press('Tab');
          await page.locator('.site-header a').first().focus();await section.scrollIntoViewIfNeeded();await page.mouse.move(0,0);
          await page.waitForFunction(()=>document.querySelector('.portrait-gallery__portrait')?.dataset.mediaIndex==='1',null,{timeout:8000});
          await previews.nth(0).click();await page.waitForTimeout(3500);assert.equal(await image.getAttribute('data-media-index'),'0','Manual browsing pauses rotation');
          custom=false;delay=true;await page.reload({waitUntil:'domcontentloaded'});assert.equal(await image.count(),0,'No retired campaign during config loading');
          await section.scrollIntoViewIfNeeded();await image.waitFor();assert.equal(await previews.count(),5);
        }
        const blockingPageErrors=errors.filter(message=>!message.startsWith('Minified React error #418;'));
        assert.deepEqual(blockingPageErrors,[]);assert.deepEqual(writes,[]);
        results.push({engine,width,passed:true,blockingPageErrors,layout});
        console.log(`PASS ${candidate?'candidate':'live'} ${engine} ${width}: five original portraits, captions, selection, keyboard and responsive layout`);
      }catch(error){await page.screenshot({path:`${output}/${engine}-${width}-failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${output}/${engine}-${width}-failure.json`,JSON.stringify({message:error.message,errors,writes},null,2));throw error;}
      finally{await context.close();}
    }}finally{await browser.close();}
  }
  const report={passed:true,portraitGalleryOnly:true,fivePhotographs:true,originalPhotosPreserved:true,singleCareSection:true,correctSectionOrder:true,reducedMotion:true,mediaFailureRecovery:candidate,browserResults:results,blobWrites:0,databaseWrites:0};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
