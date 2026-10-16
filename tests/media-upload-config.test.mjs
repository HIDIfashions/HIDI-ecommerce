import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOwnedUpload } from '../deploy/media-upload-config/probe.mjs';

const nonce = '11111111-1111-4111-8111-111111111111';
const runId = '123456';
const baseUrl = 'https://thidigk.thehidi.com/media';
const key = `products/upload-checks/media-config-${runId}-${nonce}.png`;
function fixture({ lostPut = false, badRead = false, foreign = false } = {}) {
  let blob = foreign ? { bytes: Buffer.from('foreign'), run: 'other', nonce: 'other', etag: 'foreign-etag' } : null;
  const calls = [];
  const request = async (method, path, bytes, headers = {}) => {
    assert.equal(path, key); calls.push({ method, headers });
    if (method === 'PUT') {
      assert.equal(headers['If-None-Match'], '*');
      for (const name of Object.keys(headers).filter(name => name.startsWith('x-ms-meta-'))) {
        // Azure metadata names follow identifier rules, rather than general HTTP header rules.
        assert.match(name.slice('x-ms-meta-'.length), /^[a-z_][a-z0-9_]*$/i);
      }
      if (blob) return new Response(null, { status: 409 });
      blob = { bytes, run: headers['x-ms-meta-hidi_media_probe'], nonce: headers['x-ms-meta-hidi_media_nonce'], etag: 'owned-etag' };
      if (lostPut) throw new Error('lost response');
      return new Response(null, { status: 201, headers: { etag: blob.etag } });
    }
    if (method === 'HEAD') return new Response(null, { status: blob ? 200 : 404,
      headers: blob ? { etag: blob.etag, 'x-ms-meta-hidi_media_probe': blob.run, 'x-ms-meta-hidi_media_nonce': blob.nonce } : {} });
    assert.equal(method, 'DELETE');
    assert.equal(headers['If-Match'], blob.etag); blob = null;
    return new Response(null, { status: 202 });
  };
  const requestFetch = async url => {
    assert.equal(url, `${baseUrl}/${key}`);
    return new Response(badRead ? 'wrong bytes' : blob.bytes, { headers: { 'content-type': 'image/png' } });
  };
  return { request, requestFetch, calls, remaining: () => blob };
}

test('owned upload verifies exact public bytes and removes only its own ETag', async () => {
  const f = fixture();
  const report = await verifyOwnedUpload({ ...f, baseUrl, runId, nonce });
  assert.equal(report.passed, true); assert.equal(report.publicReadMatches, true);
  assert.equal(report.ownedProbeCleaned, true); assert.equal(report.databaseWrites, false);
  assert.equal(f.remaining(), null);
  assert.deepEqual(f.calls.map(c => c.method), ['PUT', 'DELETE', 'HEAD']);
});
test('public read failure still cleans the owned upload', async () => {
  const f = fixture({ badRead: true });
  await assert.rejects(verifyOwnedUpload({ ...f, baseUrl, runId, nonce }), { code: 'PUBLIC_MEDIA_BYTES_DIFFER' });
  assert.equal(f.remaining(), null);
});
test('lost PUT response uses matching ownership metadata for cleanup', async () => {
  const f = fixture({ lostPut: true });
  await assert.rejects(verifyOwnedUpload({ ...f, baseUrl, runId, nonce }), /lost response/);
  assert.equal(f.remaining(), null);
  assert.deepEqual(f.calls.map(c => c.method), ['PUT', 'HEAD', 'DELETE', 'HEAD']);
});
test('a collision never overwrites or removes an unrelated object', async () => {
  const f = fixture({ foreign: true });
  await assert.rejects(verifyOwnedUpload({ ...f, baseUrl, runId, nonce }), { code: 'BLOB_WRITE_HTTP_409_ERROR' });
  assert.equal(f.remaining().etag, 'foreign-etag');
  assert.deepEqual(f.calls.map(c => c.method), ['PUT', 'HEAD']);
});
test('HTTP and arbitrary destinations are refused before any write', async () => {
  for (const value of ['http://thidigk.thehidi.com/media', 'https://attacker.invalid/media', baseUrl + '?token=secret']) {
    const f = fixture();
    await assert.rejects(verifyOwnedUpload({ ...f, baseUrl: value, runId, nonce }), { code: 'UNSAFE_MEDIA_PROBE_TARGET' });
    assert.equal(f.calls.length, 0);
  }
});
