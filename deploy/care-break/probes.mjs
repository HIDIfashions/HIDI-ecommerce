import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isBlockedTelemetry} from '../button-states/request-policy.mjs';

export async function probe(base,output,{candidate=false}={}){
  await mkdir(output,{recursive:true});
  const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
  const captured=candidate?JSON.parse(await readFile(process.env.HIDI_CATEGORY_PRIVATE+'/public-before.json','utf8')):null;
  const landing=captured?.landing||await(await fetch(base+'/api/hidi/landing-media-config')).json();
  const expected=landing.slots['hidi-edit-banner'];
  assert(expected?.active,'Retain the currently selected uploaded banner photograph');
  const photo=candidate?await readFile(process.env.HIDI_CATEGORY_PRIVATE+'/banner-image'):null;
  const results=[];
  const choices=[['Everyday','/collections/casual-wear','Explore casual wear'],['Work','/collections/work-wear','Explore workwear'],['Celebrations','/collections/occasional-wear','Explore occasion wear']];
  for(const engine of (candidate?'chromium,firefox,webkit':'chromium').split(',')){
    const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1'}}:{})});
    try{for(const width of [320,390,768,1440]){
      const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,reducedMotion:'no-preference'});
      const page=await context.newPage();page.setDefaultTimeout(30000);
      const pageErrors=[],writes=[];let failure=false,delay=false,custom=false;
      page.on('pageerror',error=>pageErrors.push(error.message));
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(isBlockedTelemetry(request.method(),request.url(),new URL(base).origin)||/googletagmanager|google-analytics|facebook\.net/.test(url.hostname))return route.abort();
        if(!['GET','HEAD'].includes(request.method())){writes.push({method:request.method(),path:url.pathname});return route.abort();}
        if(request.resourceType()==='media')return route.abort();
        if(candidate&&url.pathname==='/api/hidi/hero-config')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({active:false,source:'bundled'})});
        if(candidate&&url.pathname==='/api/hidi/landing-media-config'){
          if(delay)await new Promise(done=>setTimeout(done,900));
          const value=structuredClone(landing);
          if(custom){value.slots['hidi-edit-banner'].fitMode='contain';value.slots['hidi-edit-banner'].desktopPosition='58% 38%';value.slots['hidi-edit-banner'].mobilePosition='66% 50%';}
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
        }
        if(candidate&&url.pathname.startsWith('/api/hidi/hero-asset/')){
          if(failure&&url.pathname===new URL(expected.url,base).pathname)return route.fulfill({status:404,body:'Unavailable'});
          return route.fulfill({status:200,contentType:'image/png',body:photo});
        }
        return route.continue();
      });
      const section=page.locator('#hidi-edit');
      const image=section.locator('.next-chapter__photo');
      try{
        assert.equal((await page.goto(base+'/',{waitUntil:'domcontentloaded'})).status(),200);
        const care=page.locator('#our-promises');
        assert.equal(await care.count(),1,'Care content appears exactly once');
        const order=await care.evaluate(care=>[care.previousElementSibling?.id,care.id,care.nextElementSibling?.id]);
        assert.deepEqual(order,['meet-hidi','our-promises','hidi-edit'],'Care creates a break between the existing photo blocks');
        assert.deepEqual(await care.locator('.promise h3').allTextContents(),['Considered collections','Payment clarity','Returns & exchanges','A helping hand']);
        assert.equal(await care.getByRole('link',{name:'Meet your next favourite'}).getAttribute('href'),'/collections/all');
        for(const label of ['About checkout','Read the policy','Contact HIDI'])assert.equal(await care.getByRole('button',{name:label}).count(),1);
        await care.locator('#promises-title').scrollIntoViewIfNeeded();
        for(const card of await care.locator('.promise').all())await card.scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>[...document.querySelectorAll('#our-promises [data-reveal]')].every(item=>Number(getComputedStyle(item).opacity)>.99));
        const careLayout=await care.evaluate(care=>({
          paddingTop:getComputedStyle(care).paddingTop,paddingBottom:getComputedStyle(care).paddingBottom,
          columns:getComputedStyle(care.querySelector('.promises-grid')).gridTemplateColumns.split(' ').length,
          cards:[...care.querySelectorAll('.promise')].map(card=>{const r=card.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};}),
          targets:[...care.querySelectorAll('.small-link')].map(item=>item.getBoundingClientRect().height)
        }));
        assert.equal(careLayout.columns,width<=700?2:4);
        assert.equal(careLayout.paddingTop,width<=700?'32px':'64px');assert.equal(careLayout.paddingBottom,careLayout.paddingTop);
        assert(careLayout.targets.every(height=>height>=44),'Care actions remain usable touch targets');
        if(width<=700){assert(Math.abs(careLayout.cards[0].top-careLayout.cards[1].top)<1);assert(careLayout.cards[2].top>careLayout.cards[0].top);}
        else assert(careLayout.cards.every(card=>Math.abs(card.top-careLayout.cards[0].top)<1));
        await care.screenshot({path:`${output}/${engine}-${width}-care.png`,animations:'disabled'});
        await section.scrollIntoViewIfNeeded();
        await image.waitFor();
        await page.waitForFunction(()=>document.querySelector('#hidi-edit img')?.dataset.photoReady==='true');await image.evaluate(image=>image.decode());
        assert.equal(await section.locator('#edit-title').textContent(),'For whereveryou go next.');
        assert.equal(await image.evaluate(image=>new URL(image.currentSrc||image.src).pathname),new URL(expected.url,base).pathname);
        assert.equal(await page.locator('#our-range .hidi-collection-card').count(),5);
        assert.equal(await page.locator('.meet-cinematic--photo .meet-cinematic__model').count(),1);
        const source=await image.getAttribute('src');
        for(const [label,path,action] of choices){
          const button=section.getByRole('button',{name:label,exact:true});await button.click();
          assert.equal(await button.getAttribute('aria-pressed'),'true');
          assert.equal(await section.locator('.next-chapter__choices [aria-pressed="true"]').count(),1);
          assert.equal(await section.getByRole('link',{name:action}).getAttribute('href'),path);
          assert.equal(await image.getAttribute('src'),source,'Choosing a chapter preserves the uploaded photograph');
        }
        const layout=await section.evaluate(section=>{
          const photo=section.querySelector('img').getBoundingClientRect(),copy=section.querySelector('.next-chapter__copy').getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth-innerWidth,photo:{left:photo.left,right:photo.right,top:photo.top,bottom:photo.bottom,width:photo.width,height:photo.height},copy:{left:copy.left,right:copy.right,top:copy.top,bottom:copy.bottom}};
        });
        assert(layout.overflow<=1,'No horizontal overflow');assert(layout.photo.width>0&&layout.photo.height>0);
        if(width<=700)assert(layout.photo.bottom<=layout.copy.top+1,'Mobile copy follows the photograph');
        else assert(layout.copy.right<=layout.photo.left+1,'Desktop copy stays outside the photograph');
        await image.scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>document.querySelector('#hidi-edit img')?.dataset.photoMotion==='playing');
        const motion=section.getByRole('button',{name:'Pause photo motion'});await motion.click();
        assert.equal(await image.getAttribute('data-photo-motion'),'paused');
        assert.equal(await image.evaluate(image=>getComputedStyle(image).animationPlayState),'paused');
        await section.getByRole('button',{name:'Resume photo motion'}).click();
        await image.scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>document.querySelector('#hidi-edit img')?.dataset.photoMotion==='playing');
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.waitForFunction(()=>document.querySelector('#hidi-edit img')?.dataset.photoMotion==='paused');
        assert.equal(await image.evaluate(image=>getComputedStyle(image).animationName),'none');
        await section.screenshot({path:`${output}/${engine}-${width}-chapter.png`});
        if(candidate&&width===390){
          custom=true;await page.reload({waitUntil:'domcontentloaded'});await section.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#hidi-edit img')?.dataset.photoReady==='true');await image.evaluate(image=>image.decode());
          const fit=await image.evaluate(image=>({fit:getComputedStyle(image).objectFit,position:getComputedStyle(image).objectPosition}));
          assert.equal(fit.fit,'contain');assert.equal(fit.position,'66% 50%');
          assert.equal(await image.getAttribute('data-photo-motion'),'paused');
          custom=false;failure=true;await page.reload({waitUntil:'domcontentloaded'});await section.scrollIntoViewIfNeeded();
          await section.getByRole('img',{name:'HIDI photograph unavailable'}).waitFor();assert.equal(await image.count(),0);
          assert(await section.getByRole('link',{name:'Explore casual wear'}).isVisible());
          failure=false;delay=true;await page.reload({waitUntil:'domcontentloaded'});assert.equal(await image.count(),0,'No stale bundled campaign during configuration loading');
          await section.scrollIntoViewIfNeeded();await image.waitFor();await page.waitForFunction(()=>document.querySelector('#hidi-edit img')?.dataset.photoReady==='true');await image.evaluate(image=>image.decode());
        }
        const blockingPageErrors=pageErrors.filter(message=>!message.startsWith('Minified React error #418;'));
        assert.deepEqual(blockingPageErrors,[]);assert.deepEqual(writes,[]);
        results.push({engine,width,passed:true,layout,careLayout,singleCareSection:true,correctSectionOrder:true,blockingPageErrors,threeCollectionLinks:true,currentPhotoPreserved:true,reducedMotion:true});
        console.log(`PASS ${candidate?'candidate':'live'} ${engine} ${width}: care order, compact spacing, responsive cards and retained photo choices/motion`);
      }catch(error){
        await page.screenshot({path:`${output}/${engine}-${width}-failure.png`,fullPage:true}).catch(()=>{});
        await writeFile(`${output}/${engine}-${width}-failure.json`,JSON.stringify({message:error.message,pageErrors,writes,url:page.url()},null,2));
        throw error;
      }finally{await context.close();}
    }}finally{await browser.close();}
  }
  const report={passed:true,careBreakOnly:true,singleCareSection:true,correctSectionOrder:true,threeCollectionLinks:true,currentPhotoPreserved:true,reducedMotion:true,mediaFailureRecovery:candidate,browserResults:results,blobWrites:0,databaseWrites:0};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
