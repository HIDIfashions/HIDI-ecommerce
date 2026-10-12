export const canonicalOrigin = 'https://hidiindia.com';
const legacyHosts = new Set(['thehidi.com', 'www.thehidi.com', 'thidigk.thehidi.com', 'azure-preview.thehidi.com', 'www.hidiindia.com']);
const identityKeys = new Set(['@id', 'url', 'logo', 'image', 'item', 'contentUrl']);

export function identityUrl(value) {
  if (typeof value !== 'string') return value;
  try {
    const url = new URL(value);
    return legacyHosts.has(url.hostname) && ['http:', 'https:'].includes(url.protocol)
      ? canonicalOrigin + url.pathname + url.search + url.hash : value;
  } catch { return value; }
}

function normalizeGraph(value, key = '') {
  if (Array.isArray(value)) return value.map(item => normalizeGraph(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeGraph(v, k)]));
  return identityKeys.has(key) ? identityUrl(value) : value;
}

// React's retained build can recreate its old head fields during hydration/navigation.
// This guard edits only machine-readable fields, with no body or interaction changes.
function guardMetadata() {
  if (window.__hidiSeoIdentityGuard) return;
  window.__hidiSeoIdentityGuard = true;
  const privatePrefixes = ['/admin','/account','/cart','/checkout','/order-confirmed','/wishlist','/search','/review'];
  const publicRoutes = new Set(['/','/collections/all','/collections/work-wear','/collections/casual-wear','/collections/occasional-wear','/collections/ananyas-pick','/about','/shipping','/returns','/contact','/offers']);
  let scheduled = false;
  function reconcile() {
    scheduled = false;
    const path = location.pathname;
    const privatePage = privatePrefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'));
    const publicPage = publicRoutes.has(path) || /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
    const failedPage = /^404\b|not found/i.test(document.title);
    for (const node of document.head.querySelectorAll('link[rel="canonical"]')) {
      const url = canonicalOrigin + path;
      if (node.getAttribute('href') !== url) node.setAttribute('href', url);
    }
    for (const node of document.head.querySelectorAll('meta[property="og:url"]')) {
      const url = canonicalOrigin + path;
      if (node.content !== url) node.content = url;
    }
    for (const node of document.head.querySelectorAll('meta[name="robots"]')) {
      if (!privatePage && !publicPage) continue;
      const value = privatePage || failedPage ? 'noindex, nofollow, noarchive' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
      if (node.content !== value) node.content = value;
    }
    for (const node of document.head.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')) {
      const value = identityUrl(node.content);
      if (value !== node.content) node.content = value;
    }
    for (const node of document.head.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const value = JSON.stringify(normalizeGraph(JSON.parse(node.textContent))).replace(/</g, '\\u003c');
        if (value !== node.textContent) node.textContent = value;
      } catch { /* Existing malformed markup is left untouched for the audit. */ }
    }
  }
  function schedule() { if (!scheduled) { scheduled = true; queueMicrotask(reconcile); } }
  new MutationObserver(schedule).observe(document.head, {subtree:true, childList:true, attributes:true, characterData:true});
  window.addEventListener('popstate', schedule);
  document.addEventListener('DOMContentLoaded', schedule, {once:true});
  reconcile();
}

export const clientMetadataScript = '<script data-hidi-seo-identity="1">' +
  '(()=>{const canonicalOrigin=' + JSON.stringify(canonicalOrigin) +
  ';const legacyHosts=new Set(' + JSON.stringify([...legacyHosts]) +
  ');const identityKeys=new Set(' + JSON.stringify([...identityKeys]) +
  ');' + identityUrl.toString() + normalizeGraph.toString() + '(' + guardMetadata.toString() + ')();})();</script>';

/** Transform machine-readable head fields only; keep body, assets and commerce scripts byte-identical. */
export function normalizeSeoIdentity(html) {
  const boundary = html.search(/<\/head>/i);
  if (boundary < 0) return html;
  const head = html.slice(0, boundary)
    .replace(/<script\b([^>]*\btype=["']application\/ld\+json["'][^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs, json) => {
      try { return '<script' + attrs + '>' + JSON.stringify(normalizeGraph(JSON.parse(json))).replace(/</g, '\\u003c') + '</script>'; }
      catch { return tag; }
    })
    .replace(/<meta\b[^>]*(?:property=["']og:image["']|name=["']twitter:image["'])[^>]*>/gi, tag =>
      tag.replace(/\bcontent=(["'])(.*?)\1/i, (match, quote, url) => 'content=' + quote + identityUrl(url) + quote));
  return head + html.slice(boundary);
}
