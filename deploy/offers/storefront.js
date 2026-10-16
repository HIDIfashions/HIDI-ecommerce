(() => {
  if(location.pathname!=='/')return;
  const KEY='hidi_supabase_session';let generation=0,version=null,current=null,observer=null,expiry=null;
  function token(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return typeof s?.access_token==='string'&&s.expires_at>Date.now()/1000?s.access_token:null;}catch{return null;}}
  function remove(){clearTimeout(expiry);document.querySelector('[data-hidi-offer-strip]')?.remove();current=null;version=null;observer?.disconnect();observer=null;}
  function place(){
    if(!current||document.querySelector('[data-hidi-offer-strip]'))return;
    const hero=document.querySelector('section.hero--campaign,section.hero[aria-labelledby="hero-title"]');if(!hero)return;
    const section=document.createElement('section');section.dataset.hidiOfferStrip='true';section.setAttribute('aria-label','HIDI offers');
    const benefits=document.createElement('div');benefits.className='hidi-offers-benefits';
    for(const [name,text]of [['primary',current.primary],['secondary',current.secondary]]){const span=document.createElement('span');span.className='hidi-offers-'+name;span.textContent=text;benefits.append(span);}
    const note=document.createElement('div');note.className='hidi-offers-note';const line=document.createElement('span');line.textContent='One offer per order';
    const button=document.createElement('button');button.type='button';button.textContent='View details';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','hidi-offer-terms');
    const terms=document.createElement('p');terms.id='hidi-offer-terms';terms.textContent=current.terms;terms.hidden=true;
    button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));terms.hidden=!open;});
    note.append(line,button);section.append(benefits,note,terms);hero.after(section);
  }
  async function refresh(){
    const id=++generation,bearer=token();
    try{
      const response=await fetch('/api/hidi/offers',{cache:'no-store',credentials:'same-origin',headers:bearer?{Authorization:'Bearer '+bearer}:{},signal:AbortSignal.timeout(8000)});
      const data=await response.json();
      if(id!==generation||token()!==bearer)return;
      if(!response.ok||data.visible!==true||!['primary','secondary','terms'].every(k=>typeof data[k]==='string')||data.endsAt&&Date.now()>=Date.parse(data.endsAt)){remove();return;}
      if(version!==data.version){remove();current=data;version=data.version;if(data.endsAt)expiry=setTimeout(remove,Math.min(2147483647,Math.max(0,Date.parse(data.endsAt)-Date.now())));observer=new MutationObserver(place);observer.observe(document.body,{childList:true,subtree:true});}
      place();
    }catch{if(id===generation)remove();}
  }
  function accountChanged(){++generation;remove();refresh();}
  window.addEventListener('hidi-auth-updated',accountChanged);
  window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)accountChanged();});
  window.addEventListener('pageshow',accountChanged);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  const start=()=>{refresh();setInterval(()=>{if(current?.endsAt&&Date.now()>=Date.parse(current.endsAt))remove();if(!document.hidden)refresh();},15000);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
