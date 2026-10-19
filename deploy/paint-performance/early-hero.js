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
    const pending = [];
    const later = path => new Promise(resolve => pending.push(() => resolve(read(path))));
    window.__HidiLandingEarly = later('/api/hidi/landing-media-config');
    window.__HidiCatalogueEarly = later('/api/store/products');
    let started = false;
    window.__HidiStartHomeReads = () => {
      if (started) return;
      started = true; clearTimeout(deadline);
      for (const start of pending) start();
    };
    const deadline = setTimeout(window.__HidiStartHomeReads, 1500);
    if (typeof document !== 'undefined') {
      const fallback = () => { if (document.readyState !== 'loading' && !document.querySelector('video[data-hidi-first-hero]')) window.__HidiStartHomeReads(); };
      document.addEventListener('readystatechange', fallback);
      fallback();
    }
  } catch { /* The normal component request remains the fallback. */ }
})();

// Keep the native poster visible for a paint before React takes over the hero.
// Decode completion drives the handoff; a deadline retains interactivity on error.
(() => {
  if (location.pathname !== '/') return;
  window.__HidiWaitForPosterPaint = video => {
    window.__HidiNativePosterPaint = null;
    const release = () => { window.__HidiStartHomeReads?.(); window.__HidiLoadFullCss?.(); };
    if (!video?.poster || document.visibilityState === 'hidden') { release(); return Promise.resolve(); }
    return new Promise(resolve => {
      let settled = false, observer = null;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); observer?.disconnect(); release(); resolve(); };
      const timer = setTimeout(finish, 1200);
      // When supported, a real native-poster paint is stronger evidence than
      // waiting an extra frame. Phones and unsupported engines keep the exact
      // decode + double-frame fallback; the deadline is unchanged.
      try {
        if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint') && typeof matchMedia === 'function' && !matchMedia('(max-width: 700px)').matches) {
          observer = new PerformanceObserver(list => {
            if (settled) return;
            for (const entry of list.getEntries()) {
              if (entry.element !== video) continue;
              // A bounded handoff is not proof of paint. Only this native
              // poster's positive render timestamp can accelerate its video.
              if (video.isConnected && video.matches?.('video[data-hidi-first-hero]') &&
                  Number.isFinite(entry.renderTime) && entry.renderTime > 0 &&
                  entry.url === video.poster) {
                window.__HidiNativePosterPaint = { video, poster: video.poster, renderTime: entry.renderTime };
              }
              finish();
              break;
            }
          });
          observer.observe({ type: 'largest-contentful-paint', buffered: true });
          // The video decodes its poster itself. A second Image decoder competes
          // with that paint and is unnecessary when the paint is observable.
          return;
        }
      } catch { observer = null; }
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
  // Preserve source pixels: only off-screen sides of a centred wide frame are removed.
  window.__HidiAvifPoster = (variant,position='50% 50%') => {
    const crop=variant.posterCrop,video=document.querySelector('video.hero-live-media'),rect=video?.getBoundingClientRect();
    const centred=String(position||'50% 50%').trim().replace(/\s+/g,' ')==='50% 50%';
    return variant.avifPosterSmall&&crop&&centred&&matchMedia(crop?.sourceWidth===1920?'(min-width: 701px) and (max-aspect-ratio: 40/27)':'(max-width: 432px) and (min-height: 760px)').matches&&rect?.height>0&&rect.width/rect.height<=crop.width/crop.height ? variant.avifPosterSmall : variant.avifPoster;
  };
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
