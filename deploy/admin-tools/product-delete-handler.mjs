import { createHmac, timingSafeEqual } from 'node:crypto';
import { createProductPhotoStorage } from './product-delete-storage.mjs';
const error = (status, message) => Object.assign(new Error(message), { status });
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
export function sameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  try {
    const url = new URL(request.headers.origin || '');
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.host || '');
    return url.host === request.headers.host && (url.protocol === 'https:' || local && url.protocol === 'http:');
  } catch { return false; }
}
export function trustedAdminHeaders(cookie, env = process.env) {
  const cookies = new Map(String(cookie || '').split(';').map(p => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const access = cookies.get('hidi_admin_access');
  if (access && !/[\r\n]/.test(access)) return { Authorization: `Bearer ${access}` };
  const secret = env.ADMIN_API_KEY;
  if (env.ADMIN_LEGACY_KEY_ENABLED === 'true' && secret) {
    const expected = Buffer.from(createHmac('sha256', secret).update('hidi-admin-session-v2').digest('hex'));
    const actual = Buffer.from(cookies.get('hidi_admin_session') || '');
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return { 'x-admin-key': secret };
  }
  throw error(401, 'Sign in with your HIDI staff account.');
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw error(415, 'JSON is required.');
  const chunks = []; let size = 0;
  for await (const part of request) { size += part.length; if (size > 8192) throw error(413, 'Deletion request is too large.'); chunks.push(part); }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).some(k => !['expectedUpdatedAt', 'confirmName'].includes(k))) throw new Error();
    return data;
  } catch { throw error(400, 'Invalid deletion request.'); }
}
function send(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Length': Buffer.byteLength(body) }); response.end(body);
}
export function createProductDeletionHandler({ origin, hasStorefront, env = process.env, requestFetch = fetch, storage = createProductPhotoStorage({ env }), apiCall } = {}) {
  async function backend(request, id, method, suffix = '', body) {
    const headers = trustedAdminHeaders(request.headers.cookie, env);
    if (apiCall) return apiCall({ id, method, suffix, body, headers });
    const base = env.INTERNAL_API_URL || env.API_URL;
    if (!base) throw error(503, 'Product API is unavailable.');
    const url = new URL(base.replace(/\/$/, '') + '/admin/products/' + encodeURIComponent(id) + suffix);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw error(503, 'Product API configuration is invalid.');
    const response = await requestFetch(url, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(25000) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw error(response.status < 500 ? response.status : 502, data?.message || 'Product deletion could not be confirmed. Reload before retrying.');
    return data;
  }
  return async (request, response, pathname) => {
    if (!pathname.startsWith('/api/hidi/product-deletion/')) return false;
    const id = pathname.slice('/api/hidi/product-deletion/'.length);
    try {
      if (!ID.test(id)) throw error(400, 'Invalid product.');
      if (!['GET', 'DELETE'].includes(request.method)) throw error(405, 'Method not allowed.');
      if (!hasStorefront || !request.headers.cookie) throw error(401, 'Staff sign-in required.');
      if (request.method === 'DELETE' && !sameOrigin(request)) throw error(403, 'Request origin is not allowed.');
      if (request.method === 'GET') {
        let product;
        try { product = await backend(request, id, 'GET'); }
        catch (e) { if (e.status !== 404) throw e; product = await backend(request, id, 'GET', '/deletion'); }
        send(response, 200, { id: product.id || product.productId, name: product.name, status: product.status, updatedAt: product.updatedAt, pendingMediaCount: product.pendingMediaCount, photoCount: product.images?.length + (product.variants?.reduce((n, v) => n + (v.images?.length || 0), 0) || 0) });
        return true;
      }
      const body = await readBody(request);
      // Reject malformed owned metadata while the product can still be edited.
      // An external storage account is detached without deleting its objects.
      let current;
      try { current = await backend(request, id, 'GET'); }
      catch (e) { if (e.status !== 404) throw e; }
      if (current && current.status !== 'DELETED') {
        for (const image of [...(current.images || []), ...(current.variants || []).flatMap(variant => variant.images || [])]) {
          try { storage.key(image); }
          catch { throw error(409, 'A stored photo path is invalid. Correct or remove that photo before deleting this product.'); }
        }
      }
      const deleted = await backend(request, id, 'DELETE', '', body);
      const media = deleted.media || [];
      const completed = { productImageIds: [], variantImageIds: [] };
      let removed = 0, shared = 0, external = 0, pendingError = false;
      try {
        const protectedKeys = media.length ? await storage.protectedKeys() : new Set();
        const groups = new Map();
        for (const image of media) {
          const key = storage.key(image);
          const groupKey = key || `${image.kind}:${image.id}`;
          if (!groups.has(groupKey)) groups.set(groupKey, { key, refs: [] });
          groups.get(groupKey).refs.push(image);
        }
        // A bounded batch keeps retries safe even for large colour/size matrices.
        const cleanupStarted = Date.now();
        for (const { key, refs } of [...groups.values()].slice(0, 8)) {
          if (Date.now() - cleanupStarted > 15000) break;
          const remaining = { product: 200 - completed.productImageIds.length, variant: 200 - completed.variantImageIds.length };
          const acknowledged = refs.filter(ref => remaining[ref.kind === 'product' ? 'product' : 'variant']-- > 0);
          if (!acknowledged.length) continue;
          if (refs.some(r => r.shared) || protectedKeys.has(key)) shared++;
          else if (!key) external++;
          else { await storage.remove(key); removed++; }
          for (const ref of acknowledged) completed[ref.kind === 'product' ? 'productImageIds' : 'variantImageIds'].push(ref.id);
        }
      } catch { pendingError = true; }
      const cleanup = completed.productImageIds.length || completed.variantImageIds.length
        ? await backend(request, id, 'POST', '/deletion/cleanup', completed)
        : await backend(request, id, 'GET', '/deletion');
      const pending = cleanup.pendingMediaCount || 0;
      send(response, 200, { productId: id, deleted: true, historyPreserved: true, photosDeleted: removed, sharedPhotosPreserved: shared, externalPhotosDetached: external, pendingMediaCount: pending, cleanupComplete: pending === 0, message: pending === 0 ? 'Product deleted. Dedicated storage photos were removed; shared photos and past order records were preserved.' : pendingError ? 'Product removed from sale. Photo cleanup is pending; retry to finish.' : 'Product removed from sale. Continue cleanup to finish the remaining photos.' });
    } catch (e) { send(response, e.status || 503, { message: typeof e.status === 'number' ? e.message : 'Deletion could not finish. Reload and retry; no success was confirmed.' }); }
    return true;
  };
}
