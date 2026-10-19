// Keep visible content immediate. Off-screen sections follow the first hero paint.
function HidiBelowFoldPaint({children}) {
 const [ready,setReady]=HidiHeroReact.useState(false);
 const boundary=HidiHeroReact.useRef(null);
 HidiHeroReact.useLayoutEffect(()=>{
  const back=window.performance?.getEntriesByType?.('navigation')?.[0]?.type==='back_forward';
  if(!boundary.current||boundary.current.getBoundingClientRect().top<=window.innerHeight+1||document.visibilityState==='hidden'||(window.scrollY||0)>0||window.location.hash||back||typeof requestAnimationFrame!=='function'){
   setReady(true);return;
  }
  let active=true,first,next,timer;
  const finish=()=>{if(!active)return;active=false;clearTimeout(timer);window.removeEventListener?.('scroll',finish);setReady(true);};
  first=requestAnimationFrame(()=>{if(active)next=requestAnimationFrame(finish);});
  timer=setTimeout(finish,100);
  window.addEventListener?.('scroll',finish,{once:true,passive:true});
  return ()=>{active=false;cancelAnimationFrame(first);if(next)cancelAnimationFrame(next);clearTimeout(timer);window.removeEventListener?.('scroll',finish);};
 },[]);
 return ready?children:HidiHeroReact.createElement('span',{ref:boundary,'aria-hidden':true,'data-hidi-paint-boundary':true,style:{display:'block',width:0,height:0,margin:0,padding:0,border:0}});
}
