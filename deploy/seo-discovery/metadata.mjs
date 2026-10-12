import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import publishedProductImages from './published-product-images.json' with {type: 'json'};
const publishedProductImagePaths = new Set(publishedProductImages);
export function isPublishedProductImage(pathname) { return publishedProductImagePaths.has(pathname); }
export function shouldIndexPublishedImage(status, contentType, hostname, pathname) {
  return status === 200 && /^image\/(?:jpeg|png|webp|avif)(?:;|$)/i.test(contentType)
    && ['hidiindia.com', 'www.hidiindia.com'].includes(hostname) && isPublishedProductImage(pathname);
}
export const canonicalOrigin = 'https://hidiindia.com';
const legacyHosts = new Set(['thehidi.com', 'www.thehidi.com', 'thidigk.thehidi.com', 'azure-preview.thehidi.com', 'www.hidiindia.com', 'localhost', '127.0.0.1']);
const identityKeys = new Set(['@id', 'url', 'logo', 'image', 'item', 'contentUrl']);

// These describe existing public destinations only. No stock, price, composition,
// service promises or unverified brand associations are introduced.
export const routeSearchMetadata = {
  '/': {title: 'HIDI India | Women’s Indian Wear and Kurta Sets', description: 'Explore HIDI women’s Indian wear for work, everyday dressing and occasions. Browse kurta sets, product details and size information.'},
  '/collections/all': {title: 'Women’s Kurta Sets & Indian Wear | HIDI India', description: 'Browse HIDI women’s kurta sets and Indian wear across work, casual and occasion edits. Compare product details, current prices and size information.'},
  '/collections/work-wear': {title: 'Work Wear Kurta Sets for Women | HIDI India', description: 'Explore HIDI’s Work Wear edit of women’s kurta sets. Compare product details, current prices and size information for your working wardrobe.'},
  '/collections/casual-wear': {title: 'Casual Wear Kurta Sets for Women | HIDI India', description: 'Browse HIDI’s Casual Wear edit of women’s kurta sets and Indian wear. Explore printed and embroidered styles, product details and size information.'},
  '/collections/occasional-wear': {title: 'Occasion Wear Kurta Sets for Women | HIDI India', description: 'Explore HIDI’s Occasional Wear edit of kurta and Anarkali sets. Compare styles, garment details, current prices and size information.'},
  '/collections/ananyas-pick': {title: 'Ananya’s Pick: Women’s Indian Wear | HIDI India', description: 'Discover Ananya’s Pick at HIDI, an edit of women’s Indian wear. Browse selected styles and check garment details, current prices and size information.'},
};

function escapeMetadata(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function applySearchMetadata(head, metadata) {
  if (!metadata || /<title\b[^>]*>\s*(?:404\b|not found)/i.test(head)) return head;
  const seen = new Set();
  return head.replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/gi, (_, open, close) => open + escapeMetadata(metadata.title) + close)
    .replace(/<meta\b[^>]*>/gi, tag => {
      const field = /\b(?:name|property)\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]?.toLowerCase();
      const value = ['og:title', 'twitter:title'].includes(field) ? metadata.title
        : ['description', 'og:description', 'twitter:description'].includes(field) ? metadata.description : null;
      if (value === null) return tag;
      if (seen.has(field)) return '';
      seen.add(field);
      return tag.replace(/\bcontent\s*=\s*(["'])(.*?)\1/i, (_, quote) => 'content=' + quote + escapeMetadata(value).replace(/'/g, '&#39;') + quote);
    });
}

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
    const metadata = !privatePage && !failedPage ? routeSearchMetadata[path] : null;
    if (metadata) {
      if (document.title !== metadata.title) document.title = metadata.title;
      // Preserve the newest framework-owned head node. Earlier duplicate metadata
      // can be left by the retained Next build during streaming and navigation.
      for (const selector of ['meta[name="description"]','meta[property="og:title"]','meta[name="twitter:title"]','meta[property="og:description"]','meta[name="twitter:description"]']) {
        const nodes = [...document.head.querySelectorAll(selector)];
        for (const node of nodes.slice(0, -1)) node.remove();
      }
      for (const node of document.head.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]')) {
        if (node.content !== metadata.description) node.content = metadata.description;
      }
      for (const node of document.head.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]')) {
        if (node.content !== metadata.title) node.content = metadata.title;
      }
    }
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
  const selector='title,script[type="application/ld+json"],link[rel="canonical"],meta[name="robots"],meta[property="og:url"],meta[property="og:image"],meta[name="twitter:image"],meta[name="description"],meta[property="og:title"],meta[name="twitter:title"],meta[property="og:description"],meta[name="twitter:description"]';
  const relevant=node => {
    const element = node?.nodeType===3 ? node.parentElement : node;
    return element?.nodeType===1 && (element.matches(selector) || element.querySelector(selector));
  };
  new MutationObserver(changes=>{
    if(changes.some(change=>relevant(change.target) || [...change.addedNodes,...change.removedNodes].some(relevant))) schedule();
  }).observe(document.documentElement, {subtree:true,childList:true,attributes:true,characterData:true,attributeFilter:['href','content','type','name','property']});
  window.addEventListener('popstate', schedule);
  document.addEventListener('DOMContentLoaded', schedule, {once:true});
  reconcile();
}

export const clientMetadataScript = '<script data-hidi-seo-identity="1">' +
  '(()=>{const canonicalOrigin=' + JSON.stringify(canonicalOrigin) +
  ';const legacyHosts=new Set(' + JSON.stringify([...legacyHosts]) +
  ');const identityKeys=new Set(' + JSON.stringify([...identityKeys]) +
  ');const routeSearchMetadata=' + JSON.stringify(routeSearchMetadata) +
  ';' + identityUrl.toString() + normalizeGraph.toString() + '(' + guardMetadata.toString() + ')();})();</script>';

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
export function normalizeSeoIdentity(html, pathname) {
  const boundary = html.search(/<\/head>/i);
  if (boundary < 0) return html;
  const head = applySearchMetadata(normalizeJsonLd(html.slice(0, boundary)), routeSearchMetadata[pathname])
    .replace(/<meta\b[^>]*(?:property=["']og:image["']|name=["']twitter:image["'])[^>]*>/gi, tag =>
      tag.replace(/\bcontent=(["'])(.*?)\1/i, (match, quote, url) => 'content=' + quote + identityUrl(url) + quote));
  return head + html.slice(boundary);
}
