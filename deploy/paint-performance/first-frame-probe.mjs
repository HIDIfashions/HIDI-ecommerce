import assert from 'node:assert/strict';

// Install before navigation. Observe browser frame opportunities independently
// of the application loader, poster-ready promises or performance success flags.
export async function observeFirstFrames(page){
 await page.addInitScript(()=>{
  const key='__HidiFirstFrameProbe';
  if(window[key])return;
  const report={version:1,method:'requestAnimationFrame DOM/computed-style observations; frame opportunities, not compositor screenshots',sampledFrames:0,contentFrames:0,nativeHeroFrames:0,validGeometryFrames:0,emptyLoadingFrames:0,frames:[],violations:[],overflow:false};
  let stopped=false,frameId,lastSignature='',lastStoredAt=-Infinity;
  const violations=new Map();
  const inspect=element=>{
   if(!element)return null;
   const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
   let concealed=false;
   for(let node=element;node;node=node.parentElement){
    const s=getComputedStyle(node);
    if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)<=.01||s.contentVisibility==='hidden')concealed=true;
   }
   const geometry=rect.width>0&&rect.height>0;
   return {tag:element.tagName,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,bottom:rect.bottom},style:{display:style.display,visibility:style.visibility,opacity:style.opacity,position:style.position,transform:style.transform,color:style.color,backgroundColor:style.backgroundColor,objectFit:style.objectFit,objectPosition:style.objectPosition},concealed,geometry,inViewport:geometry&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight,visible:geometry&&!concealed};
  };
  const note=(code,at)=>{
   const previous=violations.get(code);
   if(previous){previous.lastAt=at;previous.frames++;return;}
   const item={code,firstAt:at,lastAt:at,frames:1};violations.set(code,item);report.violations.push(item);
  };
  const sample=at=>{
   if(stopped)return;
   report.sampledFrames++;
   const headerElement=document.querySelector('header[data-hidi-first-header],header.site-header,#site-header');
   const heroElement=document.querySelector('section.hero');
   const videoElement=heroElement?.querySelector('video');
   const discoveryElement=document.querySelector('[data-hidi-home-discovery]');
   const nativeElement=document.querySelector('video[data-hidi-first-hero]');
   const body=inspect(document.body),root=inspect(document.querySelector('#root')),header=inspect(headerElement),hero=inspect(heroElement),video=inspect(videoElement),discovery=inspect(discoveryElement);
   const content=Boolean(heroElement||discoveryElement||(document.body&&document.readyState!=='loading'));
   if(!content){report.emptyLoadingFrames++;}
   else{
    report.contentFrames++;
    const native=Boolean(nativeElement&&heroElement?.contains(nativeElement)&&video?.visible&&video.inViewport);
    if(native){report.nativeHeroFrames++;report.firstNativeFrameAt??=at;}
    const geometry=Boolean(header?.visible&&header.inViewport&&hero?.visible&&hero.inViewport&&video?.visible&&video.inViewport);
    if(geometry)report.validGeometryFrames++;
    if(body?.concealed||root?.concealed)note('page-concealed',at);
    if(!header?.visible||!header.inViewport)note('header-missing-or-zero-geometry',at);
    if(!hero?.visible||!hero.inViewport||!video?.visible||!video.inViewport)note('hero-missing-or-zero-geometry',at);
    if(discovery){
     if(!discovery.visible)note('discovery-concealed-or-zero-geometry',at);
     if(discovery.visible&&discovery.inViewport&&(!hero?.visible||!video?.visible))note('text-only-discovery-frame',at);
     if(!hero?.geometry||discovery.rect.y<hero.rect.bottom-1)note('discovery-before-hero-end',at);
    }
    const poster=videoElement?.getAttribute('poster');
    const posterReference=poster?.startsWith('data:')?poster.slice(0,poster.indexOf(','))+'[length='+poster.length+']':poster;
    const frame={at,readyState:document.readyState,viewport:{width:innerWidth,height:innerHeight},body,root,header,hero,video,discovery,discoveryText:discoveryElement?.textContent.trim().slice(0,240)||null,nativeHero:native,videoState:videoElement?{poster:posterReference,readyState:videoElement.readyState,videoWidth:videoElement.videoWidth}:null};
    const signature=JSON.stringify({...frame,at:0});
    // Check every rAF, but retain transitions and periodic evidence to bound JSON.
    if(signature!==lastSignature||at-lastStoredAt>=500){
     if(report.frames.length<256)report.frames.push(frame);else report.overflow=true;
     lastStoredAt=at;lastSignature=signature;
    }
   }
   if(report.sampledFrames>=3600){report.overflow=true;stopped=true;return;}
   frameId=requestAnimationFrame(sample);
  };
  window[key]={finish:()=>{
   stopped=true;cancelAnimationFrame(frameId);
   report.finishedAt=performance.now();
   report.paintTimings=performance.getEntriesByType('paint').map(({name,startTime})=>({name,startTime}));
   return report;
  }};
  frameId=requestAnimationFrame(sample);
 });
}

export async function finishFirstFrames(page){
 return page.evaluate(async()=>{
  if(!window.__HidiFirstFrameProbe)return null;
  // Finish at actual browser frame opportunities, never synthesize an early
  // success snapshot after the application's ready event.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return window.__HidiFirstFrameProbe.finish();
 });
}

export function assertFirstFrames(report,label='homepage'){
 assert(report&&report.version===1,label+': first-frame observer was not installed before navigation');
 assert(report.sampledFrames>0&&report.contentFrames>0,label+': no content frame opportunities were observed');
 assert(!report.overflow,label+': first-frame evidence limit exceeded');
 assert(report.nativeHeroFrames>0,label+': no visible native first-HTML hero was observed');
 assert(report.validGeometryFrames>0,label+': no nonzero visible header/hero/video frame was observed');
 assert.deepEqual(report.violations,[],label+': first-frame violations '+(report.violations||[]).map(item=>item.code+' at '+item.firstAt.toFixed(1)+'ms').join(', '));
 return report;
}
