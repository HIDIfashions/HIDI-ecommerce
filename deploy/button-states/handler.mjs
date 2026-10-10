import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const assets = new Map(['css', 'js'].map(extension => {
  const body = readFileSync(new URL(`./buttons.${extension}`, import.meta.url));
  const version = createHash('sha256').update(body).digest('hex').slice(0, 16);
  return [`/button-states/buttons.${extension}`, { body, version, type: extension === 'css' ? 'text/css' : 'text/javascript' }];
}));

export function injectButtonTheme(html) {
  if (!/<html\b/i.test(html) || !/<\/head>/i.test(html)) return html;
  if (!/data-hidi-button-theme=/i.test(html)) html = html.replace(/<html\b/i, '<html data-hidi-button-theme="site"');
  if (/data-hidi-button-states=["']v1["']/i.test(html)) return html;
  const css = assets.get('/button-states/buttons.css');
  const js = assets.get('/button-states/buttons.js');
  return html.replace(/<\/head>/i, `<link rel="stylesheet" href="/button-states/buttons.css?v=${css.version}" data-hidi-button-states="v1"><script defer src="/button-states/buttons.js?v=${js.version}" data-hidi-button-states="v1"></script></head>`);
}

export function handleButtonTheme(request, response, pathname) {
  const asset = assets.get(pathname);
  if (!asset) return false;
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
    response.end(); return true;
  }
  const version = new URL(request.url, 'http://hidi.local').searchParams.get('v');
  response.writeHead(200, {
    'Content-Type': `${asset.type}; charset=utf-8`, 'Content-Length': asset.body.length,
    'Cache-Control': version === asset.version ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff', ETag: `"${asset.version}"`,
  });
  response.end(request.method === 'HEAD' ? undefined : asset.body);
  return true;
}

// Early Admin and privacy handlers send complete, uncompressed documents and
// bypass storefront SEO. Defer only those HTML headers until their body is ready.
// Storefront compression keeps its existing path and uses injectButtonTheme.
export function wrapButtonTheme(request, response, pathname) {
  if (request.method !== 'GET' || request.headers.rsc || request.headers['next-router-prefetch'] ||
      !(/^\/admin(?:\/|$)/.test(pathname) || pathname === '/privacy' || pathname === '/packing-scanner-control.html')) return;
  const writeHead = response.writeHead.bind(response);
  const end = response.end.bind(response);
  const write = response.write.bind(response);
  const flushHeaders = response.flushHeaders.bind(response);
  let pending;
  response.writeHead = function (status, reason, headers) {
    const provided = typeof reason === 'string' ? headers : reason;
    const entries = Array.isArray(provided) ? Array.from({ length: provided.length / 2 }, (_, i) => [provided[i * 2], provided[i * 2 + 1]]) : Object.entries(provided || {});
    const supplied = {};
    for (const [key, value] of entries) {
      const name = key.toLowerCase();
      supplied[name] = name in supplied ? [supplied[name], value].flat() : value;
    }
    const merged = { ...response.getHeaders(), ...supplied };
    if (/text\/html/i.test(String(merged['content-type'])) && !merged['content-encoding'] && status >= 200 && status < 300) {
      response.statusCode = status;
      pending = { status, reason: typeof reason === 'string' ? reason : undefined, headers: merged };
      return response;
    }
    return writeHead(status, reason, headers);
  };
  const flush = () => {
    if (!pending) return;
    const saved = pending; pending = undefined;
    if (saved.reason) writeHead(saved.status, saved.reason, saved.headers);
    else writeHead(saved.status, saved.headers);
  };
  const prepare = () => {
    if (!pending && !response.headersSent) response.writeHead(response.statusCode);
    flush();
  };
  response.write = function (...args) { prepare(); return write(...args); };
  response.flushHeaders = function () { prepare(); return flushHeaders(); };
  response.end = function (body, encoding, callback) {
    if (typeof body === 'function') { callback = body; body = undefined; encoding = undefined; }
    else if (typeof encoding === 'function') { callback = encoding; encoding = undefined; }
    // Node's implicit writeHead runs inside end(); prepare it here so HTML
    // transformation finishes before headers can be flushed by that path.
    if (!pending && !response.headersSent) response.writeHead(response.statusCode);
    if (pending && body !== undefined && body !== null) {
      const original = Buffer.isBuffer(body) || body instanceof Uint8Array ? Buffer.from(body).toString('utf8') : String(body);
      const updated = injectButtonTheme(original);
      if (updated !== original) {
        body = Buffer.from(updated);
        if (pending.headers['transfer-encoding']) delete pending.headers['content-length'];
        else pending.headers['content-length'] = body.length;
        delete pending.headers.etag;
        delete pending.headers['content-md5'];
      }
    }
    flush();
    return end(body, encoding, callback);
  };
}
