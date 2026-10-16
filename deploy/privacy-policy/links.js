// Extend only the existing footer and admin navigation; no shopping state writes.
(() => {
  // Next renders its own footer and admin links. Mutating that tree before
  // hydration changes the server HTML and can replace the account form.
  if (document.querySelector('script[src*="/_next/"]')) return;
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
  const ready = () => Boolean(document.querySelector('footer.site-footer a[data-hidi-privacy-policy]') || document.querySelector('footer.footer a[href="/privacy"]') || document.querySelector('nav[aria-label="Admin navigation"] [data-hidi-privacy-admin]'));
  // Stop after the required links exist. Observe structural insertions while
  // React mounts; carousels, card buttons and photo changes need no DOM scan.
  let observer;
  const update = () => { addLinks(); if (ready()) observer?.disconnect(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update, { once: true }); else update();
  let queued = false;
  if (!ready()) {
    observer = new MutationObserver(records => { if (queued || !records.some(record => record.addedNodes.length)) return; queued = true; queueMicrotask(() => { queued = false; update(); }); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.addEventListener('pageshow', update);
})();
