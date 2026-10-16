(() => {
  try {
    if (location.pathname !== '/') return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    window.__HidiHeroEarly = fetch('/api/hidi/hero-config', {
      cache: 'no-store', signal: controller.signal
    }).finally(() => clearTimeout(timeout)).catch(() => null);
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
