import {catalogueStatus,priceStatus} from './model.mjs';
let ready=false,pending=false,lastPath=location.pathname,catalogue=[];
const parse=text=>{const value=String(text).replace(/^\s*MRP\s*/i,'').replace(/[,\s₹]/g,'');return /^\d+(?:\.\d{1,2})?$/.test(value)?Math.round(Number(value)*100):null;};
function removeCampaign(){document.querySelectorAll('[data-hidi-price-announcement],[data-hidi-price-note]').forEach(el=>el.remove());}
function apply(){
  const product=document.querySelector("[data-hidi-react-pdp]");
  if(product && product.dataset.hidiHydrated!=="true")return;
  if(location.pathname.startsWith("/collections/") && !document.querySelector('[data-hidi-collection-hydrated="true"]'))return;
  if(location.pathname.startsWith('/admin')){
    removeCampaign();
    for(const nav of document.querySelectorAll('nav[aria-label="Admin navigation"]')){
      const products=nav.querySelector('a[href="/admin/products"]');
      if(!products)continue;
      let a=nav.querySelector('[data-hidi-pricing-link]');
      if(!a){a=document.createElement('a');a.href='/admin/product-pricing';a.textContent='Pricing';a.setAttribute('aria-label','Product pricing');a.className=products.className+' hidi-price-admin-link';a.dataset.hidiPricingLink='true';}
      if(products.nextElementSibling!==a)products.after(a);
    }
    return;
  }
  if(ready){
    if(!document.querySelector('[data-hidi-price-announcement]')){const bar=document.createElement('aside');bar.className='hidi-price-announcement';bar.dataset.hidiPriceAnnouncement='true';bar.setAttribute('aria-label','HIDI price offer');bar.textContent='15% off across HIDI · Prices already reduced · No code needed';document.body.prepend(bar);}
    if(['/cart','/checkout'].includes(location.pathname)&&!document.querySelector('[data-hidi-price-note]')){const main=document.querySelector('main');if(main){const p=document.createElement('p');p.className='hidi-price-note';p.dataset.hidiPriceNote='true';p.textContent='Your product prices already include 15% off. No additional percentage discount is applied at checkout.';main.prepend(p);}}
    else if(!['/cart','/checkout'].includes(location.pathname))document.querySelectorAll('[data-hidi-price-note]').forEach(el=>el.remove());
  }else removeCampaign();
  // Compare only an explicit MRP and selling price rendered together. Variant
  // changes trigger this observer again; ranges never inherit another size's MRP.
  const groups=document.querySelectorAll('[class*="priceRow"],[class*="priceBlock"],[class*="pricing"],[class*="editorial-product-card_price__"],[class*="quickPrice"],.pdp-price');
  for(const group of groups){
    const old=group.querySelector('[data-hidi-price-badge]'),nativeMrp=group.querySelector('s,del'),selling=group.querySelector('strong');
    const directText=[...group.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('');
    const sellingPaise=parse(selling?.textContent??directText);
    let mrpPaise=parse(nativeMrp?.textContent);
    if(group.matches('.pdp-price')){
      const detail=document.querySelector('.pdp-selected-detail')?.textContent||'',slug=decodeURIComponent(location.pathname.split('/products/')[1]||'').replace(/\/$/,'');
      const product=catalogue.find(p=>p.slug===slug),selected=product?.variants?.find(v=>detail.includes('SKU '+v.sku));
      const possible=selected?[selected]:(product?.variants||[]).filter(v=>v.pricePaise===sellingPaise);
      if(!nativeMrp&&possible.length&&possible.every(v=>v.pricePaise===sellingPaise&&v.mrpPaise===possible[0].mrpPaise))mrpPaise=possible[0].mrpPaise;
      let addedMrp=group.querySelector('[data-hidi-price-mrp]');
      if(!nativeMrp&&priceStatus(mrpPaise,sellingPaise).valid){
        if(!addedMrp){addedMrp=document.createElement('span');addedMrp.dataset.hidiPriceMrp='true';addedMrp.className='hidi-price-mrp';group.append(addedMrp);}
        const text='MRP '+new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(mrpPaise/100);if(addedMrp.textContent!==text)addedMrp.textContent=text;
      }else addedMrp?.remove();
      if(!group.querySelector('[data-hidi-selling-label]')){const label=document.createElement('span');label.dataset.hidiSellingLabel='true';label.textContent='Selling price ';group.prepend(label);}
    }
    const state=priceStatus(mrpPaise,sellingPaise);
    const label=state.valid&&(state.percent>0||group.matches('.pdp-price'))?(state.percent===0?'0% discount':(state.exact15?'15':state.percent.toFixed(2).replace(/0+$/,'').replace(/\.$/,''))+'% OFF'):null;
    if(!label){old?.remove();continue;}
    if(old){if(old.textContent!==label)old.textContent=label;}
    else{const badge=document.createElement('span');badge.dataset.hidiPriceBadge='true';badge.className='hidi-price-badge';badge.textContent=label;group.append(badge);}
  }
}
async function refresh(){
  if(pending)return;pending=true;
  try{const response=await fetch('/api/store/products',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Catalogue unavailable');const products=await response.json();catalogue=Array.isArray(products)?products:[];ready=Array.isArray(products)&&catalogueStatus(products).ready;}
  catch{ready=false;}finally{pending=false;apply();}
}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(lastPath!==location.pathname){lastPath=location.pathname;ready=false;refresh();}apply();});}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
window.addEventListener('hidi:product-ready',apply);window.addEventListener('hidi:collection-ready',apply);
window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(()=>{if(!document.hidden)refresh();},60000);refresh();
