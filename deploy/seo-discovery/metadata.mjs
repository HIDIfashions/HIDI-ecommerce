import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
export const canonicalOrigin = 'https://hidiindia.com';
const legacyHosts = new Set(['thehidi.com', 'www.thehidi.com', 'thidigk.thehidi.com', 'azure-preview.thehidi.com', 'www.hidiindia.com', 'localhost', '127.0.0.1']);
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
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const value = JSON.stringify(normalizeGraph(JSON.parse(node.textContent))).replace(/</g, '\\u003c');
        if (value !== node.textContent) node.textContent = value;
      } catch { /* Existing malformed markup is left untouched for the audit. */ }
    }
  }
  function schedule() { if (!scheduled) { scheduled = true; queueMicrotask(reconcile); } }
  const selector='script[type="application/ld+json"],link[rel="canonical"],meta[name="robots"],meta[property="og:url"],meta[property="og:image"],meta[name="twitter:image"]';
  const relevant=node => node?.nodeType===1 && (node.matches(selector) || node.querySelector(selector));
  new MutationObserver(changes=>{
    if(changes.some(change=>relevant(change.target) || [...change.addedNodes,...change.removedNodes].some(relevant))) schedule();
  }).observe(document.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:['href','content','type']});
  window.addEventListener('popstate', schedule);
  document.addEventListener('DOMContentLoaded', schedule, {once:true});
  reconcile();
}

export const clientMetadataScript = '<script data-hidi-seo-identity="1">' +
  '(()=>{const canonicalOrigin=' + JSON.stringify(canonicalOrigin) +
  ';const legacyHosts=new Set(' + JSON.stringify([...legacyHosts]) +
  ');const identityKeys=new Set(' + JSON.stringify([...identityKeys]) +
  ');' + identityUrl.toString() + normalizeGraph.toString() + '(' + guardMetadata.toString() + ')();})();</script>';

function normalizeJsonLd(html) {
  return html.replace(/<script\b([^>]*\btype=["']application\/ld\+json["'][^>]*)>([\s\S]*?)<\/script>/gi, (tag,attrs,json)=>{
    try { return '<script'+attrs+'>'+JSON.stringify(normalizeGraph(JSON.parse(json))).replace(/</g,'\\u003c')+'</script>'; }
    catch { return tag; }
  });
}

/** Bound streaming buffering to JSON-LD only; original visible markup and UTF-8 are retained. */
export function seoIdentityTransform() {
  const decoder=new StringDecoder('utf8');let pending='';
  function consume(stream,text,final=false) {
    pending+=text;
    while(pending) {
      const start=/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>/i.exec(pending);
      if(start) {
        if(start.index){stream.push(pending.slice(0,start.index));pending=pending.slice(start.index);}
        const end=/<\/script\s*>/i.exec(pending);
        if(end){const cut=end.index+end[0].length;stream.push(normalizeJsonLd(pending.slice(0,cut)));pending=pending.slice(cut);continue;}
        if(!final && pending.length<262144)return;
        stream.push(pending);pending='';return;
      }
      let cut=final?pending.length:pending.length-1024;
      if(cut<=0)return;
      const code=pending.charCodeAt(cut);if(code>=0xDC00&&code<=0xDFFF)cut--;
      stream.push(pending.slice(0,cut));pending=pending.slice(cut);
      if(!final)return;
    }
  }
  return new Transform({transform(chunk,encoding,done){try{consume(this,decoder.write(chunk));done();}catch(error){done(error);}},flush(done){try{consume(this,decoder.end(),true);done();}catch(error){done(error);}}});
}

export function createSeoIdentityStream(incoming) {
  const transformed=seoIdentityTransform();
  incoming.on('error',error=>transformed.destroy(error));
  transformed.on('close',()=>{if(!incoming.readableEnded)incoming.destroy();});
  return incoming.pipe(transformed);
}

/** Transform machine-readable head fields only; keep body, assets and commerce scripts byte-identical. */
export function normalizeSeoIdentity(html) {
  const boundary = html.search(/<\/head>/i);
  if (boundary < 0) return html;
  const head = normalizeJsonLd(html.slice(0, boundary))
    .replace(/<meta\b[^>]*(?:property=["']og:image["']|name=["']twitter:image["'])[^>]*>/gi, tag =>
      tag.replace(/\bcontent=(["'])(.*?)\1/i, (match, quote, url) => 'content=' + quote + identityUrl(url) + quote));
  return head + html.slice(boundary);
}
