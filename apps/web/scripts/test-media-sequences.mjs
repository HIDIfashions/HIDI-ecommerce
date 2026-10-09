import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href);
const base=process.env.HIDI_SEQUENCE_BASE_URL;
assert(base,'Test the built candidate container');
const output=resolve('validation/media-sequences');await mkdir(output,{recursive:true});
const photo=await readFile('public/assets/images/hero-landscape.webp');
const video=await readFile('public/assets/video/hidi-hero-mobile-luminous-v1.mp4');
const reports=[];
const imageUrl=id=>new URL('/assets/images/hero-landscape.webp?sequence='+id,base).href;
const videoUrl=id=>new URL('/__playlist__/video-'+id+'.mp4',base).href;
const delay=ms=>new Promise(done=>setTimeout(done,ms));
for(const engine of ['chromium','firefox','webkit']) {
  const browser=await pw[engine].launch({headless:true});
  try {
    for(const [width,height] of [[390,844],[844,390],[1440,900]]) {
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,reducedMotion:'no-preference'});
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      let signedIn=true,uploadCount=0,failedOnce=false;
      let heroAssets=[{id:'hero-existing',type:'image',url:imageUrl('hero-existing'),originalName:'Current hero.webp'}];
      let photoAssets=[{id:'ananya-existing',type:'image',url:imageUrl('ananya-existing'),originalName:'Current Ananya.webp'}];
      const item=asset=>({...asset,assetId:asset.id,desktopPosition:'58% 38%',mobilePosition:'66% 50%',fitMode:'cover'});
      let heroCurrent={active:true,source:'uploaded',...item(heroAssets[0])};
      let landingCurrent={slots:{'ananya-green':{active:true,...item(photoAssets[0])}},ananya:null};
      let heroPrevious=null,ananyaPrevious=null;const publishBodies=[];const uploads=[];
      const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.origin!==new URL(base).origin)return route.abort();
        if(url.pathname.startsWith('/__playlist__/')) {
          const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers().range||'');
          if(range){const start=Number(range[1]),end=Math.min(video.length-1,range[2]?Number(range[2]):video.length-1);return route.fulfill({status:206,contentType:'video/mp4',headers:{'Content-Range':'bytes '+start+'-'+end+'/'+video.length,'Accept-Ranges':'bytes'},body:video.subarray(start,end+1)});}
          return route.fulfill({contentType:'video/mp4',body:video});
        }
        if(!url.pathname.startsWith('/api/'))return route.continue();
        const path=url.pathname;
        if(path==='/api/admin/session')return json(route,{ok:signedIn},signedIn?200:401);
        if(path==='/api/hidi/hero-config')return json(route,heroCurrent);
        if(path==='/api/hidi/landing-media-config')return json(route,landingCurrent);
        if(path.endsWith('library'))return json(route,path.includes('/hero-')?{assets:heroAssets,current:heroCurrent,previous:heroPrevious}:{assets:photoAssets,current:landingCurrent,previous:{ananya:ananyaPrevious}});
        if(path.endsWith('upload')) {
          assert.equal(req.method(),'POST');const name=decodeURIComponent(req.headers()['x-hidi-filename']);
          if(name==='retry.webp'&&!failedOnce){failedOnce=true;return json(route,{message:'Fixture retry required'},503);}
          const hero=path.includes('/hero-'),type=req.headers()['content-type'].startsWith('video/')?'video':'image';
          const asset={id:'upload-'+(++uploadCount),type,url:type==='video'?videoUrl(uploadCount):imageUrl(uploadCount),originalName:name,sizeBytes:req.postDataBuffer()?.length||0};
          if(hero)heroAssets.unshift(asset);else photoAssets.unshift(asset);uploads.push(asset);return json(route,{asset},201);
        }
        if(req.method()==='POST' && (path==='/api/hidi/hero-publish'||path==='/api/hidi/landing-media-ananya-publish')) {
          const body=req.postDataJSON();publishBodies.push({path,body});assert(body.items.length>=1&&body.items.length<=20);
          const library=path.includes('/hero-')?heroAssets:photoAssets;
          const items=body.items.map(value=>({...library.find(asset=>asset.id===value.assetId),...value}));
          assert(items.every(value=>value.url));const current={active:true,source:'uploaded',...items[0],items,autoPlay:body.autoPlay,intervalSeconds:body.intervalSeconds};
          if(path.includes('/hero-')){heroPrevious=heroCurrent;heroCurrent=current;}else{ananyaPrevious=landingCurrent.ananya||{active:true,...item(photoAssets[0]),items:[item(photoAssets[0])]};landingCurrent.ananya=current;}
          return json(route,{current});
        }
        if(path.endsWith('reset')){const hero=path.includes('/hero-');if(hero){heroPrevious=heroCurrent;heroCurrent={active:false,source:'bundled'};}else{ananyaPrevious=landingCurrent.ananya;landingCurrent.ananya={active:false,items:[]};}return json(route,{current:hero?heroCurrent:landingCurrent.ananya});}
        if(path.endsWith('restore')){const hero=path.includes('/hero-');if(hero){[heroCurrent,heroPrevious]=[heroPrevious,heroCurrent];}else{[landingCurrent.ananya,ananyaPrevious]=[ananyaPrevious,landingCurrent.ananya];}return json(route,{current:hero?heroCurrent:landingCurrent.ananya});}
        return json(route,{version:1,slots:{},items:[],products:[]});
      });
      try {
        await page.goto(base+'/admin/landing-media?section=ananya');
        await page.locator('#workspace').waitFor({state:'visible'});
        assert.equal(await page.locator('#file').getAttribute('multiple'),'');
        assert.equal(await page.locator('.sequence-item').count(),1,'Current uploaded photo remains first');
        await page.locator('#file').setInputFiles([1,2,3,4,5].map(i=>({name:'Ananya '+i+'.webp',mimeType:'image/webp',buffer:photo})));
        await page.getByRole('button',{name:'Upload 5 files',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.sequence-item').length===6 && document.querySelector('#workspace').getAttribute('aria-busy')==='false');
        assert.equal(uploads.length,5,'Every selected file is uploaded once');
        await page.getByRole('button',{name:'Move item 6 up',exact:true}).click();
        await page.getByRole('button',{name:'Remove item 2',exact:true}).click();
        assert.equal(await page.locator('.sequence-item').count(),5);
        await page.locator('.sequence-name').nth(2).click();
        await page.locator('#desktopPos').selectOption('50% 22%');await page.locator('#mobilePos').selectOption('66% 50%');
        await page.locator('#fitMode').selectOption('contain');await page.locator('#altText').fill('Full outfit detail');
        await page.locator('#autoPlay').check();await page.locator('#intervalSeconds').selectOption('3');
        await page.getByRole('button',{name:'Publish media list',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#message').textContent.startsWith('Published.'));
        const ananyaBody=publishBodies.at(-1).body;
        assert.equal(ananyaBody.items.length,5);assert.equal(ananyaBody.items[0].assetId,'ananya-existing');
        assert.equal(ananyaBody.items[2].altText,'Full outfit detail');assert.equal(ananyaBody.items[2].desktopPosition,'50% 22%');
        assert.equal(ananyaBody.items[3].assetId,'upload-5');assert.equal(ananyaBody.items[4].assetId,'upload-4');
        await page.reload();await page.locator('#workspace').waitFor({state:'visible'});assert.equal(await page.locator('.sequence-item').count(),5);
        assert(await page.locator('#autoPlay').isChecked());assert.equal(await page.locator('#intervalSeconds').inputValue(),'3');
        await page.getByRole('button',{name:/Homepage hero media/}).click();
        await page.locator('#file').setInputFiles([{name:'Hero 2.mp4',mimeType:'video/mp4',buffer:video},{name:'Hero 3.webp',mimeType:'image/webp',buffer:photo},{name:'Hero 4.mp4',mimeType:'video/mp4',buffer:video}]);
        await page.getByRole('button',{name:'Upload 3 files',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.sequence-item').length===4&&document.querySelector('#workspace').getAttribute('aria-busy')==='false');
        await page.locator('#autoPlay').uncheck();
        await page.getByRole('button',{name:'Publish media list',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#message').textContent.startsWith('Published.'));
        assert.deepEqual(heroCurrent.items.map(value=>value.type),['image','video','image','video']);
        assert.equal(heroCurrent.items[0].assetId,'hero-existing');
        await page.getByRole('button',{name:'Use built-in media',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.sequence-item').length===0);
        await page.getByRole('button',{name:'Restore previous',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.sequence-item').length===4);
        await page.getByRole('button',{name:/Ananya's Pick photos/}).click();assert.equal(await page.locator('.sequence-item').count(),5);
        if(width===1440) await page.screenshot({path:resolve(output,engine+'-admin-photo-list.png'),animations:'disabled'});
        await page.goto(base+'/');
        await page.waitForFunction(()=>document.querySelector('.hero-media')?.dataset.frameReady==='true');
        assert.equal(await page.locator('.hero .media-sequence-dots button').count(),4);
        await page.getByRole('button',{name:'Next hero media',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.hero-media').dataset.mediaIndex==='1'&&document.querySelector('.hero-media').dataset.frameReady==='true');
        assert.equal(await page.locator('video.hero-live-media').count(),1);
        assert.equal(await page.locator('video.hero-live-media').getAttribute('loop'),null,'Playlist videos advance rather than loop forever');
        await page.getByRole('button',{name:'Start hero media rotation',exact:true}).click();
        await page.locator('.site-header a').first().focus();await page.mouse.move(0,0);
        await page.waitForFunction(()=>{const video=document.querySelector('video.hero-live-media');return video&&!video.paused&&video.duration>0;});
        await page.locator('video.hero-live-media').evaluate(video=>{video.currentTime=Math.max(0,video.duration-.15);});
        await page.waitForFunction(()=>document.querySelector('.hero-media').dataset.mediaIndex==='2');
        await page.getByRole('button',{name:'Show hero media 1',exact:true}).click();
        await page.getByRole('button',{name:'Show hero media 1',exact:true}).press('ArrowRight');
        await page.waitForFunction(()=>document.querySelector('.hero-media').dataset.mediaIndex==='1');
        await page.locator('.meet-cinematic').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.locator('.site-header a').first().focus();
        await page.waitForFunction(()=>document.querySelector('.meet-cinematic__model')?.dataset.mediaIndex==='1',null,{timeout:8000});
        await page.getByRole('button',{name:'Next Ananya photo',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.meet-cinematic__model')?.dataset.mediaIndex==='2');
        await page.getByRole('button',{name:'Show Ananya photo 1',exact:true}).click();
        await page.locator('.site-header a').first().focus();await page.mouse.move(0,0);await delay(3400);
        assert.equal(await page.locator('.meet-cinematic__model').getAttribute('data-media-index'),'0','Manual browsing pauses automatic rotation');
        const geometry=await page.evaluate(()=>{const hero=document.querySelector('.hero').getBoundingClientRect(),heading=document.querySelector('.ananya-section-heading').getBoundingClientRect(),canvas=document.querySelector('.meet-cinematic').getBoundingClientRect();return {heroBottom:hero.bottom,headingTop:heading.top,headingBottom:heading.bottom,photoTop:canvas.top,width:document.documentElement.scrollWidth};});
        assert(geometry.headingTop>=geometry.heroBottom-1&&geometry.headingBottom<=geometry.photoTop+1);
        assert(geometry.width<=width+1);assert.equal(await page.locator('.meet-cinematic__scroll,.meet-cinematic__count,.meet-cinematic__label,.meet-cinematic__ghost').count(),0);
        assert.equal(await page.locator('.meet-cinematic__model').count(),1,'One full-page photo at a time');
        if(width===1440)await page.screenshot({path:resolve(output,engine+'-photo-carousel.png'),animations:'disabled'});
        await page.locator('.site-footer').scrollIntoViewIfNeeded();assert(await page.locator('.site-footer').isVisible());
        // A partial upload can be retried without uploading completed files again.
        await page.goto(base+'/admin/landing-media?section=ananya');await page.locator('#workspace').waitFor({state:'visible'});
        await page.locator('#file').setInputFiles([{name:'saved.webp',mimeType:'image/webp',buffer:photo},{name:'retry.webp',mimeType:'image/webp',buffer:photo}]);
        await page.getByRole('button',{name:'Upload 2 files',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('#message').textContent==='Fixture retry required'&&document.querySelector('#workspace').getAttribute('aria-busy')==='false');
        assert.equal(await page.locator('.sequence-item').count(),6);await page.getByRole('button',{name:'Upload to library',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.sequence-item').length===7&&document.querySelector('#workspace').getAttribute('aria-busy')==='false');
        assert.equal(uploads.filter(asset=>asset.originalName==='saved.webp').length,1);assert.equal(uploads.filter(asset=>asset.originalName==='retry.webp').length,1);
        assert.equal(landingCurrent.ananya.items.length,5,'Uploading a draft never publishes automatically');
        signedIn=false;await page.reload();await page.locator('#signin').waitFor({state:'visible'});assert(await page.locator('#workspace').isHidden());
        assert.deepEqual(errors,[]);reports.push({engine,width,height,result:'passed',photoItems:5,heroItems:4});
        console.log('PASS '+engine+' '+width+'x'+height+': multi-upload, ordering, crops, restore, mixed hero videos/images, rotation, keyboard, normal scrolling and admin boundaries');
      }catch(error){await page.screenshot({path:resolve(output,engine+'-'+width+'-failure.png'),animations:'disabled'});await writeFile(resolve(output,'partial-report.json'),JSON.stringify(reports,null,2));console.error('MEDIA SEQUENCE FAILURE '+engine+' '+width+': '+error.stack);throw error;}
      finally{await context.close();}
    }
  }finally{await browser.close();}
}
await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));console.log('PASS '+reports.length+' complete media-list browser cases');
