window.__HidiFullCssReady=new Promise(resolve=>{
 let started=false;
 window.__HidiLoadFullCss=()=>{
  if(started)return;started=true;
  // Full styles become render-critical after the actual native poster paints.
  // A timeout/decode callback is not paint evidence and keeps the Low hint.
  let paintedDesktop=false;
  try{
   const paint=window.__HidiNativePosterPaint,video=paint?.video;
   paintedDesktop=Boolean(!matchMedia('(max-width: 700px)').matches&&
    typeof PerformanceObserver==='function'&&PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')&&
    typeof document.body?.moveBefore==='function'&&document.visibilityState==='visible'&&
    !location.hash&&scrollY<=0&&performance.getEntriesByType('navigation')[0]?.type!=='back_forward'&&
    video?.isConnected&&video===document.querySelector('video[data-hidi-first-hero]')&&
    paint.poster===video.poster&&Number.isFinite(paint.renderTime)&&paint.renderTime>0&&paint.renderTime<=performance.now());
  }catch{}
  Promise.all([...document.querySelectorAll('link[data-hidi-deferred-style]')].map(link=>new Promise(done=>{
   let finished=false,recovered=false,timer;
   const ready=()=>{if(finished)return;finished=true;if(timer)clearTimeout(timer);link.media='all';done();};
   const recover=()=>{
    if(finished)return;
    if(recovered||!link.dataset.hidiOriginHref)return ready();
    recovered=true;if(timer)clearTimeout(timer);link.removeAttribute('integrity');link.removeAttribute('crossorigin');
    link.href=link.dataset.hidiOriginHref;
   };
   link.addEventListener('load',ready);
   link.addEventListener('error',recover);
   if(link.dataset.hidiOriginHref)timer=setTimeout(recover,1500);
   if(paintedDesktop)link.fetchPriority='high';
   link.href=link.dataset.hidiFullHref;
   if(link.sheet)ready();
  }))).then(resolve);
 };
 const fallback=()=>{if(document.readyState!=='loading'&&!document.querySelector('video[data-hidi-first-hero]'))window.__HidiLoadFullCss();};
 document.addEventListener('readystatechange',fallback);fallback();
});
