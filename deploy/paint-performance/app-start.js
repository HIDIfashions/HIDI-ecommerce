(() => {
 const original=document.querySelector('script[data-hidi-queued-src]');if(!original)return;
 let started=false;
 const start=()=>{
  if(started)return;started=true;
  const script=document.createElement('script');
  for(const attribute of original.attributes)if(!['type','data-hidi-queued-src'].includes(attribute.name))script.setAttribute(attribute.name,attribute.value);
  script.type='module';script.src=original.dataset.hidiQueuedSrc;document.head.append(script);
 };
 if(!matchMedia('(max-width: 700px)').matches||!document.querySelector('video[data-hidi-first-hero]')){start();return;}
 Promise.resolve(window.__HidiAvifSupport).then(()=>window.__HidiNativePosterReady).then(start,start);
 setTimeout(start,1200);
})();
