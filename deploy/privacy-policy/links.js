// Extend only the existing footer and admin navigation; no shopping state writes.
(() => {
  function addLinks() {
    const nav = document.querySelector('nav[aria-label="Admin navigation"]');
    if (nav && !nav.querySelector('[data-hidi-privacy-admin]')) {
      const link = document.createElement('a'); link.href = '/admin/privacy-policy'; link.textContent = 'Privacy policy'; link.dataset.hidiPrivacyAdmin = 'true'; nav.append(link);
    }
    const footer = document.querySelector('footer.footer');
    const bottom = footer?.querySelector('.footer-bottom > span:last-child');
    if (bottom && !bottom.querySelector('a[href="/privacy"]')) {
      const link = document.createElement('a'); link.href = '/privacy'; link.textContent = 'Privacy policy'; bottom.append(' · ', link);
    }
    const landing = document.querySelector('footer.site-footer');
    const oldButton = [...(landing?.querySelectorAll('button') || [])].find(button => button.textContent.trim().toLowerCase() === 'privacy policy');
    if (oldButton && !landing.querySelector('a[data-hidi-privacy-policy]')) {
      const link = document.createElement('a'); link.href = '/privacy'; link.textContent = 'Privacy policy'; link.className = oldButton.className; link.dataset.hidiPrivacyPolicy = 'true';
      oldButton.before(link); oldButton.hidden = true; oldButton.style.display = 'none';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLinks, { once: true }); else addLinks();
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; addLinks(); }); }).observe(document.documentElement, { childList: true, subtree: true });
})();
