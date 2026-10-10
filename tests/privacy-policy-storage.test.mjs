import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAzurePolicyStore } from '../deploy/privacy-policy/storage.mjs';

test('storage identity creates a private container and preserves conditional writes', async t => {
  const oldAccount = process.env.AZURE_STORAGE_ACCOUNT; process.env.AZURE_STORAGE_ACCOUNT = 'sthidiprod0927';
  t.after(() => { if (oldAccount === undefined) delete process.env.AZURE_STORAGE_ACCOUNT; else process.env.AZURE_STORAGE_ACCOUNT = oldAccount; });
  let exists = false, saved = null, version = 0; const calls = [];
  const store = createAzurePolicyStore({ getToken: async () => 'fixture-token', requestFetch: async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (url.search === '?restype=container') {
      assert.equal(options.headers['x-ms-blob-public-access'], undefined);
      if (options.method === 'PUT') { exists = true; return new Response(null, { status: 201 }); }
      return new Response(null, { status: exists ? 200 : 404 });
    }
    if (options.method === 'GET') return saved ? new Response(JSON.stringify(saved), { status: 200, headers: { etag: `"${version}"` } }) : new Response(null, { status: 404 });
    const condition = options.headers['If-Match'];
    if (saved && condition !== `"${version}"`) return new Response(null, { status: 412 });
    if (!saved) assert.equal(options.headers['If-None-Match'], '*');
    saved = JSON.parse(options.body); version++; return new Response(null, { status: 201, headers: { etag: `"${version}"` } });
  }});
  assert.equal((await store.load()).value, null);
  await store.save({ draft: 'private' }, null);
  const loaded = await store.load(); assert.equal(loaded.etag, '"1"');
  await store.save({ draft: 'updated' }, loaded.etag);
  await assert.rejects(store.save({ draft: 'stale' }, loaded.etag), error => error.status === 409);
  assert.equal(calls.filter(call => call.url.includes('restype=container') && call.method === 'PUT').length, 1);
  assert.ok(calls.every(call => call.url.startsWith('https://sthidiprod0927.blob.core.windows.net/hidi-private-policies')));
});

test('an existing public container or denied container creation fails closed', async t => {
  const oldAccount = process.env.AZURE_STORAGE_ACCOUNT; process.env.AZURE_STORAGE_ACCOUNT = 'sthidiprod0927';
  t.after(() => { if (oldAccount === undefined) delete process.env.AZURE_STORAGE_ACCOUNT; else process.env.AZURE_STORAGE_ACCOUNT = oldAccount; });
  const publicStore = createAzurePolicyStore({ getToken: async () => 'fixture', requestFetch: async () => new Response(null, { status: 200, headers: { 'x-ms-blob-public-access': 'blob' } }) });
  await assert.rejects(publicStore.load(), /must be private/);
  const deniedStore = createAzurePolicyStore({ getToken: async () => 'fixture', requestFetch: async (_, options) => new Response(null, { status: options.method === 'HEAD' ? 404 : 403 }) });
  await assert.rejects(deniedStore.load(), /unavailable/);
});
