import test from 'node:test';
import assert from 'node:assert/strict';
import './privacy-store-fixture.mjs';

test('local private-policy fixture serves reviewed reads and refuses every mutation', async () => {
  const token = await fetch('http://127.0.0.1/hidi-seo-fixture-token').then(response => response.json());
  assert.equal(token.access_token, 'read-only-fixture');
  const state = await fetch('https://fixture.blob.core.windows.net/hidi-private-policies/state.json').then(response => response.json());
  assert.equal(state.published.version, 3);
  await assert.rejects(fetch('https://fixture.blob.core.windows.net/hidi-private-policies/state.json', { method: 'PUT' }), /refused PUT/);
  await assert.rejects(fetch('https://example.invalid/write', { method: 'POST' }), /refused POST/);
});
