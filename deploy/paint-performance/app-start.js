(() => {
 const original=document.querySelector('script[data-hidi-queued-src]');if(!original)return;
 if(window.__HidiAppStarted||window.__HidiQueuePrimaryApp?.()===false)return;
 let started=false,fallback=null;
 const desktop=!matchMedia('(max-width: 700px)').matches;
 const start=()=>{
  if(started)return;started=true;
  if(fallback!==null){clearTimeout(fallback);fallback=null;}
  if(window.__HidiAppStarted||window.__HidiStartPrimaryApp?.()===false)return;
  const script=document.createElement('script');
  for(const attribute of original.attributes)if(!['type','data-hidi-queued-src'].includes(attribute.name))script.setAttribute(attribute.name,attribute.value);
  script.type='module';script.src=original.dataset.hidiQueuedSrc;
  if(!matchMedia('(max-width: 700px)').matches)script.fetchPriority='low';
  document.head.append(script);
 };
 if(desktop){
  const native=document.querySelector('video[data-hidi-first-hero]');
  const preload=document.querySelector('link[data-hidi-desktop-preload]');
  if(!native){if(preload?.addEventListener){let released=false;const release=()=>{if(released)return;released=true;start();};fallback=setTimeout(release,1500);preload.addEventListener('load',release,{once:true});preload.addEventListener('error',release,{once:true});return;}start();return;}
  let preloadReady=!preload?.addEventListener,posterReady=false;
  const release=()=>{if(preloadReady&&posterReady)start();};
  fallback=setTimeout(start,1500);
  if(!preloadReady){let released=false;const ready=()=>{if(released)return;released=true;preloadReady=true;release();};preload.addEventListener('load',ready,{once:true});preload.addEventListener('error',ready,{once:true});}
  Promise.resolve(window.__HidiAvifSupport).then(()=>window.__HidiNativePosterReady).then(()=>{
   const paint=window.__HidiNativePosterPaint;
   if(paint?.video===native&&native.isConnected&&native.matches?.('video[data-hidi-first-hero]')&&paint.poster===native.poster&&Number.isFinite(paint.renderTime)&&paint.renderTime>0){posterReady=true;release();}
  },()=>{});
  return;
 }
 if(!document.querySelector('video[data-hidi-first-hero]')){start();return;}
 Promise.resolve(window.__HidiAvifSupport).then(()=>window.__HidiNativePosterReady).then(start,start);
 setTimeout(start,1200);
})();
