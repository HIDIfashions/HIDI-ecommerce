(() => {
 const original=document.querySelector('script[data-hidi-queued-src]');if(!original)return;
 let started=false;
 const desktop=!matchMedia('(max-width: 700px)').matches;
 const start=()=>{
  if(started)return;started=true;
  const script=document.createElement('script');
  for(const attribute of original.attributes)if(!['type','data-hidi-queued-src'].includes(attribute.name))script.setAttribute(attribute.name,attribute.value);
  script.type='module';script.src=original.dataset.hidiQueuedSrc;
  if(!matchMedia('(max-width: 700px)').matches)script.fetchPriority='low';
  document.head.append(script);
 };
 if(desktop){
  const preload=document.querySelector('link[data-hidi-desktop-preload]');
  if(preload?.addEventListener){let released=false;const release=()=>{if(released)return;released=true;clearTimeout(fallback);start();};const fallback=setTimeout(release,1500);preload.addEventListener('load',release,{once:true});preload.addEventListener('error',release,{once:true});return;}
  start();return;
 }
 if(!document.querySelector('video[data-hidi-first-hero]')){start();return;}
 Promise.resolve(window.__HidiAvifSupport).then(()=>window.__HidiNativePosterReady).then(start,start);
 setTimeout(start,1200);
})();
