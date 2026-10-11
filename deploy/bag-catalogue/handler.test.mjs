import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { handleCatalogueAlias } from './handler.mjs';

test('legacy catalogue navigation redirects safely, preserving filters and RSC queries', async () => {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!handleCatalogueAlias(req, res, path)) { res.writeHead(204); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const method of ['GET', 'HEAD']) {
      for (const path of ['/collections/new-arrivals', '/collections/new-arrivals/']) {
        const response = await fetch(base + path + '?color=Pink&_rsc=fixture&returnTo=https%3A%2F%2Fexample.test', { method, redirect: 'manual' });
        assert.equal(response.status, 307);
        assert.equal(response.headers.get('location'), '/collections/all?color=Pink&_rsc=fixture&returnTo=https%3A%2F%2Fexample.test');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(await response.text(), '');
      }
    }
    for (const path of ['/collections/all', '/collections/casual-wear', '/collections/ananyas-pick', '/collections/new-arrivals-extra', '/cart', '/checkout', '/api/products']) {
      assert.equal((await fetch(base + path)).status, 204);
    }
    assert.equal((await fetch(base + '/collections/new-arrivals', { method: 'POST' })).status, 204);
  } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
});
