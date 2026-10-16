(function(url){
 const hash=/poster-([a-f0-9]{16})\.avif$/.exec(url)?.[1];if(!hash)return;
 let started=false;
 const mark=()=>{try{
  const old=document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith('hidi_poster_cache='))?.slice('hidi_poster_cache='.length)||'';
  const values=[hash,...old.split('.').filter(value=>/^[a-f0-9]{16}$/.test(value)&&value!==hash)].slice(0,2);
  document.cookie='hidi_poster_cache='+values.join('.')+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
 }catch{}};
 const warm=()=>{
  if(started)return;started=true;
  if(navigator.connection?.saveData){mark();return;}
  fetch(url,{cache:'force-cache',credentials:'same-origin',keepalive:true,priority:'low'}).then(async response=>{
   if(!response.ok||!response.headers.get('content-type')?.startsWith('image/avif'))return;
   await response.arrayBuffer();mark();
  }).catch(()=>{});
 };
 // Let the initial clip buffer before optional work; interaction can warm sooner.
 const schedule=()=>setTimeout(warm,10000);
 if(document.readyState==='complete')schedule();else addEventListener('load',schedule,{once:true});
 addEventListener('pointerdown',warm,{once:true,passive:true});addEventListener('keydown',warm,{once:true});
})
