const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const mod = import('./browser-navigation.mjs');
const pause = ms => new Promise(done => setTimeout(done, ms));
const route = name => ({ url: () => 'http://127.0.0.1:3107/' + name + '?_rsc=fixture' });
const options = { quietMs: 0, timeoutMs: 500, pollMs: 2 };

test('prefetch wait tracks actual in-flight requests, not a cached document load event', async () => {
  const { watchRoutePrefetch, settleRoutePrefetch } = await mod;
  const page = new EventEmitter(), cleanup = watchRoutePrefetch(page), request = route('shipping');
  page.emit('request', request); let settled = false;
  const wait = settleRoutePrefetch(page, options).then(() => { settled = true; });
  await pause(10); assert.equal(settled, false);
  page.emit('requestfinished', request); await wait; assert.equal(settled, true); cleanup();
});
test('route requests started during a transition must all finish before unloading', async () => {
  const { watchRoutePrefetch, settleRoutePrefetch } = await mod;
  const page = new EventEmitter(), cleanup = watchRoutePrefetch(page), first = route('shipping'), second = route('returns');
  page.emit('request', first); let settled = false;
  const wait = settleRoutePrefetch(page, options).then(() => { settled = true; });
  page.emit('request', second); page.emit('requestfinished', first);
  await pause(10); assert.equal(settled, false); page.emit('requestfinished', second); await wait; cleanup();
});
test('unrelated images do not block route settling', async () => {
  const { watchRoutePrefetch, settleRoutePrefetch } = await mod;
  const page = new EventEmitter(), cleanup = watchRoutePrefetch(page);
  page.emit('request', { url: () => 'http://127.0.0.1:3107/photo.png' });
  await settleRoutePrefetch(page, options); cleanup();
});
test('failed requests finish tracking but browser exceptions remain visible', async () => {
  const { watchRoutePrefetch, settleRoutePrefetch } = await mod;
  const page = new EventEmitter(), errors = [], listener = error => errors.push(error.message);
  page.on('pageerror', listener); const cleanup = watchRoutePrefetch(page), request = route('shipping');
  page.emit('request', request); page.emit('requestfailed', request); page.emit('pageerror', new Error('Must remain visible'));
  await settleRoutePrefetch(page, options); cleanup();
  assert.deepEqual(errors, ['Must remain visible']); assert.equal(page.listeners('pageerror')[0], listener);
});
test('a stuck route request times out rather than passing silently', async () => {
  const { watchRoutePrefetch, settleRoutePrefetch } = await mod;
  const page = new EventEmitter(), cleanup = watchRoutePrefetch(page);
  page.emit('request', route('shipping'));
  await assert.rejects(settleRoutePrefetch(page, { ...options, timeoutMs: 20 }), /Unsettled route prefetch/); cleanup();
});
test('cleanup removes only tracker listeners and missing trackers fail closed', async () => {
  const { watchRoutePrefetch, settleRoutePrefetch } = await mod;
  const page = new EventEmitter(), existing = () => {}; page.on('request', existing);
  const cleanup = watchRoutePrefetch(page); cleanup();
  assert.deepEqual(page.listeners('request'), [existing]); assert.equal(page.listenerCount('requestfinished'), 0);
  await assert.rejects(settleRoutePrefetch(page, options), /not installed/);
});
