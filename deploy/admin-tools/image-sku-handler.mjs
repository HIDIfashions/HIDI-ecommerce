import {sameOrigin, trustedAdminHeaders} from './product-delete-handler.mjs';
import {createImageSkuStore} from './image-sku-store.mjs';
import {IMAGE_SKU_ENDPOINT, imageSkuKey, validImageSku, canonicalColour} from './image-sku-client.mjs';
const fail = (status, message) => Object.assign(new Error(message), {status});
async function jsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw fail(415, 'JSON is required.');
  const parts = []; let size = 0;
  for await (const part of request) {size += part.length; if (size > 1024 * 1024) throw fail(413, 'Image SKU request is too large.'); parts.push(part);}
  try {const value = JSON.parse(Buffer.concat(parts).toString('utf8')); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value;}
  catch {throw fail(400, 'Invalid Image SKU request.');}
}
function send(response, status, body) {const text = JSON.stringify(body); response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': Buffer.byteLength(text)}); response.end(text);}
function validBinding(binding) {return validImageSku(binding?.imageSku) && /^[A-Za-z0-9_-]{1,64}$/.test(binding.productId) && typeof binding.productSlug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(binding.productSlug) && typeof binding.color === 'string' && binding.color.length > 0 && binding.color.length <= 120;}
function validateRegistry(bindings) {if (!Array.isArray(bindings) || bindings.some(binding => !validBinding(binding)) || new Set(bindings.map(binding => binding.imageSku)).size !== bindings.length) throw fail(503, 'Saved Image SKU mappings are invalid.');}
export function createImageSkuHandler({env = process.env, hasStorefront, requestFetch = fetch, storage = createImageSkuStore({env}), apiCall} = {}) {
  async function backend(request, path) {
    const headers = trustedAdminHeaders(request.headers.cookie, env);
    if (apiCall) return apiCall({path, headers});
    const base = env.INTERNAL_API_URL || env.API_URL; if (!base) throw fail(503, 'Product API is unavailable.');
    const url = new URL(base.replace(/\/$/, '') + '/admin/' + path);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fail(503, 'Product API configuration is invalid.');
    const response = await requestFetch(url, {headers, redirect: 'error', signal: AbortSignal.timeout(25000)});
    const body = await response.json().catch(() => null);
    if (!response.ok) throw fail(response.status < 500 ? response.status : 502, body?.message || 'Staff or product verification failed.');
    return body;
  }
  return async (request, response, pathname) => {
    if (pathname !== IMAGE_SKU_ENDPOINT && pathname !== IMAGE_SKU_ENDPOINT + '/preflight') return false;
    try {
      if (!['GET', 'POST'].includes(request.method) || pathname.endsWith('/preflight') && request.method !== 'POST') throw fail(405, 'Method not allowed.');
      if (!hasStorefront || !request.headers.cookie) throw fail(401, 'Staff sign-in required.');
      if (request.method === 'POST' && !sameOrigin(request)) throw fail(403, 'Request origin is not allowed.');
      const identity = await backend(request, 'me');
      if (!identity?.admin || !['OWNER', 'CATALOG', 'OPERATIONS', 'SUPPORT'].includes(identity.admin.role)) throw fail(403, 'Staff access required.');
      if (request.method === 'POST' && !['OWNER', 'CATALOG'].includes(identity.admin.role)) throw fail(403, 'Catalogue write access is required.');
      const saved = await storage.read(); validateRegistry(saved.bindings);
      if (request.method === 'GET') {send(response, 200, {bindings: saved.bindings}); return true;}
      const body = await jsonBody(request);
      if (pathname.endsWith('/preflight')) {
        if (Object.keys(body).some(key => key !== 'bindings') || !Array.isArray(body.bindings) || body.bindings.length > 5000) throw fail(400, 'Invalid Image SKU batch.');
        const batch = new Map(), targets = new Map();
        for (const input of body.bindings) {
          if (!input || Object.keys(input).some(key => !['imageSku', 'productSlug', 'color'].includes(key))) throw fail(400, 'Invalid Image SKU batch entry.');
          const code = imageSkuKey(input.imageSku), colour = canonicalColour(input.color);
          if (!validImageSku(code) || typeof input.productSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.productSlug) || !colour || colour.length > 120) throw fail(400, 'Invalid Image SKU, product URL or colour.');
          const target = input.productSlug + '\u0000' + colour;
          if (batch.has(code) && batch.get(code) !== target || targets.has(target) && targets.get(target) !== code) throw fail(409, 'Use one unique Image SKU for each product colour.');
          batch.set(code, target); targets.set(target, code);
          const existing = saved.bindings.find(binding => binding.imageSku === code);
          if (existing && (existing.productSlug !== input.productSlug || canonicalColour(existing.color) !== colour)) throw fail(409, 'Image SKU ' + code + ' already belongs to another product or colour. Use a different code.');
        }
        send(response, 200, {passed: true, mappingsChecked: batch.size}); return true;
      }
      if (Object.keys(body).some(key => !['imageSku', 'productId', 'color', 'expectedUpdatedAt'].includes(key))) throw fail(400, 'Invalid Image SKU mapping fields.');
      const code = imageSkuKey(body.imageSku);
      if (!validImageSku(code) || !/^[A-Za-z0-9_-]{1,64}$/.test(body.productId || '') || !canonicalColour(body.color) || typeof body.expectedUpdatedAt !== 'string') throw fail(400, 'Image SKU, product, colour and product version are required.');
      const product = await backend(request, 'products/' + encodeURIComponent(body.productId));
      if (product?.id !== body.productId || !['DRAFT', 'ACTIVE'].includes(product.status) || product.updatedAt !== body.expectedUpdatedAt) throw fail(409, 'Product changed before Image SKU mapping. Retry this import.');
      const variants = (product.variants || []).filter(variant => canonicalColour(variant.color) === canonicalColour(body.color));
      if (!variants.length || new Set(variants.map(variant => variant.color)).size !== 1) throw fail(400, 'Image SKU colour must match the saved product variants.');
      const binding = {imageSku: code, productId: product.id, productSlug: product.slug, color: variants[0].color};
      if (!validBinding(binding)) throw fail(400, 'Invalid saved product mapping.');
      for (let attempt = 0; attempt < 3; attempt++) {
        const registry = attempt ? await storage.read() : saved; validateRegistry(registry.bindings);
        const existing = registry.bindings.find(value => value.imageSku === code);
        if (existing) {
          if (existing.productId !== binding.productId || canonicalColour(existing.color) !== canonicalColour(binding.color)) throw fail(409, 'Image SKU ' + code + ' already belongs to another product or colour.');
          send(response, 200, {saved: true, binding: existing, alreadySaved: true}); return true;
        }
        try {await storage.write([...registry.bindings, binding], registry.etag); send(response, 200, {saved: true, binding}); return true;}
        catch (error) {if (error.status !== 409 || attempt === 2) throw error;}
      }
    } catch (error) {send(response, error.status || 503, {message: error.status ? error.message : 'Image SKU mapping could not finish. Retry to confirm the saved mapping.'});}
    return true;
  };
}
