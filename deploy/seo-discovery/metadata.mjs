import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import publishedProductImages from './published-product-images.json' with {type: 'json'};
const publishedProductImagePaths = new Set(publishedProductImages);
export function isPublishedProductImage(pathname) { return publishedProductImagePaths.has(pathname); }
// The sitemap already reads the public catalogue. Refresh image eligibility from
// that same approved data so future uploads do not depend on a stale snapshot.
export function registerPublishedProductImages(products) {
  if (!Array.isArray(products)) return 0;
  const origins = new Set(['https://hidiindia.com','https://www.hidiindia.com','https://thehidi.com','https://www.thehidi.com','https://thidigk.thehidi.com']);
  let added=0;
  for (const product of products) {
    if (!product || product.status && product.status !== 'ACTIVE' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug || '')) continue;
    const records=[...(Array.isArray(product.images)?product.images:[]),...(Array.isArray(product.variants)?product.variants.flatMap(v=>Array.isArray(v.images)?v.images:[]):[])];
    for (const image of records) {
      if (typeof image?.url !== 'string') continue;
      try {
        const url=new URL(image.url,'https://hidiindia.com');
        if (!origins.has(url.origin) || url.username || url.password || url.search || url.hash || !/^\/media\/products\/(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname)) continue;
        if (!publishedProductImagePaths.has(url.pathname)) {publishedProductImagePaths.add(url.pathname);added++;}
      } catch { /* Unknown references remain restricted. */ }
    }
  }
  return added;
}
export function shouldIndexPublishedImage(status, contentType, hostname, pathname) {
  const cachedType = status === 304 && !contentType;
  const productImage = (/^image\/(?:jpeg|png|webp|avif)(?:;|$)/i.test(contentType) || cachedType) && isPublishedProductImage(pathname);
  // The existing Organization graph names this verified, public brand logo.
  const brandLogo = pathname === '/brand/hidi-logo-header.svg' && (/^image\/svg\+xml(?:;|$)/i.test(contentType) || cachedType);
  return [200,304].includes(status) && hostname === 'hidiindia.com' && (productImage || brandLogo);
}
export const canonicalOrigin = 'https://hidiindia.com';
const legacyHosts = new Set(['thehidi.com', 'www.thehidi.com', 'thidigk.thehidi.com', 'azure-preview.thehidi.com', 'www.hidiindia.com', 'localhost', '127.0.0.1']);
const identityKeys = new Set(['@id', 'url', 'logo', 'image', 'item', 'contentUrl']);
const canonicalRedirectExclusions = ['/api', '/v1', '/admin', '/account', '/cart', '/checkout', '/order-confirmed', '/wishlist', '/search', '/review'];
export const verifiedBrandProfiles = Object.freeze([
  'https://www.instagram.com/hidiindia/',
  'https://www.facebook.com/profile.php?id=61594615364935',
  'https://x.com/Hidiindia',
  'https://www.youtube.com/@Hidiindia',
]);
export const brandDescription = 'HIDI is an Indian women’s wear brand offering kurta sets for work, everyday dressing and occasions.';

function requestHostname(request) {
  const forwarded = String(request?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const raw = forwarded || String(request?.headers?.host || '').trim();
  try { return new URL('https://' + raw).hostname.toLowerCase(); }
  catch { return raw.replace(/:\d+$/, '').toLowerCase(); }
}

// Collapse public aliases for navigational requests before page routing. Mutating
// requests and API traffic stay on the existing path so commerce integrations
// and callbacks retain their current behavior.
export function handleCanonicalHostRedirect(request, response) {
  if (!['www.hidiindia.com', 'thehidi.com', 'www.thehidi.com'].includes(requestHostname(request))) return false;
  const method = String(request?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return false;
  const target = new URL(request?.url || '/', canonicalOrigin);
  if (canonicalRedirectExclusions.some(prefix => target.pathname === prefix || target.pathname.startsWith(prefix + '/'))) return false;
  response.writeHead(308, {
    location: canonicalOrigin + target.pathname + target.search,
    'cache-control': 'public, max-age=3600',
  });
  response.end();
  return true;
}

// These describe existing public destinations only. No stock, price, composition,
// service promises or unverified brand associations are introduced.
export const routeSearchMetadata = {
  '/': {title: 'HIDI India Official Store | Women’s Kurta Sets', description: 'Shop the official HIDI India store. Introduced by Ananya Nagalla, HIDI offers women’s kurta sets and Indian wear for work, everyday dressing and occasions.'},
  '/collections/all': {title: 'Women’s Kurta Sets & Indian Wear | HIDI India', description: 'Browse HIDI women’s kurta sets and Indian wear across work, casual and occasion edits. Compare product details, current prices and size information.'},
  '/collections/work-wear': {title: 'Work Wear Kurta Sets for Women | HIDI India', description: 'Explore HIDI’s Work Wear edit of women’s kurta sets. Compare product details, current prices and size information for your working wardrobe.'},
  '/collections/casual-wear': {title: 'Casual Wear Kurta Sets for Women | HIDI India', description: 'Browse HIDI’s Casual Wear edit of women’s kurta sets and Indian wear. Explore printed and embroidered styles, product details and size information.'},
  '/collections/occasional-wear': {title: 'Occasion Wear Kurta Sets for Women | HIDI India', description: 'Explore HIDI’s Occasional Wear edit of kurta and Anarkali sets. Compare styles, garment details, current prices and size information.'},
  '/collections/ananyas-pick': {title: 'Ananya’s Pick: Women’s Indian Wear | HIDI India', description: 'Discover Ananya’s Pick at HIDI, an edit of women’s Indian wear. Browse selected styles and check garment details, current prices and size information.'},
  '/about': {title: 'About HIDI & Ananya Nagalla | HIDI India', description: 'Introduced by actress Ananya Nagalla, HIDI offers women’s Indian wear for work, everyday dressing and occasions. Discover HIDI India.'},
  '/shipping': {title: 'Shipping Policy | HIDI', description: 'Read HIDI’s shipping policy, including delivery information and order support. Check the current policy before placing your order.'},
  '/returns': {title: 'Returns & Exchanges | HIDI', description: 'Read HIDI’s returns and exchanges policy. Review eligibility, the process and support information before placing your order.'},
  '/contact': {title: 'Contact HIDI India | Official Store Support', description: 'Contact HIDI India for product questions and order support. Find our official email, telephone, WhatsApp and Hyderabad contact address.'},
  '/offers': {title: 'HIDI Privileges | HIDI', description: 'Explore HIDI’s current offers and privileges. Review the published terms and eligibility information before choosing an offer.'},
};

// Restore the already-published metadata of the destination product when the
// framework reuses cached head nodes during back/forward navigation.
export function productRouteMetadata(values, pathname) {
  if (!/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) return null;
  function find(value) {
    if (Array.isArray(value)) {
      for (const item of value) { const result = find(item); if (result) return result; }
    } else if (value && typeof value === 'object') {
      if (value['@type'] === 'Product' && identityUrl(value.url) === canonicalOrigin + pathname
        && typeof value.name === 'string' && typeof value.description === 'string') {
        return {title: value.name + ' | HIDI', socialTitle: value.name, description: value.description};
      }
      if (value['@graph']) return find(value['@graph']);
    }
    return null;
  }
  return find(values);
}

function escapeMetadata(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function applySearchMetadata(head, metadata) {
  if (!metadata || /<title\b[^>]*>\s*(?:404\b|not found)/i.test(head)) return head;
  return head.replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/gi, (_, open, close) => {
    return open + escapeMetadata(metadata.title) + close;
  })
    .replace(/<meta\b[^>]*>/gi, tag => {
      const field = /\b(?:name|property)\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]?.toLowerCase();
      const value = ['og:title', 'twitter:title'].includes(field) ? metadata.title
        : ['description', 'og:description', 'twitter:description'].includes(field) ? metadata.description
        : field === 'og:site_name' ? 'HIDI India' : null;
      if (value === null) return tag;
      return tag.replace(/\bcontent\s*=\s*(["'])(.*?)\1/i, (_, quote) => 'content=' + quote + escapeMetadata(value).replace(/'/g, '&#39;') + quote);
    });
}

// A crawler-specific restriction overrides the general robots allowance.
// Correct the retained build's Google tag before Google decides whether to render.
function normalizeGoogleDirective(head, pathname) {
  if (!pathname || /<title\b[^>]*>\s*(?:404\b|not found)/i.test(head)) return head;
  const publicPage = Object.hasOwn(routeSearchMetadata, pathname) || /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname);
  if (!publicPage && pathname !== '/lookbook') return head;
  const value = pathname === '/lookbook' ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  return head.replace(/<meta\b[^>]*>/gi, tag => {
    if (/\bname\s*=\s*(["'])googlebot\1/i.test(tag)) {
      return tag.replace(/\bcontent\s*=\s*(["'])(.*?)\1/i, (_, quote) => 'content=' + quote + value + quote);
    }
    return tag;
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

function normalizeGraph(value, key = '', brandHead = false) {
  if (Array.isArray(value)) return value.map(item => normalizeGraph(item, key, brandHead));
  if (value && typeof value === 'object') {
    const graph = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeGraph(v, k, brandHead)]));
    // Align the existing public HIDI identity, without introducing another graph,
    // a founder assertion, unverified profiles or changes to garment records.
    if (brandHead && ['HIDI', 'HIDI India'].includes(graph.name) && [canonicalOrigin, canonicalOrigin + '/'].includes(graph.url)) {
      if (graph['@type'] === 'Organization') {
        if ([canonicalOrigin + '/assets/images/hidi-logo.png', canonicalOrigin + '/brand/hidi-logo-header.svg'].includes(graph.logo)) {
          graph.logo = canonicalOrigin + '/brand/hidi-logo-header.svg';
        }
        // These are the existing official HIDI channels. Ananya's personal
        // account remains a separate entity and is deliberately not included.
        const profiles = graph.sameAs === undefined ? [] : Array.isArray(graph.sameAs) ? graph.sameAs : [graph.sameAs];
        graph.sameAs = [...new Set([...profiles, ...verifiedBrandProfiles])];
        if (graph.alternateName === undefined) graph.alternateName = 'HIDI India';
        else if (Array.isArray(graph.alternateName)) {
          if (!graph.alternateName.includes('HIDI India')) graph.alternateName = [...graph.alternateName, 'HIDI India'];
        } else if (typeof graph.alternateName === 'string' && graph.alternateName !== 'HIDI India') {
          graph.alternateName = [graph.alternateName, 'HIDI India'];
        }
        if (graph.description === undefined) graph.description = brandDescription;
        // Public customer-service details from /contact; this is a contact
        // address, not an assertion that customers can visit a retail store.
        graph.email = 'Contact@hidiindia.com';
        graph.telephone = '+917093709353';
        graph.address = {'@type':'PostalAddress', streetAddress:'Flat No. 704, Hyma Arcade Khanamet, Ayyappa Society, Madhapur', addressLocality:'Hyderabad', addressRegion:'Telangana', postalCode:'500081', addressCountry:'IN'};
        graph.contactPoint = {'@type':'ContactPoint', contactType:'customer service', email:graph.email, telephone:graph.telephone, url:canonicalOrigin + '/contact'};
      }
      if (graph['@type'] === 'WebSite') {
        graph.name = 'HIDI India';
        const aliases = Array.isArray(graph.alternateName) ? graph.alternateName : typeof graph.alternateName === 'string' ? [graph.alternateName] : [];
        graph.alternateName = [...new Set([...aliases.filter(name => name !== 'HIDI India'), 'HIDI', 'hidiindia.com'])];
      }
    }
    return graph;
  }
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
    const deferredPage = path === '/lookbook';
    const publicPage = publicRoutes.has(path) || /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
    const failedPage = /^404\b/i.test(document.title) || /\bnot found\b/i.test(document.title);
    let metadata = !privatePage && !failedPage ? routeSearchMetadata[path] : null;
    if (!metadata && !privatePage && !failedPage && /^\/products\//.test(path)) {
      const values = [];
      for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {values.push(JSON.parse(node.textContent));} catch { /* Leave malformed data for the audit. */ }
      }
      metadata = productRouteMetadata(values, path);
    }
    if (metadata) {
      for (const node of document.head.querySelectorAll('meta[property="og:site_name"]')) {
        if (node.content !== 'HIDI India') node.content = 'HIDI India';
      }
      // The retained framework caches references to these nodes. Preserve node
      // and text-node identities; reconcile every copy instead of removing one.
      const titles = [...document.head.querySelectorAll('title')];
      if (!titles.length) document.title = metadata.title;
      for (const node of titles) {
        if (node.textContent === metadata.title) continue;
        const texts = [...node.childNodes].filter(child => child.nodeType === 3);
        if (texts.length) {
          texts[0].nodeValue = metadata.title;
          for (const text of texts.slice(1)) text.nodeValue = '';
        } else node.appendChild(document.createTextNode(metadata.title));
      }
      for (const node of document.head.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]')) {
        if (node.content !== metadata.description) node.content = metadata.description;
      }
      for (const node of document.head.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]')) {
        const title = metadata.socialTitle || metadata.title;
        if (node.content !== title) node.content = title;
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
    const directive = privatePage || failedPage ? 'noindex, nofollow, noarchive' : deferredPage ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
    // Cached framework navigation can remove the wrapper's general directive.
    // Restore only a missing SEO node; never remove or replace framework nodes.
    if ((privatePage || publicPage || deferredPage) && !document.head.querySelectorAll('meta[name="robots"]').length) {
      const node = document.createElement('meta');
      node.name = 'robots'; node.content = directive;
      document.head.appendChild(node);
    }
    for (const node of document.head.querySelectorAll('meta[name="robots"],meta[name="googlebot"]')) {
      if (!privatePage && !publicPage && !deferredPage) continue;
      if (node.content !== directive) node.content = directive;
    }
    for (const node of document.head.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')) {
      const value = identityUrl(node.content);
      if (value !== node.content) node.content = value;
    }
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const brandPage = path === '/' || path === '/about';
        const inHead = typeof document.head.contains === 'function' && document.head.contains(node);
        const value = JSON.stringify(normalizeGraph(JSON.parse(node.textContent), '', inHead || brandPage)).replace(/</g, '\\u003c');
        if (value !== node.textContent) node.textContent = value;
      } catch { /* Existing malformed markup is left untouched for the audit. */ }
    }
  }
  function schedule() { if (!scheduled) { scheduled = true; queueMicrotask(reconcile); } }
  const selector='title,script[type="application/ld+json"],link[rel="canonical"],meta[name="robots"],meta[name="googlebot"],meta[property="og:url"],meta[property="og:image"],meta[name="twitter:image"],meta[name="description"],meta[property="og:title"],meta[name="twitter:title"],meta[property="og:description"],meta[name="twitter:description"]';
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
  ');const verifiedBrandProfiles=' + JSON.stringify(verifiedBrandProfiles) +
  ';const brandDescription=' + JSON.stringify(brandDescription) +
  ';const routeSearchMetadata=' + JSON.stringify(routeSearchMetadata) +
  ';' + identityUrl.toString() + normalizeGraph.toString() + productRouteMetadata.toString() + '(' + guardMetadata.toString() + ')();})();</script>';

function normalizeJsonLd(html, brandHead = false) {
  return html.replace(/<script\b([^>]*\btype=["']application\/ld\+json["'][^>]*)>([\s\S]*?)<\/script>/gi, (tag,attrs,json)=>{
    try { return '<script'+attrs+'>'+JSON.stringify(normalizeGraph(JSON.parse(json), '', brandHead)).replace(/</g,'\\u003c')+'</script>'; }
    catch { return tag; }
  });
}

/** Bound streaming buffering to JSON-LD only; original visible markup and UTF-8 are retained. */
export function seoIdentityTransform(pathname) {
  const brandPage = pathname === '/' || pathname === '/about';
  const decoder=new StringDecoder('utf8');let pending='';
  function consume(stream,text,final=false) {
    pending+=text;
    while(pending) {
      const start=/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>/i.exec(pending);
      if(start) {
        if(start.index){stream.push(pending.slice(0,start.index));pending=pending.slice(start.index);}
        const end=/<\/script\s*>/i.exec(pending);
        if(end){const cut=end.index+end[0].length;stream.push(normalizeJsonLd(pending.slice(0,cut),brandPage));pending=pending.slice(cut);continue;}
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

export function createSeoIdentityStream(incoming, pathname) {
  const transformed=seoIdentityTransform(pathname);
  incoming.on('error',error=>transformed.destroy(error));
  transformed.on('close',()=>{if(!incoming.readableEnded)incoming.destroy();});
  return incoming.pipe(transformed);
}

/** Transform machine-readable head fields only; keep body, assets and commerce scripts byte-identical. */
export function normalizeSeoIdentity(html, pathname) {
  const boundary = html.search(/<\/head>/i);
  if (boundary < 0) return html;
  const head = normalizeGoogleDirective(applySearchMetadata(normalizeJsonLd(html.slice(0, boundary), true), routeSearchMetadata[pathname]), pathname)
    .replace(/<meta\b[^>]*(?:property=["']og:image["']|name=["']twitter:image["'])[^>]*>/gi, tag =>
      tag.replace(/\bcontent=(["'])(.*?)\1/i, (match, quote, url) => 'content=' + quote + identityUrl(url) + quote));
  return head + html.slice(boundary);
}
