// First-party operational metrics; deliberately excludes all user/URL identifiers.
(() => {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true || window.__hidiRum) return;
  const path = location.pathname;
  const route = path === '/' ? 'home' : /^\/collections(?:\/|$)/.test(path) ? 'collection' : /^\/products\/[^/]+$/.test(path) ? 'product' : /^\/(about|shipping|returns|contact|lookbook)$/.test(path) ? 'information' : '';
  if (!route) return;
  window.__hidiRum = true;
  const device = matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
  const report = metric => {
    if (!['LCP', 'INP', 'CLS'].includes(metric.name)) return;
    const body = JSON.stringify({ route, device, name: metric.name, value: Math.round(metric.value * 1000) / 1000 });
    fetch('/api/hidi/performance', { method: 'POST', body, keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  };
  const script = document.createElement('script');
  script.src = '/performance/web-vitals.js?v=01b5530d2fe7';
  script.onload = () => { const v = window.hidiWebVitals; if (v) { v.onLCP(report); v.onINP(report); v.onCLS(report); } };
  document.head.append(script);
})();
