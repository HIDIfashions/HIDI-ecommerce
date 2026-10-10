import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedTelemetry } from '../deploy/button-states/request-policy.mjs';

const base = 'https://thidigk.thehidi.com';

test('only exact telemetry origins and paths classify as already-blocked telemetry', () => {
  for (const url of [
    base + '/api/hidi/performance',
    '/api/hidi/performance?route=%2Fproducts%2Ftest',
    'https://www.google-analytics.com/g/collect?v=2',
    'https://www.google-analytics.com/collect',
    'https://region1.google-analytics.com/g/collect',
    'https://region1.google-analytics.com/collect?measurement_id=test',
    'https://lumberjack.razorpay.com/v2/logz',
    'https://lumberjack.razorpay.com:443/v2/logz?context=checkout',
  ]) assert.equal(isBlockedTelemetry('POST', url, base), true, url);
  assert.equal(isBlockedTelemetry('POST', 'http://127.0.0.1:3199/api/hidi/performance', 'http://127.0.0.1:3199'), true, 'Loopback candidate performance logging has its own exact origin');
});

test('other HTTP methods never classify as telemetry', () => {
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'post', '', null, undefined]) {
    for (const url of [base + '/api/hidi/performance', 'https://www.google-analytics.com/g/collect', 'https://lumberjack.razorpay.com/v2/logz']) {
      assert.equal(isBlockedTelemetry(method, url, base), false, `${method} ${url}`);
    }
  }
});

test('lookalike hosts, nondefault external ports and credential URLs remain unexpected', () => {
  for (const url of [
    'https://google-analytics.com/g/collect',
    'https://www.google-analytics.com.evil.example/g/collect',
    'https://evil.www.google-analytics.com/g/collect',
    'https://region2.google-analytics.com/collect',
    'https://www.google-analytics.com.:443/g/collect',
    'https://www.google-analytics.com:9443/g/collect',
    'https://user:password@www.google-analytics.com/g/collect',
    'https://lumberjack.razorpay.com.evil.example/v2/logz',
    'https://evil.lumberjack.razorpay.com/v2/logz',
    'https://razorpay.com/v2/logz',
    'https://lumberjack.razorpay.com:9443/v2/logz',
    'https://user@lumberjack.razorpay.com/v2/logz',
  ]) assert.equal(isBlockedTelemetry('POST', url, base), false, url);
});

test('external logging requires HTTPS and local performance requires the same origin', () => {
  for (const url of [
    'http://www.google-analytics.com/g/collect',
    'ftp://www.google-analytics.com/g/collect',
    'ws://region1.google-analytics.com/collect',
    'http://lumberjack.razorpay.com/v2/logz',
    'wss://lumberjack.razorpay.com/v2/logz',
    'https://thehidi.com/api/hidi/performance',
    'https://thidigk.thehidi.com.evil.example/api/hidi/performance',
    'http://thidigk.thehidi.com/api/hidi/performance',
    'https://thidigk.thehidi.com:8443/api/hidi/performance',
  ]) assert.equal(isBlockedTelemetry('POST', url, base), false, url);
  assert.equal(isBlockedTelemetry('POST', 'http://127.0.0.1:3200/api/hidi/performance', 'http://127.0.0.1:3199'), false, 'Different loopback ports are different origins');
});

test('telemetry path variants remain unexpected', () => {
  for (const url of [
    base + '/api/hidi/performance/',
    base + '/api/hidi/performance/orders',
    base + '/API/hidi/performance',
    base + '/api/hidi/%70erformance',
    'https://www.google-analytics.com/g/collect/',
    'https://www.google-analytics.com/G/collect',
    'https://region1.google-analytics.com/g/collect/order',
    'https://www.google-analytics.com/collecting',
    'https://lumberjack.razorpay.com/v2/logz/',
    'https://lumberjack.razorpay.com/v1/logz',
    'https://lumberjack.razorpay.com/v2/logs',
    'https://lumberjack.razorpay.com/v2/%6cogz',
  ]) assert.equal(isBlockedTelemetry('POST', url, base), false, url);
});

test('order, payment, COD, auth and product deletion writes remain unexpected', () => {
  for (const url of [
    base + '/api/store/orders',
    base + '/api/store/checkout/orders',
    base + '/api/store/checkout/place-order',
    base + '/api/store/checkout/cod',
    base + '/api/store/checkout/payments',
    base + '/api/store/checkout/payment-options',
    base + '/api/store/carts/fixture/items',
    base + '/api/admin/session',
    base + '/api/hidi/product-deletion/fixture',
    'https://api.razorpay.com/v1/orders',
    'https://api.razorpay.com/v1/payments',
    'https://lumberjack.razorpay.com/v2/payments',
    'https://www.google-analytics.com/g/collect/payment',
  ]) assert.equal(isBlockedTelemetry('POST', url, base), false, url);
});

test('malformed URLs and unsupported base origins fail closed without throwing', () => {
  for (const url of ['https://[invalid', 'http://', 'https://\u0000.invalid/v2/logz', 'javascript:alert(1)', 'data:text/plain,telemetry']) {
    assert.equal(isBlockedTelemetry('POST', url, base), false, url);
  }
  for (const origin of ['', 'not an origin', 'file:///tmp/', 'data:text/plain,base']) {
    assert.equal(isBlockedTelemetry('POST', '/api/hidi/performance', origin), false, origin);
  }
  assert.equal(typeof isBlockedTelemetry('POST', '/api/hidi/performance', base), 'boolean', 'Classification is synchronous and never sends a request');
});
