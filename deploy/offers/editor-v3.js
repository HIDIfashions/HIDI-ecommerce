(() => {
 const $=id=>document.getElementById(id),form=$('offers-form'),controls=$('controls');
 let state=null,selected='WELCOME250',dirty=false,busy=false,uncertain=false,ids=new Set(),products=[];
 const message=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
 const fields=['title','terms','audience'],checks=['checkoutEnabled','landingEnabled'];
 const dateInput=iso=>{if(!iso)return '';const d=new Date(iso);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
 const publishedLabel=o=>!o.published?'Not published':o.published.status==='PAUSED'?'Paused':o.published.config.audience==='HIDDEN'?'Published · hidden':'Published · '+[o.published.config.checkoutEnabled?'Checkout':null,o.published.config.landingEnabled?'Landing page':null].filter(Boolean).join(' + ');
 function update(){
  $('publish').disabled=!state||dirty||busy||uncertain||!$('confirmed').checked;
  $('pause').disabled=!state?.offers[selected].published||busy||uncertain||dirty;
  $('numbers-label').hidden=form.elements.audience.value!=='SELECTED';$('selection-count').textContent=ids.size+' styles selected';$('preview-title').textContent=form.elements.title.value;
  $('preview-placement').textContent=[form.elements.checkoutEnabled.checked?'Checkout: visible':'Checkout: hidden',form.elements.landingEnabled.checked?'Landing page: visible':'Landing page: hidden'].join(' · ');
  for(const b of document.querySelectorAll('[data-offer]'))b.disabled=busy||!state;
 }
 function productList(){
  const box=$('offer-products'),search=$('product-search').value.toLowerCase();box.replaceChildren();
  for(const p of products.filter(p=>ids.has(p.id)||((p.status===undefined||p.status==='ACTIVE')&&p.variants?.length)).sort((a,b)=>Number(ids.has(b.id))-Number(ids.has(a.id))||a.name.localeCompare(b.name))){
   if(search&&!((p.name+' '+p.slug).toLowerCase().includes(search)))continue;
   const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.offerProduct=p.id;check.checked=ids.has(p.id);
   const stock=p.variants.reduce((n,v)=>n+Math.max(0,v.available||0),0),price=Math.min(...p.variants.map(v=>v.pricePaise));label.append(check,document.createTextNode(p.name+' · '+p.slug+' · ₹'+(price/100).toLocaleString('en-IN')+' · '+stock+' available'));
   check.addEventListener('change',()=>{check.checked?ids.add(p.id):ids.delete(p.id);markDirty();});box.append(label);
  }
  for(const id of [...ids].filter(id=>!products.some(p=>p.id===id))){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.offerProduct=id;check.addEventListener('change',()=>{ids.delete(id);markDirty();productList();});label.append(check,'Unavailable product: '+id+' — remove or restore in Products before publishing');box.append(label);}
  if(!box.childElementCount)box.textContent='No matching products.';
 }
 function render(next){
  state=next;dirty=false;uncertain=false;$('confirmed').checked=false;const offer=state.offers[selected],draft=offer.draft;
  for(const field of fields)form.elements[field].value=draft[field];for(const field of checks)form.elements[field].checked=draft[field]===true;form.elements.allowedPhones.value=draft.allowedPhones.join('\n');for(const field of ['startsAt','endsAt'])form.elements[field].value=dateInput(draft[field]);
  ids=new Set(draft.eligibleProductIds||[]);$('dress-settings').hidden=selected!=='GET1';$('offer-heading').textContent=selected;$('save').textContent='Save '+selected+' draft';$('publish').textContent='Publish '+selected;$('pause').textContent='Pause '+selected;
  $('publication').textContent=publishedLabel(offer)+(offer.published?' · Version '+offer.published.version:'')+' · Draft changes do not affect the live offer.';
  $('offer-rule').textContent=selected==='WELCOME250'?'₹250 off ₹1,499 in regular merchandise. Once per new customer. Cannot be combined with GET1 or rewards.':'₹3,999 in regular merchandise unlocks one additional dress for ₹1. First 25 qualifying orders, one per customer. Delivery and the ₹1 dress do not count toward ₹3,999. WELCOME250 and rewards cannot be combined with GET1.';
  for(const b of document.querySelectorAll('[data-offer]')){b.setAttribute('aria-pressed',String(b.dataset.offer===selected));$('state-'+b.dataset.offer).textContent=publishedLabel(state.offers[b.dataset.offer]);}
  $('history-title').textContent=selected+' publication history';const history=$('history');history.replaceChildren();
  for(const revision of offer.history){const row=document.createElement('p'),button=document.createElement('button');row.append('Version '+revision.version+' · '+(revision.status||'PUBLISHED')+' · '+new Date(revision.pausedAt||revision.publishedAt).toLocaleString()+' · '+(revision.actor?.id||'Owner')+' ');button.type='button';button.textContent='Restore '+selected+' version '+revision.version;button.addEventListener('click',()=>{if(dirty||busy||uncertain)return message('Save or reload your draft first.',true);if(window.confirm('Publish this saved '+selected+' version and its original visibility?'))write({action:'restore',versionId:revision.id,confirm:true},selected+' version restored.');});row.append(button);history.append(row);}
  controls.disabled=false;productList();update();
 }
 async function call(body){const response=await fetch('/api/hidi/offers/admin',{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.message||'Unable to save offers');return result;}
 async function load(){if(busy)return;busy=true;controls.disabled=true;try{render(await call());message('Owner verified. Choose either offer to manage its draft and publication.');}catch(e){message(e.message,true);controls.disabled=true;}finally{busy=false;update();}}
 async function write(body,success){if(!state||busy||uncertain)return;busy=true;controls.disabled=true;update();try{render(await call({...body,offerCode:selected,etag:state.etag}));message(success);}catch(e){uncertain=true;message(e.message+' Reload saved settings before another write. Your draft is still visible.',true);controls.disabled=false;}finally{busy=false;update();}}
 function markDirty(){dirty=true;$('confirmed').checked=false;message('Unsaved '+selected+' draft. Save before publishing.');update();}
 form.addEventListener('input',e=>{if(e.target===$('confirmed'))return update();if(e.target===$('product-search'))return productList();markDirty();});form.addEventListener('change',update);
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity()||uncertain)return;const draft={eligibleProductIds:selected==='GET1'?[...ids]:[]};for(const f of fields)draft[f]=form.elements[f].value;for(const f of checks)draft[f]=form.elements[f].checked;draft.allowedPhones=form.elements.allowedPhones.value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);for(const f of ['startsAt','endsAt'])draft[f]=form.elements[f].value?new Date(form.elements[f].value).toISOString():null;write({action:'save',draft},selected+' draft saved. Live offers are unchanged.');});
 for(const b of document.querySelectorAll('[data-offer]'))b.addEventListener('click',()=>{if(!state||busy||b.dataset.offer===selected)return;if(dirty&&!window.confirm('Discard unsaved '+selected+' edits and open '+b.dataset.offer+'?'))return;selected=b.dataset.offer;$('product-search').value='';render(state);message('Editing '+selected+'. The other offer is unchanged.');});
 $('publish').addEventListener('click',()=>{if(!$('publish').disabled)write({action:'publish',confirm:true},selected+' published with its saved visibility settings.');});
 $('pause').addEventListener('click',()=>write({action:'pause'},selected+' paused for new checkouts. The other offer is unchanged. Existing prepared payments retain their reserved offer.'));
 $('reload').addEventListener('click',()=>{if(!dirty||window.confirm('Discard unsaved edits and reload?'))load();});$('timezone').textContent='Schedule times use '+Intl.DateTimeFormat().resolvedOptions().timeZone+'.';
 fetch('/api/store/products',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(value=>{products=value;productList();}).catch(()=>{$('offer-products').textContent='Unable to load products. Reload before publishing GET1.';});load();
})();
