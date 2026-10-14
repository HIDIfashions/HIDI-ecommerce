(() => {
 if(window.__hidiCheckoutOffers)return;window.__hidiCheckoutOffers=true;
 const original=window.fetch.bind(window),KEY='hidi_supabase_session';let choice={kind:'NONE'},quote=null,busy=false,revision=0,panel=null,lastCelebration=null,locked=false,lastPath=location.pathname;
 const money=p=>'₹'+(p/100).toLocaleString('en-IN',{minimumFractionDigits:p%100?2:0,maximumFractionDigits:2});
 const token=()=>{try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return s?.expires_at>Date.now()/1000?s.access_token:null;}catch{return null;}};
 function clear(){document.querySelectorAll('.hidi-offer-dialog').forEach(d=>{d.close();d.remove();});busy=false;choice={kind:'NONE'};quote=null;revision++;panel?.remove();panel=null;lastCelebration=null;locked=false;}
 async function getQuote(sessionId,selection,signal){const bearer=token();const response=await original('/api/store/checkout/offers/quote',{method:'POST',cache:'no-store',credentials:'same-origin',signal,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify({sessionId,offer:selection})});const data=await response.json();if(!response.ok)throw Error(data.message||'Offer could not be confirmed');return data;}
 function imageSource(source){try{const u=new URL(source,location.origin),hosts=new Set(['thehidi.com','www.thehidi.com','hidiindia.com','www.hidiindia.com','thidigk.thehidi.com','azure-preview.thehidi.com']);if(u.protocol==='https:'&&hosts.has(u.hostname)&&u.pathname.startsWith('/media/products/'))return u.pathname.replace(/^\/media\/products\/(?:_display_v2\/)?/,'/media/products/_display_v2/')+u.search;if(source.startsWith('/media/products/'))return u.pathname.replace(/^\/media\/products\/(?:_display_v2\/)?/,'/media/products/_display_v2/')+u.search;return u.protocol==='https:'?u.href:null;}catch{return null;}}
 const element=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
 const button=(text,action)=>{const b=element('button',text);b.type='button';b.disabled=busy||locked;b.addEventListener('click',action);return b;};
 function changed(next){if(locked||busy)return;choice=next;quote=null;revision++;busy=true;render();window.dispatchEvent(new Event('hidi-cart-updated'));}
 function picker(){if(!quote?.dressUnlocked||!quote.candidates.length||locked)return;const modal=element('dialog',null,'hidi-offer-dialog'),heading=element('h2','Congratulations! You’ve unlocked the ₹1 dress offer');modal.setAttribute('aria-label','Choose your ₹1 dress');modal.append(heading,element('p','Pick one eligible dress and an available size. One offer per order.'));
 const grid=element('div',null,'hidi-offer-dress-grid');
 for(const dress of quote.candidates){const card=element('article');if(dress.image&&imageSource(dress.image)){const img=element('img');img.src=imageSource(dress.image);img.alt=dress.name;img.loading='lazy';card.append(img);}card.append(element('h3',dress.name),element('p','MRP '+money(dress.mrpPaise)+' · '+dress.color+' · Size '+dress.size),button('Choose size '+dress.size+' for ₹1',()=>{const version=quote.version;modal.close();modal.remove();changed({kind:'DRESS1',variantId:dress.id,version});}));grid.append(card);}
 if(!grid.childElementCount)grid.append(element('p','The ₹1 dresses are currently unavailable. You can choose 15% off instead.'));
 modal.append(grid,button('Close',()=>{modal.close();modal.remove();}));modal.addEventListener('cancel',()=>modal.remove());document.body.append(modal);modal.showModal();
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const celebration=element('div',null,'hidi-offer-confetti');celebration.setAttribute('aria-hidden','true');for(let i=0;i<24;i++){const dot=element('i');dot.style.setProperty('--x',((i*47)%100)+'%');dot.style.setProperty('--delay',(i%6)/10+'s');celebration.append(dot);}modal.append(celebration);setTimeout(()=>celebration.remove(),2200);}}
 function render(){
 if(location.pathname!=='/checkout'||!quote?.available){panel?.remove();panel=null;return;}
 if(!panel){const main=document.querySelector('main');if(!main)return;panel=element('section',null,'hidi-checkout-offers');panel.dataset.hidiCheckoutOffers='true';panel.setAttribute('aria-label','Choose your HIDI offer');const form=main.querySelector('form');if(form)form.before(panel);else main.append(panel);}
 panel.replaceChildren(element('h2','Choose your HIDI offer'),element('p','One offer per order · No coupon needed'));
 const actions=element('div');actions.append(button((choice.kind==='PERCENT15'?'✓ ':'')+'15% off',()=>changed({kind:'PERCENT15',version:quote.version})),button((choice.kind==='DRESS1'?'✓ ':'')+'Choose a dress for ₹1',picker),button('Continue without an offer',()=>changed({kind:'NONE'})));actions.children[1].disabled=busy||locked||!quote.dressUnlocked||!quote.candidates.length;panel.append(actions);
 if(quote.dressUnlocked&&!quote.candidates.length)panel.append(element('p','₹1 offer dresses are currently unavailable. You can choose 15% off instead.'));
 if(!quote.dressUnlocked)panel.append(element('p','Spend more than ₹3,999 on regular items to unlock the ₹1 dress.'));
 if(choice.kind==='PERCENT15')panel.append(element('strong','15% off applied · You save '+money(quote.discountPaise)));
 if(choice.kind==='DRESS1')panel.append(element('strong','Congratulations! You have availed the ₹1 dress offer. '+quote.gift.name+' · Size '+quote.gift.size));
 if(choice.kind!=='NONE')panel.append(element('p','Regular items '+money(quote.originalSubtotalPaise)+(choice.kind==='DRESS1'?' + Offer dress ₹1':' · Offer savings '+money(quote.discountPaise))+' · Shipping '+money(quote.shippingPaise)+' · Total before rewards '+money(quote.totalPaise)));
 if(locked)panel.append(element('p','Offer selection is locked for this payment attempt. Retry the same payment, or reload checkout to start again.'));
 if(quote.dressUnlocked&&quote.candidates.length&&lastCelebration!==localStorage.getItem('hidi_cart_session')&&choice.kind==='NONE'){lastCelebration=localStorage.getItem('hidi_cart_session');queueMicrotask(picker);}
 }
 window.fetch=async function(resource,options){
 const raw=typeof resource==='string'?resource:resource instanceof URL?resource.href:resource.url,u=new URL(raw,location.href),method=(options?.method||resource?.method||'GET').toUpperCase();
 if(location.pathname!=='/checkout'||u.origin!==location.origin)return original(resource,options);
 const cartMatch=u.pathname.match(/^\/api\/store\/carts\/([^/]+)$/);
 if(cartMatch&&method==='GET'){
  const id=++revision,auth=token(),selected=structuredClone(choice),response=await original(resource,options);if(!response.ok)return response;
  const cart=await response.clone().json();if(!cart.items?.length){clear();return response;}
  let result;try{result=await getQuote(decodeURIComponent(cartMatch[1]),selected,options?.signal);}catch(error){if(options?.signal?.aborted)throw error;if(selected.kind!=='NONE'){choice={kind:'NONE'};result=await getQuote(decodeURIComponent(cartMatch[1]),choice,options?.signal);}else result={available:false};}
  if(id!==revision||auth!==token())throw Error('Your account or offer changed. Review checkout again.');
  busy=false;quote=result;if(!result.available)choice={kind:'NONE'};render();
  if(!result.available||choice.kind==='NONE')return response;
  const data={...cart,subtotalPaise:result.netSubtotalPaise,shippingPaise:result.shippingPaise,totalPaise:result.totalPaise};
  if(result.gift){data.itemCount+=1;data.items=[...data.items,{id:'hidi-offer-'+result.gift.id,quantity:1,lineTotalPaise:100,product:{name:result.gift.name+' (₹1 offer)',slug:result.gift.slug,image:result.gift.image},variant:{id:result.gift.id,size:result.gift.size,color:result.gift.color}}];}
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
 if(u.pathname==='/api/store/checkout/prepare'&&method==='POST'){
  if(busy)throw Error('Please wait while your offer total is confirmed.');
  if(typeof options?.body!=='string')return original(resource,options);
  const body=JSON.parse(options.body);
  if(choice.kind!=='NONE'){
   if(!quote?.available||body.expectedPayableTotalPaise!==quote.totalPaise||body.expectedTotalPaise!==quote.netSubtotalPaise)throw Error('Review your updated offer total before paying.');
   body.offer=choice;body.expectedTotalPaise=quote.originalSubtotalPaise;
  }else body.offer={kind:'NONE'};
  locked=true;render();
  const result=await original(resource,{...options,body:JSON.stringify(body)});
  if(!result.ok){const error=await result.clone().json().catch(()=>({}));if(result.status===409&&error.message!=='This checkout attempt has ended. Please retry payment.') {locked=false;choice={kind:'NONE'};quote=null;window.dispatchEvent(new Event('hidi-cart-updated'));}render();}
  return result;
 }
 return original(resource,options);
 };
 window.addEventListener('hidi-auth-updated',()=>{clear();if(location.pathname==='/checkout')window.dispatchEvent(new Event('hidi-cart-updated'));});
 window.addEventListener('storage',e=>{if(e.key===KEY||e.key==='hidi_cart_session'||e.key===null){clear();if(location.pathname==='/checkout')window.dispatchEvent(new Event('hidi-cart-updated'));}});
 const observer=new MutationObserver(()=>{if(lastPath!==location.pathname){lastPath=location.pathname;clear();}if(panel&&!panel.isConnected)panel=null;if(quote)renderIfDetached();});const renderIfDetached=()=>{if(!panel)render();};observer.observe(document.documentElement,{childList:true,subtree:true});
})();
