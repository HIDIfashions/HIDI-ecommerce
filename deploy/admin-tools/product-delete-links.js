(() => {
  function addLinks() {
    if (!/^\/admin\/products(?:\/[^/]+)?\/?$/.test(location.pathname)) return;
    for (const link of document.querySelectorAll('a[href^="/admin/products/"]')) {
      const match = link.getAttribute('href').match(/^\/admin\/products\/([a-zA-Z0-9_-]{1,64})$/);
      if (!match || ['new', 'price-tags', 'bulk-import'].includes(match[1])) continue;
      const row = link.closest('tr');
      if (!row || row.querySelector('[data-hidi-product-delete]')) continue;
      const button = document.createElement('a'); button.href = '/admin/product-delete?product=' + encodeURIComponent(match[1]); button.textContent = 'Delete'; button.dataset.hidiProductDelete = match[1];
      button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:7px 12px;margin:5px;border:1px solid #a94444;border-radius:7px;color:#922d2d;background:#fff;font:13px Arial;text-decoration:none';
      button.setAttribute('aria-label', 'Delete product ' + (row.querySelector('strong')?.textContent || match[1]));
      const cell = row.lastElementChild; if (cell) cell.append(button);
    }
    const match = location.pathname.match(/^\/admin\/products\/([a-zA-Z0-9_-]{1,64})\/?$/);
    const heading = document.querySelector('main h1');
    if (match && !['new', 'price-tags', 'bulk-import'].includes(match[1]) && heading && !document.getElementById('hidi-delete-product-editor')) {
      const link = document.createElement('a'); link.id = 'hidi-delete-product-editor'; link.href = '/admin/product-delete?product=' + encodeURIComponent(match[1]); link.textContent = 'Delete product';
      link.style.cssText = 'display:inline-block;margin:8px 16px;color:#922d2d;font:14px Arial'; heading.after(link);
    }
  }
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; addLinks(); }); };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', schedule, { once: true }); schedule();
})();
