if(location.pathname.startsWith('/admin')&&!location.pathname.startsWith('/admin/sign')){
  const timeout=3600000,key='hidi-admin-last-activity';
  let last=Date.now(),sent=0,leaving=false,pending=false;
  const read=()=>{try{return Number(localStorage.getItem(key))||0;}catch{return 0;}};
  const write=value=>{try{localStorage.setItem(key,String(value));}catch{}};
  const expire=async()=>{if(leaving)return;leaving=true;document.body.style.visibility='hidden';try{await fetch('/api/admin/session',{method:'DELETE'});}finally{location.replace('/admin/sign-in?expired=1');}};
  const check=()=>{last=Math.max(last,Math.min(Date.now(),read()));if(Date.now()-last>=timeout)void expire();};
  const activity=async event=>{
    if(!event.isTrusted||leaving||document.hidden)return;check();if(leaving)return;
    last=Date.now();write(last);if(pending||last-sent<15000)return;
    pending=true;
    try{const r=await fetch('/api/admin/activity',{method:'POST'});if(r.status===401||r.status===403)void expire();else if(r.ok)sent=Date.now();}catch{}finally{pending=false;}
  };
  for(const name of ['pointerdown','pointermove','keydown','scroll','touchstart'])addEventListener(name,activity,{passive:true});
  addEventListener('storage',check);addEventListener('focus',check);document.addEventListener('visibilitychange',check);setInterval(check,1000);
  fetch('/api/admin/session',{cache:'no-store'}).then(async r=>{
    if(r.status===401||r.status===403){void expire();return;}if(!r.ok)return;
    const session=await r.json();
    if(session.admin?.role==='OWNER'&&session.admin?.email?.toLowerCase()==='fashionshidi@gmail.com'){
      const add=()=>{for(const nav of document.querySelectorAll('nav[aria-label="Admin navigation"]'))if(!nav.querySelector('[href="/admin/sales-delete"]')){const link=document.createElement('a');link.href='/admin/sales-delete';link.textContent='Delete sales';nav.append(link);}};
      add();new MutationObserver(add).observe(document.body,{childList:true,subtree:true});
    }
  }).catch(()=>{});
  document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(a&&new URL(a.href,location.href).pathname==='/admin/sales-delete'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();location.assign(a.href);}},true);
}
