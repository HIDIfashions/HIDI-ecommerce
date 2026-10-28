(() => {
  let pending=false;
  const scope=()=>/^\/admin(?:\/|$)/.test(location.pathname)?'admin':'storefront';
  function mark(){document.documentElement.dataset.hidiTypeScope=scope();}
  async function refresh(){
    mark();if(pending||document.hidden)return;pending=true;
    try{
      const response=await fetch('/api/hidi/typography',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;const data=await response.json();
      if(data.stale||!Number.isSafeInteger(data.revision))return;
      const current=document.getElementById('hidi-published-typography');if(!current)return;
      const applied=Number(getComputedStyle(document.documentElement).getPropertyValue('--hidi-typography-revision').trim()||-1);
      if(applied===data.revision)return;
      const next=document.createElement('link');next.rel='stylesheet';next.href='/typography/published.css?revision='+data.revision;
      await new Promise(resolve=>{const timer=setTimeout(()=>{next.remove();resolve();},10000);next.onload=()=>{clearTimeout(timer);current.remove();next.id='hidi-published-typography';resolve();};next.onerror=()=>{clearTimeout(timer);next.remove();resolve();};current.after(next);});
    }catch{/* Retain the already-applied stylesheet during transient failures. */}
    finally{pending=false;}
  }
  mark();window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);window.addEventListener('popstate',refresh);
  window.addEventListener('hidi:typography-published',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(...args){const result=original.apply(this,args);mark();queueMicrotask(refresh);return result;};}
  setInterval(refresh,30000);
})();
