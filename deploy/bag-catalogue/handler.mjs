/** Keep legacy shopping links on the complete published catalogue. */
export function handleCatalogueAlias(request, response, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)
      || !['/collections/new-arrivals', '/collections/new-arrivals/'].includes(pathname)) return false;
  const query = new URL(request.url, 'http://localhost').search;
  response.writeHead(307, {
    Location: '/collections/all' + query,
    'Cache-Control': 'no-store',
    'Content-Length': '0',
  });
  response.end();
  return true;
}
