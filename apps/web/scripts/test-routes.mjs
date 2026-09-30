import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionRoute, searchRoute, newsletterConfirmed, newsletterError } from '../src/routes.js';

test('collection names and stable IDs resolve to the intended catalogue', () => {
  const cases = [
    ['Occasion', '/collections/occasion'],
    ['occasion', '/collections/occasion'],
    ['New Arrivals', '/collections/new-arrivals'],
    ['new-arrivals', '/collections/new-arrivals'],
    ['Work Edit', '/collections/work-edit'],
    ['work-edit', '/collections/work-edit'],
    ['Everyday', '/collections/everyday'],
    ['everyday', '/collections/everyday'],
  ];
  for (const [edit, expected] of cases) assert.equal(collectionRoute(edit), expected, edit);
});

test('default, shop-all aliases and unknown edits resolve to the complete catalogue', () => {
  assert.equal(collectionRoute(), '/collections/all');
  for (const edit of ['', 'Shop All', 'shop-all', 'all', 'unrecognized', 'constructor', '__proto__', 'toString']) {
    assert.equal(collectionRoute(edit), '/collections/all', JSON.stringify(edit));
  }
});

test('search trims terms and keeps special characters inside the query value', () => {
  assert.equal(searchRoute(), '/search?q=');
  assert.equal(searchRoute('   '), '/search?q=');
  assert.equal(searchRoute('  cream kurta  '), '/search?q=cream+kurta');
  for (const query of ['silk & linen', 'kurta #1', 'తెలుగు కుర్తా', 'x?next=/account&admin=true']) {
    const destination = new URL(searchRoute(`  ${query}  `), 'https://thehidi.com');
    assert.equal(destination.pathname, '/search');
    assert.equal(destination.hash, '');
    assert.deepEqual([...destination.searchParams.entries()], [['q', query]]);
  }
});

test('newsletter accepts either explicit boolean success response', () => {
  for (const result of [{ ok: true }, { success: true }, { ok: true, success: false }, { ok: false, success: true }]) {
    assert.equal(newsletterConfirmed(result), true);
  }
});

test('newsletter does not treat malformed or truthy values as confirmation', () => {
  for (const result of [null, undefined, {}, false, true, '', 'success', [], { ok: false }, { success: false }, { ok: 'true' }, { success: 'true' }, { ok: 1 }, { success: 1 }, { data: { success: true } }]) {
    assert.equal(newsletterConfirmed(result), false, JSON.stringify(result));
  }
});

test('newsletter surfaces only safe string messages from supported error envelopes', () => {
  assert.equal(newsletterError({ message: 'Please enter a valid email.' }, 400), 'Please enter a valid email.');
  assert.equal(newsletterError({ message: ['Email is required.', 'Please try again.'] }, 400), 'Email is required. Please try again.');
  assert.equal(newsletterError({ error: 'Subscription service unavailable.' }, 500), 'Subscription service unavailable.');
  assert.equal(newsletterError({ message: { detail: 'Untrusted object' }, error: 'Safe fallback.' }, 400), 'Safe fallback.');
});

test('newsletter falls back to useful status messages instead of rendering arbitrary objects', () => {
  const unavailable = 'HIDI updates are temporarily unavailable. Please try again later.';
  const unconfirmed = 'Your subscription could not be confirmed. Please try again later.';
  for (const result of [null, undefined, {}, { message: { detail: 'Nested error' } }, { error: ['Nested error'] }, { message: [null, { detail: 'Nested error' }] }]) {
    assert.equal(newsletterError(result, 503), unavailable);
    assert.equal(newsletterError(result, 400), unconfirmed);
  }
});
