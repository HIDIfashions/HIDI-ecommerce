(() => {
 if(window.__hidiCheckoutOffers)return;window.__hidiCheckoutOffers=true;
 const original=window.fetch.bind(window),KEY='hidi_supabase_session';
 let choice={kind:'NONE'},quote=null,codeDraft='',activeCode='',sessionId=null,cartPresent=false,busy=false,syncing=false,locked=false,revision=0,panel=null,notice='',noticeError=false,lastPath=location.pathname,openPicker=false;
 const money=p=>'₹'+(p/100).toLocaleString('en-IN',{minimumFractionDigits:p%100?2:0,maximumFractionDigits:2});
 const token=()=>{try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return s?.expires_at>Date.now()/1000?s.access_token:null;}catch{return null;}};
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const button=(text,action,cls)=>{const b=el('button',text,cls);b.type='button';b.disabled=busy||syncing||locked;b.addEventListener('click',action);return b;};
 function closePicker(){document.querySelectorAll('.hidi-offer-dialog').forEach(d=>{d.close();d.remove();});}
 function reset(message=''){closePicker();choice={kind:'NONE'};quote=null;activeCode='';codeDraft='';busy=false;syncing=false;locked=false;revision++;openPicker=false;notice=message;noticeError=false;}
 const refresh=()=>window.dispatchEvent(new Event('hidi-cart-updated'));
 async function getQuote(id,selection,code,signal){
  const bearer=token(),offer=selection.kind==='DRESS1'&&!selection.variantId?{kind:'NONE'}:selection;
  const response=await original('/api/store/checkout/offers/quote',{method:'POST',cache:'no-store',credentials:'same-origin',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify({sessionId:id,offer,...(code?{couponCode:code}:{})})});
  const data=await response.json();if(!response.ok)throw Error(data.message==='Shop ₹1,499 of regular items to use WELCOME250'?'Shop for 1499 to avail the discount':typeof data.message==='string'?data.message:'Coupon could not be confirmed');return data;
 }
 async function apply(){
  if(busy||syncing||locked||!sessionId)return;
  if(!codeDraft.trim()){notice='Enter a coupon code.';noticeError=true;render();return;}
  const id=++revision,auth=token(),session=sessionId;busy=true;notice='Checking your coupon…';noticeError=false;render();
  try{
   const result=await getQuote(session,{kind:'NONE'},codeDraft);
   if(id!==revision||auth!==token()||session!==sessionId)return;
   if(!result.available||!result.choice?.code)throw Error('This coupon is not currently available.');
   choice=result.choice;quote=result;activeCode=choice.code;codeDraft=activeCode;syncing=true;openPicker=result.selectionRequired===true;
   notice=result.selectionRequired?'GET1 unlocked. Choose a dress and size to finish applying it.':activeCode+' applied. You saved '+money(result.discountPaise)+'.';
   refresh();
  }catch(error){if(id===revision){notice=error.message||'Coupon could not be confirmed. Please retry.';noticeError=true;}}
  finally{if(id===revision){busy=false;render();}}
 }
 function remove(){if(busy||syncing||locked)return;reset('Coupon removed.');syncing=true;render();refresh();}
 function choose(dress){if(busy||syncing||locked)return;choice={kind:'DRESS1',version:quote.version,variantId:dress.id,code:'GET1'};activeCode='GET1';codeDraft='GET1';revision++;syncing=true;closePicker();notice='Confirming your dress and updated total…';noticeError=false;render();refresh();}
 function imageSource(source){try{const u=new URL(source,location.origin);return u.protocol==='https:'||u.origin===location.origin?u.href:null;}catch{return null;}}
 function picker(){
  if(!quote?.dressUnlocked||!activeCode||busy||syncing||locked)return;closePicker();
  const modal=el('dialog',null,'hidi-offer-dialog hidi-coupon-dialog');modal.setAttribute('aria-labelledby','hidi-coupon-picker-title');
  const title=el('h2','Choose your extra dress for ₹1');title.id='hidi-coupon-picker-title';modal.append(title,el('p','GET1 · '+quote.selectedProductCount+' selected styles. Choose an available size.'));
  const products=new Map();for(const v of quote.collection||quote.candidates){if(!products.has(v.productId))products.set(v.productId,[]);products.get(v.productId).push(v);}
  const grid=el('div',null,'hidi-offer-dress-grid');
  for(const variants of products.values()){
   const first=variants[0],card=el('article');card.dataset.offerStyle=first.productId;
   if(first.image&&imageSource(first.image)){const image=el('img');image.src=imageSource(first.image);image.alt=first.name;image.loading='lazy';card.append(image);}
   card.append(el('h3',first.name));const sizes=el('div',null,'hidi-offer-sizes');
   for(const dress of variants){const b=button(dress.size+' · '+dress.color,()=>choose(dress));b.setAttribute('aria-label','Choose '+dress.name+' size '+dress.size+' '+dress.color+' for ₹1');b.disabled=dress.available<1;b.title=dress.available<1?'Out of stock':'Choose this size';sizes.append(b);}card.append(sizes);if(variants.every(v=>v.available<1))card.append(el('p','Currently out of stock'));grid.append(card);
  }
  modal.append(grid,button('Close picker',()=>{closePicker();render();},'hidi-coupon-link'));modal.addEventListener('cancel',()=>{modal.remove();render();});document.body.append(modal);modal.showModal();
 }
 function place(){
  const main=document.querySelector('main'),form=main?.querySelector('#hidi-checkout-form');if(!main||!form)return false;
  const items=main.querySelector('.checkout-summary-items');const target=matchMedia('(min-width:721px)').matches&&items?items:form;
  if(target===items){if(panel.previousElementSibling!==items)items.after(panel);}else if(form.previousElementSibling!==panel)form.before(panel);return true;
 }
 function render(){
  if(location.pathname!=='/checkout'||!cartPresent){panel?.remove();panel=null;return;}
  if(!panel){panel=el('section',null,'hidi-checkout-coupons');panel.dataset.hidiCheckoutCoupons='true';panel.setAttribute('aria-label','Checkout coupon');}
  if(!place())return;
  const focused=document.activeElement?.id==='hidi-coupon-code',cursor=focused?document.activeElement.selectionStart:null;
  const label=el('label','Have a coupon?');label.htmlFor='hidi-coupon-code';const row=el('div',null,'hidi-coupon-input-row'),input=el('input');input.id='hidi-coupon-code';input.type='text';input.placeholder='WELCOME250';input.autocomplete='off';input.maxLength=32;input.value=codeDraft;input.disabled=busy||syncing||locked;input.setAttribute('aria-describedby','hidi-coupon-status');input.addEventListener('input',()=>{codeDraft=input.value;});input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply();}});row.append(input,button(busy?'Checking…':'Apply',apply));
  const status=el('p',notice||'Shop for 1499 to avail the discount','hidi-coupon-status'+(noticeError?' is-error':''));status.id='hidi-coupon-status';status.setAttribute('role',noticeError?'alert':'status');status.setAttribute('aria-live','polite');
  panel.replaceChildren(label,row,status);
  if(activeCode){
   const details=el('div',null,'hidi-coupon-applied');details.append(el('strong',activeCode));
   if(quote?.gift)details.append(el('span',quote.gift.name+' · Size '+quote.gift.size+' · ₹1'));
   if(activeCode==='WELCOME250'&&quote)details.append(el('span','Coupon discount −'+money(quote.discountPaise)));
   details.append(button('Remove coupon',remove,'hidi-coupon-link'));panel.append(details);
   if(activeCode==='GET1')panel.append(button(quote?.gift?'Change ₹1 dress':'Choose your ₹1 dress',picker));
   if(quote?.selectionRequired)panel.append(el('p','Choose your dress before paying, or remove GET1.'));
  }
  if(locked)panel.append(el('p','Coupon locked for this payment attempt. Retry the same payment, or reload checkout.'));
  if(focused&&!input.disabled){input.focus({preventScroll:true});if(cursor!==null)input.setSelectionRange(cursor,cursor);}
 }
 window.fetch=async function(resource,options){
  const raw=typeof resource==='string'?resource:resource instanceof URL?resource.href:resource.url,u=new URL(raw,location.href),method=(options?.method||resource?.method||'GET').toUpperCase();
  if(location.pathname!=='/checkout'||u.origin!==location.origin)return original(resource,options);
  const cartMatch=u.pathname.match(/^\/api\/store\/carts\/([^/]+)$/);
  if(cartMatch&&method==='GET'){
   const auth=token(),session=decodeURIComponent(cartMatch[1]);
   if(sessionId&&sessionId!==session)reset('Your bag changed. Apply your coupon again.');sessionId=session;
   const id=++revision,selected=structuredClone(choice),code=activeCode,response=await original(resource,options);if(!response.ok)return response;
   const cart=await response.clone().json();if(id!==revision||auth!==token())throw Error('Your account or coupon changed. Review checkout again.');
   cartPresent=!!cart.items?.length;if(!cartPresent){reset();render();return response;}
   if(!code){busy=false;syncing=false;render();return response;}
   let result;
   try{result=await getQuote(session,selected,code,options?.signal);}catch(error){
    if(options?.signal?.aborted)throw error;
    if(id!==revision||auth!==token())throw Error('Your account or coupon changed. Review checkout again.');
    reset((error.message||'Coupon could not be confirmed.')+' Coupon removed.');noticeError=true;render();return response;
   }
   if(id!==revision||auth!==token())throw Error('Your account or coupon changed. Review checkout again.');
   busy=false;syncing=false;quote=result;choice=result.choice;activeCode=choice.code;codeDraft=activeCode;
   notice=result.selectionRequired?'GET1 unlocked. Choose a dress and size to finish applying it.':result.gift?'GET1 applied. '+result.gift.name+' · Size '+result.gift.size+' added for ₹1.':activeCode+' applied. You saved '+money(result.discountPaise)+'.';noticeError=false;render();
   if(openPicker&&result.selectionRequired){openPicker=false;queueMicrotask(picker);}
   const data={...cart,subtotalPaise:result.netSubtotalPaise,shippingPaise:result.shippingPaise,totalPaise:result.totalPaise};
   if(result.gift){data.itemCount+=1;data.items=[...data.items,{id:'hidi-offer-'+result.gift.id,quantity:1,lineTotalPaise:100,product:{name:result.gift.name+' (GET1 · ₹1)',slug:result.gift.slug,image:result.gift.image},variant:{id:result.gift.id,size:result.gift.size,color:result.gift.color}}];}
   return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if(u.pathname==='/api/store/checkout/prepare'&&method==='POST'){
   if(busy||syncing)throw Error('Please wait while your coupon total is confirmed.');
   if(typeof options?.body!=='string')return original(resource,options);
   if(!activeCode){
    // Do not allow a coupon to change an already-prepared full-price payment.
    // Forward ordinary, rewards and COD request bodies byte-for-byte.
    locked=true;render();const result=await original(resource,options);
    if(!result.ok&&[400,401,403,409].includes(result.status)){const error=await result.clone().json().catch(()=>({}));if(error.message!=='This checkout attempt has ended. Please retry payment.'){locked=false;render();}}
    return result;
   }
   const body=JSON.parse(options.body);
   if(quote?.selectionRequired)throw Error('Choose your GET1 dress and size, or remove the coupon before paying.');
   if((body.walletPaise||0)>0)throw Error('Choose either this coupon or reward redemption. They cannot be combined.');
   if(!quote?.available||body.expectedPayableTotalPaise!==quote.totalPaise||body.expectedTotalPaise!==quote.netSubtotalPaise)throw Error('Review your updated coupon total before paying.');
   body.offer=choice;body.expectedTotalPaise=quote.originalSubtotalPaise;locked=true;render();
   const result=await original(resource,{...options,body:JSON.stringify(body)});
   if(!result.ok){const error=await result.clone().json().catch(()=>({}));if([400,401,403,409].includes(result.status)&&error.message!=='This checkout attempt has ended. Please retry payment.'){reset((error.message||'Coupon unavailable.')+' Please review your bag.');noticeError=true;render();refresh();}}
   return result;
  }
  return original(resource,options);
 };
 const authChanged=()=>{reset('Your account changed. Apply your coupon again.');render();if(location.pathname==='/checkout')refresh();};
 window.addEventListener('hidi-auth-updated',authChanged);window.addEventListener('storage',e=>{if(e.key===KEY||e.key==='hidi_cart_session'||e.key===null)authChanged();});
 window.addEventListener('resize',()=>{if(panel)place();});
 setInterval(()=>{if(location.pathname==='/checkout'&&activeCode&&!document.hidden&&!locked&&!busy&&!syncing)refresh();},15000);
 new MutationObserver(()=>{if(lastPath!==location.pathname){lastPath=location.pathname;reset();cartPresent=false;panel?.remove();panel=null;}if(panel&&!panel.isConnected){panel=null;render();}else if(!panel&&cartPresent)render();}).observe(document.documentElement,{childList:true,subtree:true});
})();
