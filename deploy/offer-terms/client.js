// Independent offer disclosures. No cart mutations, coupon application or payment calls.
(()=>{
 if(window.__hidiOfferTerms)return;window.__hidiOfferTerms=true;
 const KEY='hidi_supabase_session',supported=['WELCOME250','GET1'];let entries=[],generation=0,observer,signature='',lastPath=location.pathname,dialog=null,loadedPath=null,loadedToken,restoreCode=null;
 const token=()=>{try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return typeof s?.access_token==='string'&&s.expires_at>Date.now()/1000?s.access_token:null;}catch{return null;}};
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const current=()=>entries.filter(o=>!o.endsAt||Date.now()<Date.parse(o.endsAt));
 function close(){if(dialog){dialog.close();dialog.remove();dialog=null;}}
 function show(offer,trigger){close();const d=el('dialog',null,'hidi-promotion-dialog');dialog=d;d.dataset.offerCode=offer.code;d.setAttribute('aria-labelledby','hidi-promotion-title');
  const x=el('button','×','hidi-promotion-close');x.type='button';x.setAttribute('aria-label','Close terms');x.onclick=()=>d.close();
  const title=el('h2',offer.title.replace(new RegExp('^'+offer.code+':?\\s*'),'').trim());title.id='hidi-promotion-title';
  d.append(x,el('p',offer.code+' · TERMS & CONDITIONS','hidi-promotion-code'),title);let list=el('ul');d.append(list);
  for(const line of offer.terms.split(/\n+/).map(s=>s.trim()).filter(Boolean)){if(line==='Returns & exchanges'){const section=el('section',null,'hidi-promotion-returns');section.append(el('h3',line));list=el('ul');section.append(list);d.append(section);}else list.append(el('li',line));}
  const link=el('a','Read the full Returns & Exchanges policy');link.href='/returns';link.target='_blank';link.rel='noopener';link.className='hidi-promotion-policy';
  const done=el('button','Got it','hidi-promotion-done');done.type='button';done.onclick=()=>d.close();d.append(link,done);
  const openedPath=location.pathname;
  d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;if(location.pathname!==openedPath)return;restoreCode=offer.code;restoreFocus();place();});document.body.append(d);d.showModal();
 }
 function terms(offer){const b=el('button','T&C applicable','hidi-promotion-terms-button');b.type='button';b.dataset.offerTerms=offer.code;b.setAttribute('aria-label',offer.code+' terms and conditions');b.onclick=()=>show(offer,b);return b;}
 function restoreFocus(){if(restoreCode&&!dialog&&(document.activeElement===document.body||document.activeElement?.dataset.offerTerms===restoreCode))document.querySelector('[data-offer-terms="'+restoreCode+'"]')?.focus({preventScroll:true});}
 document.addEventListener('focusin',e=>{if(e.target.dataset?.offerTerms)restoreCode=e.target.dataset.offerTerms;else if(!e.target.closest?.('.hidi-promotion-dialog'))restoreCode=null;});
 function place(){
  if(location.pathname!==lastPath){lastPath=location.pathname;changed();return;}
  const live=current();if(dialog&&!live.some(o=>o.code===dialog.dataset.offerCode))close();
  if(location.pathname==='/'){
   const hero=document.querySelector('section.hero--campaign,section.hero[aria-labelledby="hero-title"]');const old=document.querySelector('[data-hidi-offer-strip]');
   const next=JSON.stringify(live);if(!live.length){old?.remove();signature='';return;}if(old&&signature===next){restoreFocus();return;}old?.remove();if(!hero)return;
   const strip=el('section',null,'hidi-promotion-strip');strip.dataset.hidiOfferStrip='true';strip.setAttribute('aria-label','HIDI offers');const grid=el('div',null,'hidi-promotion-grid');grid.classList.toggle('single',live.length===1);
   for(const o of live){const card=el('article',null,'hidi-promotion-card');card.dataset.offerCode=o.code;card.append(el('p',o.code,'hidi-promotion-code'),el('h2',o.title.replace(new RegExp('^'+o.code+':?\\s*'),'').trim()),el('p',o.code==='WELCOME250'?'Shop for ₹1,499 or more. Use WELCOME250.':'Shop for ₹3,999 or more. Use GET1.','hidi-promotion-description'),terms(o));grid.append(card);}
   strip.append(grid,el('p','One offer per order. Choose the offer that suits your purchase.','hidi-promotion-note'));hero.after(strip);signature=next;
  }else if(location.pathname==='/checkout'){
   for(const button of document.querySelectorAll('.hidi-coupon-hint button.hidi-coupon-link')){const code=button.textContent.trim(),line=button.parentElement,offer=live.find(o=>o.code===code);const old=line.querySelector('[data-offer-terms]');if(!offer){old?.remove();continue;}if(old&&old.dataset.content===offer.terms)continue;old?.remove();const b=terms(offer);b.dataset.content=offer.terms;line.append(b);}
  }else{document.querySelector('[data-hidi-offer-strip]')?.remove();document.querySelectorAll('[data-offer-terms]').forEach(b=>b.remove());close();}
  restoreFocus();
 }
 function clear(){entries=[];signature='';loadedPath=null;loadedToken=undefined;close();document.querySelector('[data-hidi-offer-strip]')?.remove();document.querySelectorAll('[data-offer-terms]').forEach(b=>b.remove());}
 async function refresh(){const id=++generation,bearer=token(),path=location.pathname;if(!['/','/checkout'].includes(path)){clear();return;}
  try{const r=await fetch('/api/hidi/offers/details?placement='+(path==='/'?'landing':'checkout'),{credentials:'same-origin',cache:'no-store',headers:bearer?{Authorization:'Bearer '+bearer}:{},signal:AbortSignal.timeout(8000)});const data=await r.json();if(id!==generation||bearer!==token()||path!==location.pathname)return;
   if(!r.ok||!Array.isArray(data.entries))throw Error();const next=data.entries;if(next.some(o=>!supported.includes(o.code)||typeof o.title!=='string'||typeof o.terms!=='string'||o.endsAt&&(!Number.isFinite(Date.parse(o.endsAt)))))throw Error();
   if(JSON.stringify(entries)!==JSON.stringify(next))close();entries=next;loadedPath=path;loadedToken=bearer;place();
  }catch{if(id===generation){clear();}}
 }
 function changed(){++generation;if(location.pathname!==loadedPath||token()!==loadedToken)clear();refresh();}
 function start(){observer=new MutationObserver(place);observer.observe(document.body,{childList:true,subtree:true});refresh();setInterval(()=>{if(location.pathname!==lastPath){lastPath=location.pathname;changed();}else{place();if(!document.hidden)refresh();}},15000);}
 window.addEventListener('hidi-auth-updated',changed);window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)changed();});window.addEventListener('pageshow',changed);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
