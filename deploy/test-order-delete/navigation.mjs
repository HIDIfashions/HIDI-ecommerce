// Appended to the retained owner-session activity asset. No business actions.
(()=>{let owner=false,queued=false;const add=()=>{queued=false;if(!owner||!location.pathname.startsWith('/admin'))return;
 for(const nav of document.querySelectorAll('nav[aria-label="Admin navigation"]'))if(!nav.querySelector('[data-test-orders-link]')){const sample=nav.querySelector('a[href="/admin/orders"]');if(sample){const a=document.createElement('a');a.href='/admin/test-orders';a.textContent='Test orders';a.dataset.testOrdersLink='true';a.className=sample.className;sample.after(a);}}
 if(location.pathname==='/admin/orders'&&!document.querySelector('[data-test-orders-entry]')){const h=document.querySelector('main h1');if(h){const a=document.createElement('a');a.href='/admin/test-orders';a.textContent='Manage test orders →';a.dataset.testOrdersEntry='true';h.after(a);}}
 };const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(add);}};
 fetch('/api/admin/session',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{owner=v?.admin?.role==='OWNER';if(owner){new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});schedule();}}).catch(()=>{});
})();
