(() => {
  'use strict';
  const target = new URL(location.href).searchParams.get('variant');
  const match = /^\/products\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(location.pathname);
  if (!match || !target || !/^[A-Za-z0-9_-]{1,50}$/.test(target)) return;
  let stopped=false, attempts=0, timer;
  const stop=()=>{stopped=true;clearTimeout(timer);window.removeEventListener('hidi:product-ready',apply);};
  const interacted=event=>{if(event.isTrusted)stop();};
  document.addEventListener('pointerdown',interacted,{once:true,capture:true});
  document.addEventListener('keydown',interacted,{once:true,capture:true});
  let product;
  function apply() {
    if (stopped || !product) return;
    const page=document.querySelector('[data-hidi-react-pdp]');
    if (page?.dataset.hidiHydrated==='true') {
      const variant=product.variants.find(v=>v.id===target);
      if (!variant || variant.available<1 || !product.inStock) {
        const note=document.createElement('p');note.setAttribute('role','status');
        note.textContent='This selected size is currently unavailable. Please choose another available size.';
        (document.querySelector('[data-pdp-summary]') || page).append(note);stop();return;
      }
      const summary=document.querySelector('[data-pdp-summary]');
      if (summary?.textContent.includes(variant.sku)) { stop();return; }
      window.dispatchEvent(new CustomEvent('hidi-product-variant-selected',{detail:{slug:product.slug,variantId:variant.id,color:variant.color,size:variant.size}}));
    }
    if (++attempts<100) timer=setTimeout(apply,100);else stop();
  }
  window.addEventListener('hidi:product-ready',apply);
  fetch('/api/store/products/'+match[1],{method:'GET',credentials:'omit',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}})
    .then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();})
    .then(value=>{product=value;apply();}).catch(stop);
})();
