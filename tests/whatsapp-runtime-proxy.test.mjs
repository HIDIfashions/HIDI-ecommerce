import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleMsg91Ordering } from '../deploy/whatsapp-msg91/handler.mjs';
const path = '/api/store/whatsapp/msg91/webhook', token = 'test-callback-'.repeat(4);
async function call({ method = 'POST', headers = {}, body = '{"fixture":true}', pathname = path, fetcher = async () => Response.json({ accepted: true }) } = {}) {
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method, headers: { 'content-type': 'application/json', 'x-hidi-whatsapp-token': token, ...headers } });
  const result = {};
  const res = { writeHead(status, headers) { Object.assign(result, { status, headers }); }, end(body) { result.body = JSON.parse(body); } };
  result.handled = await handleMsg91Ordering(req, res, pathname, fetcher); return result;
}
test('runtime callback forwards original bytes and only required headers', async () => {
  process.env.INTERNAL_API_URL = 'https://private.example/v1';
  const body = '{ "messages": "[{\\"text\\":\\"hi\\"}]" }';
  let calls = 0;
  const result = await call({ body, headers: { cookie: 'private=fixture', authorization: 'Bearer fixture' }, fetcher: async (url, options) => {
    calls++;
    assert.equal(url, 'https://private.example/v1/whatsapp/msg91/webhook');
    assert.deepEqual(options.headers, { 'content-type': 'application/json', 'x-hidi-whatsapp-token': token });
    assert.equal(options.body.toString(), body); assert.equal(options.redirect, 'manual');
    return Response.json({ accepted: true });
  } });
  assert.equal(calls, 1); assert.equal(result.status, 200); assert.equal(result.headers['cache-control'], 'no-store');
});
test('runtime adapter leaves all unrelated routes alone', async () => {
  for (const pathname of ['/api/store/payments/webhook', path + '/extra', '/checkout']) {
    const result = await call({ pathname, fetcher: () => { throw Error('Must not forward'); } });
    assert.equal(result.handled, false); assert.equal(result.status, undefined);
  }
});
test('runtime callback rejects invalid method, missing credentials, content type and large bodies', async () => {
  const never = () => { throw Error('Must not forward'); };
  for (const [args, status] of [[{ method: 'GET' }, 405], [{ headers: { 'x-hidi-whatsapp-token': '' } }, 401], [{ headers: { 'content-type': 'text/plain' } }, 415], [{ body: 'a'.repeat(16385) }, 413]]) {
    assert.equal((await call({ ...args, fetcher: never })).status, status);
  }
});
test('runtime callback preserves API rejections and does not follow redirects or leak errors', async () => {
  assert.equal((await call({ fetcher: async () => Response.json({ message: 'Invalid token' }, { status: 401 }) })).status, 401);
  assert.equal((await call({ fetcher: async () => new Response(null, { status: 302 }) })).status, 502);
  const failure = await call({ fetcher: async () => { throw Error('private upstream detail'); } });
  assert.equal(failure.status, 502); assert.equal(failure.body.message, 'Ordering API unavailable');
});
