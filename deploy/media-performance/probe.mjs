import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {get} from 'node:http';import {get as getHttps} from 'node:https';import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {existsSync} from 'node:fs';
const [base,mode='live']=process.argv.slice(2),OUT='evidence/media-performance';await mkdir(OUT+'/'+mode,{recursive:true});
const pw=await import(pathToFileURL(process.env.HIDI_PLAYWRIGHT_MODULE).href),manifest=JSON.parse(await readFile(OUT+'/manifest.json','utf8'));
const baseline=mode==='baseline',rows=[];
const request=(path,headers={})=>new Promise((resolve,reject)=>{const u=new URL(path,base);(u.protocol==='https:'?getHttps:get)(u,{headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject);});
if(!baseline){
 const report=JSON.parse(await readFile(OUT+'/patch.json','utf8'));
 for(const path of ['/'+report.bundle,'/assets/index-yOknTVcM.css','/api/store/products']){
  const plain=await request(path,{'accept-encoding':'identity'});assert.equal(plain.status,200);
  for(const encoding of ['br','gzip']){const r=await request(path,{'accept-encoding':encoding});assert.equal(r.status,200);assert.equal(r.headers['content-encoding'],encoding,path);assert.match(r.headers.vary,/Accept-Encoding/i);const decoded=encoding==='br'?brotliDecompressSync(r.body):gunzipSync(r.body);if(mode==='live'&&path.startsWith('/api/'))assert(Array.isArray(JSON.parse(decoded)));else assert.deepEqual(decoded,plain.body);assert(r.body.length<plain.body.length*.7,path+' should compress');}
  if(path.startsWith('/api/'))assert.match(plain.headers['cache-control'],/no-store/);
 }
 for(const item of Object.values(manifest.videos))for(const variant of [item.mobile,item.desktop]){
  const r=await request(variant.url,{range:'bytes=0-63'});assert.equal(r.status,206);assert.equal(r.body.length,64);assert.match(r.headers['cache-control'],/immutable/);assert(!r.headers['content-encoding']);
  const suffix=await request(variant.url,{range:'bytes=-64'});assert.equal(suffix.status,206);assert.equal(suffix.body.length,64);
 }
}
for(const engine of baseline?['chromium']:['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{})});
 try{for(const width of engine==='chromium'?[320,390,768,1440]:[390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,reducedMotion:engine==='chromium'?'no-preference':'reduce'}),page=await context.newPage();page.setDefaultTimeout(45000);
  const errors=[],network=[],media=[];let transferred=0;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{network.push(r.url());if(r.resourceType()==='media')media.push(r.url());});
  if(engine==='chromium'){const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');cdp.on('Network.loadingFinished',e=>transferred+=e.encodedDataLength);}
  await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==new URL(base).origin||!['GET','HEAD'].includes(r.method()))return route.abort();return route.continue();});
  await page.addInitScript(()=>{window.__lcp=0;window.__cls=0;try{new PerformanceObserver(l=>window.__lcp=l.getEntries().at(-1).startTime).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__cls+=e.value;})).observe({type:'layout-shift',buffered:true});}catch{}});
  try{
   assert.equal((await page.goto(base+'/',{waitUntil:'domcontentloaded'})).status(),200);
   await page.waitForFunction(()=>document.querySelector('.hero-media')?.dataset.heroConfigStatus==='uploaded');
   const video=page.locator('video.hero-live-media');await video.waitFor({state:'attached'});
   if(engine==='chromium')await page.waitForFunction(()=>{const v=document.querySelector('video.hero-live-media');return v?.readyState>=2&&v.videoWidth>0;});
   else await page.waitForFunction(()=>!!document.querySelector('video.hero-live-media')?.poster);
   await page.waitForTimeout(2500);
   const initial=await page.evaluate(()=>({lcp:window.__lcp,cls:window.__cls,video:{src:document.querySelector('video.hero-live-media').currentSrc,poster:document.querySelector('video.hero-live-media').poster,width:document.querySelector('video.hero-live-media').videoWidth},overflow:document.documentElement.scrollWidth>innerWidth+1}));
   const initialBytes=transferred,initialRequests=[...network];assert(!initial.overflow);
   if(!baseline){assert(initial.video.poster.includes('/media-performance/assets/'));if(engine==='chromium'){assert(initial.video.src.includes('/media-performance/assets/'));assert.equal(initial.video.width,width<=700?1280:1920);assert(initialBytes<(width<=700?7:11)*1024*1024,'Initial transfer budget');}assert(!media.some(u=>u.includes('/api/hidi/hero-asset/')),'Original video should not be downloaded');}
   const sound=page.getByRole('button',{name:'Turn video sound on'});await sound.waitFor();
   if(engine==='chromium'){
    await sound.click();await page.waitForFunction(()=>!document.querySelector('video.hero-live-media').muted);await page.getByRole('button',{name:'Mute video sound'}).click();await page.waitForFunction(()=>document.querySelector('video.hero-live-media').muted);
   }
   await page.addStyleTag({content:'*,*::before,*::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; }'});
   const height=await page.evaluate(()=>document.documentElement.scrollHeight);
   for(let y=0;y<height;y+=600){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(250);await page.waitForFunction(()=>[...document.querySelectorAll('main img')].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;}).every(i=>i.complete&&i.naturalWidth>1&&!i.currentSrc.startsWith('data:')));}
   await page.waitForTimeout(1500);await page.evaluate(()=>scrollTo(0,0));
   if(engine==='chromium')await video.evaluate(async v=>{v.pause();v.currentTime=1;await new Promise(done=>{if(v.readyState>=2)setTimeout(done,200);else v.addEventListener('seeked',done,{once:true});});});
   const geometry=await page.evaluate(()=>[...document.querySelectorAll('#site-header, main > section, .hero-sound-toggle, .campaign-shop-button, .hidi-collection-card, footer')].map((el,index)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{index,tag:el.tagName,id:el.id,cls:el.className,x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontFamily,color:s.color,background:s.backgroundColor};}));
   const photos=await page.locator('main img').evaluateAll(imgs=>imgs.filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.right>0&&r.left<innerWidth;}).map(i=>({original:i.dataset.hidiOriginalSrc||i.src,src:i.currentSrc,loaded:i.complete&&i.naturalWidth>1,fit:getComputedStyle(i).objectFit,position:getComputedStyle(i).objectPosition})));
   assert(photos.every(i=>i.loaded),'All homepage photographs must decode after scrolling');assert.deepEqual(errors,[]);
   await page.screenshot({path:OUT+'/'+mode+'/'+engine+'-'+width+'.png',fullPage:true});rows.push({engine,width,passed:true,initialBytes,initialRequests,initial,geometry,photos});
  }catch(error){await page.screenshot({path:OUT+'/'+mode+'/'+engine+'-'+width+'-failure.png',fullPage:true}).catch(()=>{});await writeFile(OUT+'/'+mode+'/'+engine+'-'+width+'-failure.json',JSON.stringify({error:String(error),errors,media,hero:await page.locator('.hero-media').evaluate(el=>el.outerHTML).catch(()=>null)}));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
if(!baseline&&mode==='candidate'){
 const before=JSON.parse(await readFile(OUT+'/baseline.json','utf8'));
 for(const row of rows.filter(r=>r.engine==='chromium')){
  const original=before.results.find(r=>r.width===row.width);assert(row.initialBytes<original.initialBytes*.5,'At least 50% lower transfer for '+row.width);
  assert.equal(row.geometry.length,original.geometry.length);for(let i=0;i<row.geometry.length;i++){const a=original.geometry[i],b=row.geometry[i];for(const key of ['x','y','width','height'])assert(Math.abs(a[key]-b[key])<=1.5,'Layout changed: '+key+' '+a.cls+' at '+row.width);for(const key of ['font','color','background'])assert.equal(a[key],b[key],a.cls+' '+key);}
 }
 await writeFile(OUT+'/visual-comparison.json',JSON.stringify({passed:true,widths:[320,390,768,1440],unchanged:'section geometry, typography, colours, CSS, button positions and selected uploads'}));
}
await writeFile(OUT+'/'+mode+'.json',JSON.stringify({passed:true,results:rows},null,2));
console.log('PASS: '+mode+' homepage, poster, responsive photographs, sound controls, media ranges, compression and layout; '+rows.length+' browser/viewport cases');
