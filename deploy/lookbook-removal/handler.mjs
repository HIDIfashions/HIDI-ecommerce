/** Retire the editorial URL without leaving customer bookmarks on a dead page. */
export function handleLookbookRemoval(request, response, pathname) {
  if (!['/lookbook', '/lookbook/'].includes(pathname)) return false;
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
  } else {
    response.writeHead(301, { Location: '/collections/all', 'Cache-Control': 'no-store', 'Content-Length': '0' });
  }
  response.end();
  return true;
}
