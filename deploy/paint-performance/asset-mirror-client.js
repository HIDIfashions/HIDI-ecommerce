(() => {
 const mirror=__HIDI_ASSET_MIRROR__,failed=new Set(),watched=new Set();
 const supported=path=>Object.hasOwn(mirror.files,path);
 window.__HidiAssetUrl=path=>supported(path)&&!failed.has(path)?mirror.origin+path:path;
 window.__HidiMirrorPoster=path=>{
  const url=window.__HidiAssetUrl(path);
  if(url===path||watched.has(path))return url;
  watched.add(path);
  const image=new Image();let timer,done=false;
  const fallback=()=>{
   if(done)return;done=true;clearTimeout(timer);failed.add(path);
   for(const video of document.querySelectorAll('video'))if(video.poster===url)video.poster=path;
  };
  const ready=()=>{if(done)return;done=true;clearTimeout(timer);};
  image.onload=ready;
  image.onerror=fallback;
  // Retain the detached image until settlement, including cached completions
  // where a browser may have already queued its load event.
  timer=setTimeout(()=>image.complete&&image.naturalWidth>0?ready():fallback(),1500);image.src=url;
  return url;
 };
 window.__HidiMirrorVideoFallback=(video,path)=>{
  if(!supported(path)||video.currentSrc!==mirror.origin+path&&video.src!==mirror.origin+path)return false;
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
