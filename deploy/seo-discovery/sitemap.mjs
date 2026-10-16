import { canonicalOrigin, identityUrl, isPublishedProductImage, registerPublishedProductImages } from './metadata.mjs';

const routes = ['/', '/collections/all', '/collections/work-wear', '/collections/casual-wear', '/collections/occasional-wear', '/collections/ananyas-pick', '/about', '/shipping', '/returns', '/contact', '/offers', '/privacy', '/guides', '/guides/kurta-set-buying-guide', '/guides/choosing-kurta-set-size'];
const xmlEscape = text => String(text).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
// Only existing, reviewed public product assets are eligible. Do not fetch or
// invent an image, expose a signed URL, or use a photo from another product.
export function productImageUrls(product) {
  const records = [...(Array.isArray(product.images) ? product.images : []),
    ...(Array.isArray(product.variants) ? product.variants.flatMap(variant => Array.isArray(variant.images) ? variant.images : []) : [])];
  const urls = new Set();
  for (const image of records) {
    if (typeof image?.url !== 'string') continue;
    try {
      const original = new URL(image.url, canonicalOrigin);
      if (!['http:', 'https:'].includes(original.protocol) || original.username || original.password || original.search || original.hash) continue;
      const url = new URL(identityUrl(original.href));
      if (url.origin !== canonicalOrigin || !isPublishedProductImage(url.pathname)) continue;
      urls.add(url.href);
    } catch { /* Malformed/unapproved image references stay out of discovery. */ }
  }
  if (urls.size > 1000) throw new Error('Image sitemap entry exceeds 1000 images');
  return [...urls];
}
export function sitemapXml(products) {
  if (!Array.isArray(products)) throw new Error('Expected the public catalogue array');
  const paths = new Map(routes.map(path => [path, new Set()]));
  for (const product of products) {
    if (product.status && product.status !== 'ACTIVE') continue;
    if (typeof product.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) throw new Error('Invalid published slug');
    const path = '/products/' + product.slug;
    if (!paths.has(path)) paths.set(path, new Set());
    for (const image of productImageUrls(product)) paths.get(path).add(image);
    if (paths.get(path).size > 1000) throw new Error('Image sitemap entry exceeds 1000 images');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    [...paths].map(([path, images]) => '<url><loc>' + xmlEscape(canonicalOrigin + path) + '</loc>' +
      [...images].map(image => '<image:image><image:loc>' + xmlEscape(image) + '</image:loc></image:image>').join('') + '</url>').join('\n') + '\n</urlset>\n';
}

export function createSeoSitemap({ catalogueUrl, isProductionRequest, fetcher = fetch }) {
  const api = new URL(catalogueUrl);
  if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password) throw new Error('Invalid catalogue endpoint');
  let cached, expires = 0;
  return async function sendSeoSitemap(request, response) {
    if (!isProductionRequest(request)) {
      response.writeHead(404, {'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow'});
      return response.end(request.method === 'HEAD' ? undefined : 'Not found');
    }
    try {
      if (!cached || Date.now() >= expires) {
        const result = await fetcher(api, {method:'GET', signal:AbortSignal.timeout(8000), headers:{Accept:'application/json'}});
        if (!result.ok) throw new Error('Catalogue unavailable');
        const body = await result.text();
        if (Buffer.byteLength(body) > 5 * 1024 * 1024) throw new Error('Catalogue too large');
        const products=JSON.parse(body);
        registerPublishedProductImages(products);
        cached = sitemapXml(products); expires = Date.now() + 30000;
      }
      response.writeHead(200, {'Content-Type':'application/xml; charset=utf-8', 'Cache-Control':'public, max-age=30', 'Content-Length':Buffer.byteLength(cached)});
      response.end(request.method === 'HEAD' ? undefined : cached);
    } catch {
      response.writeHead(503, {'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store', 'Retry-After':'60', 'X-Robots-Tag':'noindex, nofollow'});
      response.end(request.method === 'HEAD' ? undefined : 'Sitemap temporarily unavailable');
    }
  };
}
