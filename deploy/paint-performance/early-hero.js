(() => {
  try {
    if (location.pathname !== '/') return;
    const read = path => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      return fetch(path, { cache: 'no-store', signal: controller.signal })
        .finally(() => clearTimeout(timeout)).catch(() => null);
    };
    window.__HidiHeroEarly = read('/api/hidi/hero-config');
    window.__HidiLandingEarly = read('/api/hidi/landing-media-config');
    window.__HidiCatalogueEarly = read('/api/store/products');
  } catch { /* The normal component request remains the fallback. */ }
})();

(() => {
  if (location.pathname !== '/') return;
  window.__HidiAvifSupport = new Promise(resolve => {
    try {
      const image = new Image();
      const timer = setTimeout(() => resolve(false), 500);
      image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth > 0); };
      image.onerror = () => { clearTimeout(timer); resolve(false); };
      image.src = 'data:image/avif;base64,__AVIF_PROBE__';
    } catch { resolve(false); }
  });
})();
