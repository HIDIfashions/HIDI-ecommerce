if(location.pathname.startsWith('/admin')&&!location.pathname.startsWith('/admin/sign')){
  document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(link&&['/admin/support','/admin/staff'].includes(new URL(link.href,location.href).pathname)&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();location.assign(link.href);}},true);
  const add=()=>{for(const nav of document.querySelectorAll('nav[aria-label="Admin navigation"]')){
    if(!nav.querySelector('a[href="/admin/support"]')){const sample=nav.querySelector('a[href="/admin/orders"]');const link=document.createElement('a');link.href='/admin/support';link.textContent='Support';link.className=sample?.className||'';for(const name of [...link.classList])if(name.includes('navActive'))link.classList.remove(name);nav.append(link);}
  }};
  let role;
  const supportControls=()=>{
    const match=location.pathname.match(/^\/admin\/orders\/([^/]+)$/);
    if(match&&!document.getElementById('hidi-support-order-link')){const host=document.querySelector('main');if(host){const link=document.createElement('a');link.id='hidi-support-order-link';link.textContent='Open support notes, tags, follow-ups & approvals →';link.href='/admin/support?order='+encodeURIComponent(decodeURIComponent(match[1]));host.prepend(link);}}
    if(role==='SUPPORT')for(const node of document.querySelectorAll('[class*="actionPanel"],[class*="noteField"],[class*="shippingForm"],[class*="primaryAction"]'))if(!node.hidden)node.hidden=true;
  };
  add();supportControls();new MutationObserver(()=>{add();supportControls();}).observe(document.body,{childList:true,subtree:true});
  fetch('/api/admin/session',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(session=>{role=session?.admin?.role;supportControls();}).catch(()=>{});
}
