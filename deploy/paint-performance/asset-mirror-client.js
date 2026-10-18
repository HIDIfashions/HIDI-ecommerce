(() => {
 const mirror=__HIDI_ASSET_MIRROR__,failed=new Set(),watched=new Set(),chosen=new Map();
 const supported=path=>Object.hasOwn(mirror.files,path);
 const assetOrigin=path=>mirror.edgeOrigin&&Object.hasOwn(mirror.edgeFiles||{},path)?mirror.edgeOrigin:mirror.origin;
 window.__HidiAssetUrl=path=>supported(path)&&!failed.has(path)?assetOrigin(path)+path:path;
 window.__HidiMirrorPoster=path=>{
  const mobile=typeof matchMedia==='function'&&matchMedia('(max-width: 700px)').matches;
  const origin=supported(path)&&(mobile?mirror.originPosters?.includes(path):mirror.desktopOriginPosters?.includes(path));
  const primary=supported(path)&&mobile&&mirror.inlinePosters?.[path]?mirror.inlinePosters[path]:origin?path:window.__HidiAssetUrl(path);
  const url=chosen.get(path)||primary;
  if(!supported(path)||watched.has(path))return url;
  watched.add(path);chosen.set(path,url);
  const watch=(current,recover)=>{
   const image=new Image();let timer,done=false;
   const ready=()=>{if(done)return;done=true;clearTimeout(timer);};
   const fallback=()=>{
    if(done)return;done=true;clearTimeout(timer);
    if(!recover)return;
    const next=current===path?assetOrigin(path)+path:path;
    if(current!==path)failed.add(path);
    chosen.set(path,next);
    for(const video of document.querySelectorAll('video'))if(video.poster===current||video.getAttribute?.('poster')===current)video.poster=next;
    watch(next,false);
   };
   image.onload=ready;image.onerror=fallback;
   timer=setTimeout(()=>image.complete&&image.naturalWidth>0?ready():fallback(),1500);image.src=current;
  };
  watch(url,true);return url;
 };
 window.__HidiMirrorVideoFallback=(video,path)=>{
  if(!supported(path)||video.currentSrc!==assetOrigin(path)+path&&video.src!==assetOrigin(path)+path)return false;
  failed.add(path);video.src=path;video.load();
  if(video.autoplay)video.play().catch(()=>{});
  return true;
 };
 let fallbackStarted=false,waitingForParser=false;
 window.__HidiAppFallback=()=>{
  if(fallbackStarted||window.__HidiAppStarted)return;
  if(document.readyState==='loading'){
   if(!waitingForParser){
    waitingForParser=true;
    const ready=()=>{if(document.readyState==='loading')return;document.removeEventListener('readystatechange',ready);window.__HidiAppFallback();};
    document.addEventListener('readystatechange',ready);
   }
   return;
  }
  const original=document.querySelector('script[data-hidi-mirror-app]');
  if(!original)return;
  fallbackStarted=true;
  const script=document.createElement('script');script.type='module';script.crossOrigin='anonymous';script.integrity=original.integrity;script.src=original.dataset.hidiMirrorApp;document.head.append(script);
 };
 setTimeout(window.__HidiAppFallback,1500);
})();
