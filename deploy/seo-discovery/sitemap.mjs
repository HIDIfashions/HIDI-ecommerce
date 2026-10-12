import { canonicalOrigin } from './metadata.mjs';

const routes = ['/', '/collections/all', '/collections/work-wear', '/collections/casual-wear', '/collections/occasional-wear', '/collections/ananyas-pick', '/about', '/shipping', '/returns', '/contact', '/offers'];
const xmlEscape = text => String(text).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function sitemapXml(products) {
  if (!Array.isArray(products)) throw new Error('Expected the public catalogue array');
  const paths = new Set(routes);
  for (const product of products) {
    if (product.status && product.status !== 'ACTIVE') continue;
    if (typeof product.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) throw new Error('Invalid published slug');
    paths.add('/products/' + product.slug);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...paths].map(path => '<url><loc>' + xmlEscape(canonicalOrigin + path) + '</loc></url>').join('\n') + '\n</urlset>\n';
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
        cached = sitemapXml(JSON.parse(body)); expires = Date.now() + 30000;
      }
      response.writeHead(200, {'Content-Type':'application/xml; charset=utf-8', 'Cache-Control':'public, max-age=30', 'Content-Length':Buffer.byteLength(cached)});
      response.end(request.method === 'HEAD' ? undefined : cached);
    } catch {
      response.writeHead(503, {'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store', 'Retry-After':'60', 'X-Robots-Tag':'noindex, nofollow'});
      response.end(request.method === 'HEAD' ? undefined : 'Sitemap temporarily unavailable');
    }
  };
}
