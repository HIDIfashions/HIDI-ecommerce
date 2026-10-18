window.__HidiFullCssReady=new Promise(resolve=>{
 let started=false;
 window.__HidiLoadFullCss=()=>{
  if(started)return;started=true;
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
   link.href=link.dataset.hidiFullHref;
   if(link.sheet)ready();
  }))).then(resolve);
 };
 const fallback=()=>{if(document.readyState!=='loading'&&!document.querySelector('video[data-hidi-first-hero]'))window.__HidiLoadFullCss();};
 document.addEventListener('readystatechange',fallback);fallback();
});
