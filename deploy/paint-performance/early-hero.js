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

// Keep the native poster visible for a paint before React takes over the hero.
// Decode completion drives the handoff; a deadline retains interactivity on error.
(() => {
  if (location.pathname !== '/') return;
  window.__HidiWaitForPosterPaint = video => {
    if (!video?.poster || document.visibilityState === 'hidden') return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(finish, 1200);
      try {
        const image = new Image();
        image.src = video.poster;
        image.decode().then(() => {
          if (settled) return;
          if (document.visibilityState === 'hidden') finish();
          else requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(finish, 0)));
        }, finish);
      } catch { finish(); }
    });
  };
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
