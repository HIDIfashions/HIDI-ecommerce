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
        await section.scrollIntoViewIfNeeded();
        await image.waitFor();await image.evaluate(image=>image.decode());
        await page.waitForFunction(()=>document.querySelector('#hidi-edit img')?.dataset.photoReady==='true');
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
          custom=true;await page.reload({waitUntil:'domcontentloaded'});await section.scrollIntoViewIfNeeded();await image.evaluate(image=>image.decode());
          const fit=await image.evaluate(image=>({fit:getComputedStyle(image).objectFit,position:getComputedStyle(image).objectPosition}));
          assert.equal(fit.fit,'contain');assert.equal(fit.position,'66% 50%');
          assert.equal(await image.getAttribute('data-photo-motion'),'paused');
          custom=false;failure=true;await page.reload({waitUntil:'domcontentloaded'});await section.scrollIntoViewIfNeeded();
          await section.getByRole('img',{name:'HIDI photograph unavailable'}).waitFor();assert.equal(await image.count(),0);
          assert(await section.getByRole('link',{name:'Explore casual wear'}).isVisible());
          failure=false;delay=true;await page.reload({waitUntil:'domcontentloaded'});assert.equal(await image.count(),0,'No stale bundled campaign during configuration loading');
          await section.scrollIntoViewIfNeeded();await image.waitFor();await image.evaluate(image=>image.decode());
        }
        const blockingPageErrors=pageErrors.filter(message=>!message.startsWith('Minified React error #418;'));
        assert.deepEqual(blockingPageErrors,[]);assert.deepEqual(writes,[]);
        results.push({engine,width,passed:true,layout,blockingPageErrors,threeCollectionLinks:true,currentPhotoPreserved:true,reducedMotion:true});
        console.log(`PASS ${candidate?'candidate':'live'} ${engine} ${width}: photo, three choices, links, motion, reduced motion and responsive frame`);
      }catch(error){
        await page.screenshot({path:`${output}/${engine}-${width}-failure.png`,fullPage:true}).catch(()=>{});
        await writeFile(`${output}/${engine}-${width}-failure.json`,JSON.stringify({message:error.message,pageErrors,writes,url:page.url()},null,2));
        throw error;
      }finally{await context.close();}
    }}finally{await browser.close();}
  }
  const report={passed:true,campaignOnly:true,threeCollectionLinks:true,currentPhotoPreserved:true,reducedMotion:true,mediaFailureRecovery:candidate,browserResults:results,blobWrites:0,databaseWrites:0};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2));return report;
}
