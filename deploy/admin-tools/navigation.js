(() => {
  const tools = [
    { key: 'media', label: 'Media Upload', href: '/admin/landing-media', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>', marker: 'hidiMediaLink' },
    { key: 'packing', label: 'Packing Scanner', href: '/admin/packing-scanner', icon: '<path d="M4 7V4h3m10 0h3v3M4 17v3h3m10 0h3v-3M7 8v8m3-8v8m4-8v8m3-8v8"/>', marker: 'hidiPackingLink' },
    { key: 'quick-fill', label: 'Product Quick Fill', href: '/admin/product-quick-fill', icon: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6m-6 4h6m-6 4h4"/>', marker: 'hidiQuickFill' },
    { key: 'bulk-details', label: 'Bulk Product Details', href: '/admin/product-bulk', icon: '<rect x="7" y="3" width="14" height="18" rx="2"/><path d="M4 17H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1m8 5h6m-6 4h6m-6 4h6"/>', marker: 'hidiBulkDetails' },
  ];
  const pathFor = link => { try { return new URL(link.getAttribute('href'), location.href).pathname.replace(/\/$/, ''); } catch { return ''; } };
  const nativeClass = (element, part) => [...(element?.classList || [])].find(name => name.includes(part)) || '';
  function toolNavigation() {
    if (!document.getElementById('hidi-admin-tools-navigation-style')) {
      const style = document.createElement('style'); style.id = 'hidi-admin-tools-navigation-style';
      // Scope to the injected rows; native navigation, pages and controls retain their styles.
      style.textContent = '[data-hidi-tools-group]{margin:0 0 22px;min-width:0}[data-hidi-tools-group]>p{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:#e6c9ba;margin:0 16px 9px}[data-hidi-admin-tool]{display:flex;align-items:center;gap:12px;width:100%;min-width:0;min-height:44px;padding:11px 14px;border-radius:9px;font:inherit;font-size:13px;line-height:1.5;color:#f4e5dc;text-decoration:none;box-sizing:border-box}[data-hidi-admin-tool]+[data-hidi-admin-tool]{margin-top:2px}[data-hidi-admin-tool]>svg{width:18px;height:18px;flex:0 0 18px}[data-hidi-admin-tool]>span{min-width:0;overflow-wrap:anywhere}[data-hidi-admin-tool]:hover{background:#ffffff0d}[data-hidi-admin-tool]:focus-visible{outline:3px solid var(--admin-gold,#edc36d);outline-offset:2px}[data-hidi-admin-tool][aria-current="page"]{background:#edc36d22;color:#ffe3a7;box-shadow:inset 3px 0 var(--admin-gold,#edc36d);font-weight:600}';
      (document.head || document.documentElement).append(style);
    }
    const navs = [...document.querySelectorAll('nav[aria-label="Admin navigation"]')];
    const workspaceNavs = navs.filter(nav => nav.closest('aside,dialog') || [...nav.querySelectorAll('a')].some(link => nativeClass(link, 'navLink')));
    for (const nav of workspaceNavs.length ? workspaceNavs : navs) {
      const toolPage = tools.some(tool => tool.href === location.pathname.replace(/\/$/, ''));
      if (toolPage) for (const link of nav.querySelectorAll('a:not([data-hidi-admin-tool])')) {
        link.removeAttribute('aria-current');
        for (const name of [...link.classList]) if (name.includes('navActive')) link.classList.remove(name);
      }
      const sample = [...nav.querySelectorAll('a')].find(link => !link.dataset.hidiAdminTool && nativeClass(link, 'navLink'));
      const baseClass = sample ? [...sample.classList].filter(name => !name.includes('navActive')).join(' ') : '';
      const groupClass = nativeClass(sample?.parentElement, 'navGroup');
      let group = nav.querySelector('[data-hidi-tools-group]');
      if (!group) { group = document.createElement('div'); group.dataset.hidiToolsGroup = 'true'; const label = document.createElement('p'); label.textContent = 'Tools'; group.append(label); nav.append(group); }
      if (group.className !== groupClass) group.className = groupClass;
      for (const tool of tools) {
        const matches = [...nav.querySelectorAll('a')].filter(link => link.dataset.hidiAdminTool === tool.key || pathFor(link) === tool.href || link.textContent.trim().toLowerCase() === tool.label.toLowerCase());
        let link = matches.find(item => item.dataset.hidiAdminTool === tool.key) || matches[0];
        if (!link) { link = document.createElement('a'); link.href = tool.href; }
        // Keep legacy marker attributes on the retained link so earlier injectors see it.
        for (const duplicate of matches) if (duplicate !== link) { for (const [key,value] of Object.entries(duplicate.dataset)) if (!(key in link.dataset)) link.dataset[key] = value; duplicate.remove(); }
        link.dataset.hidiAdminTool = tool.key; link.dataset[tool.marker] = 'true';
        if (tool.key === 'media' || tool.key === 'packing') link.dataset.hidiAdminTab = tool.key;
        if (link.className !== baseClass) link.className = baseClass;
        link.removeAttribute('style');
        if (!link.querySelector('svg') || !link.querySelector('span') || link.querySelector('span').textContent !== tool.label) {
          link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + tool.icon + '</svg><span>' + tool.label + '</span>';
        }
        const active = pathFor(link) === location.pathname.replace(/\/$/, '');
        if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        if (link.parentElement !== group) group.append(link);
      }
    }
  }
  // Blank templates replace the older sample-filled downloads in the retained Next runtime.
  const blankTemplates={
    'products-stock':['HIDI-products-stock-import-template.csv',['mode','product_name','product_slug','category','short_description','description','fabric','care','color','color_hex','size','selling_price','mrp','weight_grams','opening_qty','sku']],
    receipt:['HIDI-receipt-import-template.csv',['sku','accepted_qty','rejected_qty','unit_cost']]
  };
  document.addEventListener('click',event=>{
    if(location.pathname!=='/admin/import')return;const button=event.target.closest?.('button'),template=blankTemplates[button?.closest('section')?.id];
    if(!template||!/^Download .*template$/i.test(button.textContent.trim())||button.disabled)return;
    event.preventDefault();event.stopImmediatePropagation();const url=URL.createObjectURL(new Blob([template[1].join(',')+'\r\n'],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download=template[0];a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },true);
  function addTools(){
    const path=location.pathname;if(!path.startsWith('/admin'))return;
    toolNavigation();
    const match=path.match(/^\/admin\/products(?:\/([^/]+))?\/?$/),heading=document.querySelector('main h1');
    if(match&&(!match[1]||!['price-tags','bulk-import'].includes(match[1]))&&heading&&!document.getElementById('hidi-product-quick-fill-link')){
      const link=document.createElement('a');link.id='hidi-product-quick-fill-link';link.textContent='Paste product sheet →';link.href='/admin/product-quick-fill'+(match[1]&&match[1]!=='new'?'?product='+encodeURIComponent(match[1]):'');link.style.cssText='display:inline-block;margin:8px 0 16px;color:#591d20;font:14px Arial';heading.after(link);
      const bulk=document.createElement('a');bulk.href='/admin/product-bulk';bulk.textContent='Upload products in bulk →';bulk.style.cssText='display:inline-block;margin:8px 16px;color:#591d20;font:14px Arial';link.after(bulk);
    }
    for(const a of document.querySelectorAll('a[href^="/admin/orders/"]')){
      const match=a.getAttribute('href').match(/^\/admin\/orders\/([^/?#]+)$/);if(!match||a.dataset.hidiPackingAdded)continue;
      const row=a.closest('tr');if(!row||!row.textContent.includes('CONFIRMED'))continue;
      const link=document.createElement('a');link.href='/admin/packing-scanner?order='+encodeURIComponent(decodeURIComponent(match[1]));link.textContent='Pack order';link.style.cssText='display:block;margin-top:6px;color:#591d20;font:13px Arial';a.after(link);a.dataset.hidiPackingAdded='true';
    }
    const order=path.match(/^\/admin\/orders\/([^/]+)$/);
    if(order&&heading&&!document.getElementById('hidi-packing-link')){const link=document.createElement('a');link.id='hidi-packing-link';link.textContent='Open packing scanner →';link.href='/admin/packing-scanner?order='+encodeURIComponent(decodeURIComponent(order[1]));link.style.cssText='display:inline-block;margin:8px 0 16px;color:#591d20;font:14px Arial';heading.after(link);}
  }
  let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;addTools();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',schedule,{once:true});window.addEventListener('popstate',schedule);schedule();
})();
