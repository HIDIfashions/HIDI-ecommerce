(() => {
  if(!location.pathname.startsWith('/admin')||location.pathname==='/admin/offers'||location.pathname==='/admin/sign-in')return;
  const add=()=>{if(document.querySelector('[data-hidi-offers-shortcut]'))return;const a=document.createElement('a');a.href='/admin/offers';a.textContent='Offers';a.dataset.hidiOffersShortcut='true';document.body.append(a);};
  if(document.readyState==='complete')setTimeout(add,500);else window.addEventListener('load',()=>setTimeout(add,500),{once:true});
})();
