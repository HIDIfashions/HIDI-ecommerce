import { injectTypography } from "./handler.mjs";
export function wrapTypography(request, response, pathname) {
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
      const updated = injectTypography(original, /^\/admin(?:\/|$)/.test(pathname) ? "admin" : "storefront");
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
