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
