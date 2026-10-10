import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.HIDI_CANDIDATE_RUNTIME ? resolve(process.env.HIDI_CANDIDATE_RUNTIME, 'admin-tools') : resolve('deploy/admin-tools');
const { createProductDeletionHandler, sameOrigin, trustedAdminHeaders } = await import(pathToFileURL(resolve(root, 'product-delete-handler.mjs')));
const { ownedProductKey, createProductPhotoStorage } = await import(pathToFileURL(resolve(root, 'product-delete-storage.mjs')));
const env = { AZURE_STORAGE_ACCOUNT: 'hidiaccount', MEDIA_PUBLIC_BASE_URL: 'https://hidiaccount.blob.core.windows.net/product-media' };
const timestamp = '2026-10-10T10:00:00.000Z';
const photo = (id, extra = {}) => ({ id, kind: 'product', url: '/media/products/photo.jpg', storagePath: null, shared: false, ...extra });

async function fixture({ media = [photo('p1')], failure = false, protectedKey = false, conflict = false } = {}) {
  const calls = []; let pending = [...media]; let status = 'ACTIVE';
  const handler = createProductDeletionHandler({ hasStorefront: true, env, apiCall: async call => {
    calls.push(call);
    if (call.method === 'GET') return { id: 'product_1', name: 'Olive Kurta', status, updatedAt: timestamp, images: media, variants: [], ...(call.suffix === '/deletion' ? { pendingMediaCount: pending.length } : {}) };
    if (call.method === 'DELETE') { if (conflict) throw Object.assign(new Error('Product changed. Reload.'), { status: 409 }); status = 'DELETED'; return { media: pending, status, name: 'Olive Kurta' }; }
    assert.ok(call.body.productImageIds.length + call.body.variantImageIds.length, 'Real API refuses an empty cleanup acknowledgement');
    pending = pending.filter(p => ![...call.body.productImageIds, ...call.body.variantImageIds].includes(p.id));
    return { pendingMediaCount: pending.length };
  }, storage: { key: image => ownedProductKey(image, env), protectedKeys: async () => new Set(protectedKey ? ['products/photo.jpg'] : []), remove: async key => { calls.push({ remove: key }); if (failure) throw new Error('Storage down'); } } });
  const server = createServer(async (request, response) => { await handler(request, response, new URL(request.url, 'http://localhost').pathname); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  return { calls, request: (method = 'DELETE', headers = {}, body = { confirmName: 'Olive Kurta', expectedUpdatedAt: timestamp }) => fetch(base + '/api/hidi/product-deletion/product_1', { method, headers: { Cookie: 'hidi_admin_access=dummy-test-token', Origin: base, 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body) }), close: () => new Promise(done => server.close(done)) };
}

test('owned photo keys require this account/container and reject traversal or conflicting metadata', () => {
  for (const image of [{ url: '/media/products/migrated/hash.jpg' }, { url: 'https://hidiaccount.blob.core.windows.net/product-media/products/migrated/hash.jpg' }, { url: 'https://other.test/image.jpg', storagePath: 'azure://product-media/products/migrated/hash.jpg' }]) assert.equal(ownedProductKey(image, env), 'products/migrated/hash.jpg');
  assert.equal(ownedProductKey({ url: 'https://outside.test/products/photo.jpg' }, env), null);
  assert.equal(ownedProductKey({ url: 'https://outside.test/products/photo.jpg', storagePath: 'azure://other-account/product-media/products/photo.jpg' }, env), null);
  assert.equal(ownedProductKey({ url: '/products/static.jpg' }, env), null);
  for (const image of [{ url: '/media/products/../private.json' }, { url: '/media/products/%252e%252e/private.json' }, { url: '/media/products/a.jpg', storagePath: 'azure://product-media/products/b.jpg' }, { url: '/media/products/a.jpg?token=secret' }, { storagePath: 'azure://product-media/brand/hero/current.json' }]) assert.throws(() => ownedProductKey(image, env));
});

test('storage only deletes owned product keys, accepts absent blobs and never forwards identity to a redirect', async () => {
  const calls = [];
  const storage = createProductPhotoStorage({ env, getToken: async () => 'test-storage-token', requestFetch: async (url, options) => { calls.push({ url: String(url), options }); return new Response(null, { status: 404 }); } });
  await storage.remove('products/photo.jpg'); assert.deepEqual([...await storage.protectedKeys()], []);
  assert.ok(calls.every(c => c.url.startsWith('https://hidiaccount.blob.core.windows.net/product-media/') && c.options.redirect === 'error'));
  assert.equal(calls[0].options.method, 'DELETE'); assert.equal(calls[0].options.headers['x-ms-delete-snapshots'], 'include'); await assert.rejects(() => storage.remove('brand/hero/current.json'));
});

test('homepage configuration preserves reused product photos while safely ignoring its dedicated brand assets', async () => {
  const storage = createProductPhotoStorage({ env, getToken: async () => 'test-storage-token', requestFetch: async (_url, options) => {
    assert.equal(options.method, 'GET');
    return Response.json({ image: 'https://hidiaccount.blob.core.windows.net/product-media/brand/landing-media/media/home.webp', shared: '/media/products/photo.jpg', nested: [{ image: 'https://hidiaccount.blob.core.windows.net/product-media/products/reused.jpg' }] });
  } });
  assert.deepEqual([...await storage.protectedKeys()].sort(), ['products/photo.jpg', 'products/reused.jpg']);
});

test('anonymous, forged legacy sessions and cross-origin writes fail before any backend or blob action', async () => {
  assert.throws(() => trustedAdminHeaders('hidi_admin_session=forged', { ADMIN_LEGACY_KEY_ENABLED: 'true', ADMIN_API_KEY: 'test' }), { status: 401 });
  assert.equal(sameOrigin({ headers: { host: 'thehidi.com', origin: 'https://evil.test', 'sec-fetch-site': 'same-site' } }), false);
  const f = await fixture();
  try {
    for (const headers of [{ Cookie: '' }, { Origin: 'https://evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) { const response = await f.request('DELETE', headers); assert.ok([401, 403].includes(response.status)); }
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test('delete deduplicates all size/colour photo references and acknowledges metadata only after removal', async () => {
  const f = await fixture({ media: [photo('p1'), photo('v1', { kind: 'variant', storagePath: 'azure://product-media/products/photo.jpg' })] });
  try { const response = await f.request(); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.cleanupComplete, true); assert.equal(data.photosDeleted, 1); assert.equal(data.historyPreserved, true); assert.equal(f.calls.filter(c => c.remove).length, 1); assert.deepEqual(f.calls.at(-1).body, { productImageIds: ['p1'], variantImageIds: ['v1'] }); } finally { await f.close(); }
});

test('shared catalogue and homepage photos are preserved while product metadata is detached', async () => {
  for (const options of [{ media: [photo('p1', { shared: true })] }, { protectedKey: true }]) {
    const f = await fixture(options);
    try { const data = await (await f.request()).json(); assert.equal(data.sharedPhotosPreserved, 1); assert.equal(data.cleanupComplete, true); assert.equal(f.calls.filter(c => c.remove).length, 0); } finally { await f.close(); }
  }
});

test('foreign storage metadata does not prevent owned photo cleanup or send credentials to that account', async () => {
  const f = await fixture({ media: [photo('owned'), photo('foreign', { kind: 'variant', url: 'https://outside.test/products/foreign.jpg', storagePath: 'azure://differentaccount/product-media/products/foreign.jpg' })] });
  try {
    const data = await (await f.request()).json(); assert.equal(data.cleanupComplete, true); assert.equal(data.photosDeleted, 1); assert.equal(data.externalPhotosDetached, 1);
    assert.deepEqual(f.calls.filter(c => c.remove), [{ remove: 'products/photo.jpg' }]);
  } finally { await f.close(); }
});

test('invalid owned metadata is rejected before the product is marked deleted so it can be corrected', async () => {
  const f = await fixture({ media: [photo('invalid', { storagePath: 'azure://product-media/products/different.jpg' })] });
  try {
    const response = await f.request(); assert.equal(response.status, 409); assert.match((await response.json()).message, /Correct or remove/);
    assert.equal(f.calls.filter(c => c.method === 'DELETE' || c.method === 'POST' || c.remove).length, 0);
  } finally { await f.close(); }
});

test('storage failure leaves pending metadata and reports that cleanup is incomplete', async () => {
  const f = await fixture({ failure: true });
  try { const data = await (await f.request()).json(); assert.equal(data.deleted, true); assert.equal(data.cleanupComplete, false); assert.equal(data.cleanupBlocked, true); assert.equal(data.pendingMediaCount, 1); assert.equal(f.calls.at(-1).method, 'GET'); assert.equal(f.calls.at(-1).suffix, '/deletion'); assert.match(data.message, /pending/); } finally { await f.close(); }
});

test('a draft with no photos deletes successfully without an invalid empty cleanup acknowledgement', async () => {
  const f = await fixture({ media: [] });
  try {
    const response = await f.request(); assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.deleted, true); assert.equal(data.cleanupComplete, true); assert.equal(data.pendingMediaCount, 0);
    assert.equal(f.calls.filter(c => c.method === 'POST' || c.remove).length, 0);
  } finally { await f.close(); }
});

test('stale version and unknown request fields never delete storage or claim success', async () => {
  const f = await fixture({ conflict: true });
  try { const response = await f.request(); assert.equal(response.status, 409); assert.equal((await response.json()).deleted, undefined); assert.equal(f.calls.filter(c => c.remove).length, 0); const invalid = await f.request('DELETE', {}, { force: true }); assert.equal(invalid.status, 400); } finally { await f.close(); }
});

test('cleanup is bounded to eight owned objects per request and can safely continue', async () => {
  const media = Array.from({ length: 10 }, (_, i) => photo('p' + i, { url: `/media/products/photo${i}.jpg` }));
  const f = await fixture({ media });
  try { const first = await (await f.request()).json(); assert.equal(first.pendingMediaCount, 2); assert.equal(first.cleanupComplete, false); assert.equal(first.cleanupBlocked, false); const second = await (await f.request()).json(); assert.equal(second.cleanupComplete, true); assert.equal(f.calls.filter(c => c.remove).length, 10); } finally { await f.close(); }
});

test('more than 200 size references to one photo make durable cleanup progress on every retry', async () => {
  const f = await fixture({ media: Array.from({ length: 451 }, (_, i) => photo('v' + i, { kind: 'variant' })) });
  try {
    for (const pending of [251, 51, 0]) {
      const response = await f.request(); assert.equal(response.status, 200);
      const data = await response.json(); assert.equal(data.pendingMediaCount, pending); assert.equal(data.cleanupComplete, pending === 0);
      const acknowledged = f.calls.at(-1).body;
      assert.ok(acknowledged.variantImageIds.length > 0 && acknowledged.variantImageIds.length <= 200);
    }
    assert.equal(f.calls.filter(c => c.remove).length, 3);
  } finally { await f.close(); }
});
