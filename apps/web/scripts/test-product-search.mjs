import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSearchProducts, matchesProductSearch, validateProductCatalogue } from '../src/product-search.js';

const product = {
  name: 'Áara Sage Work Kurta', slug: 'aara-sage-work-kurta', fabric: 'Cotton',
  shortDescription: 'Everyday comfort', description: 'Finished with embroidery',
  category: { name: 'Kurta Sets' },
  collections: [{ name: 'Work Edit' }, { name: 'New Arrivals' }],
  variants: [{ color: 'Sage Green', size: 'XXL', sku: 'HI-9987-SG', available: 0 }],
};

test('search matches product words regardless of order, case, accents and punctuation', () => {
  for (const query of ['sage kurta', 'KURTA SAGE', 'aara', 'ÁARA', 'Sage—Aara', 'wórk, kurta!']) {
    assert.equal(matchesProductSearch(product, query), true, query);
  }
  assert.equal(matchesProductSearch({ ...product, name: "Meher Women’s Kurta" }, 'womens kurta'), true);
});

test('search includes the available catalogue fields and joins words across fields', () => {
  for (const query of ['cotton', 'sets', 'arrivals', 'xxl', 'green', '9987', 'comfort', 'embroidery', 'green cotton']) {
    assert.equal(matchesProductSearch(product, query), true, query);
  }
  // Search discovery includes a style even if its variant is currently out of stock,
  // matching the existing storefront. Purchasing checks stock separately.
  assert.equal(matchesProductSearch(product, 'xxl green'), true);
});

test('empty, punctuation-only and unknown queries do not match; all words are required', () => {
  for (const query of ['', '  ', '?!', 'denim', 'sage denim', 'sari']) {
    assert.equal(matchesProductSearch(product, query), false, query);
  }
  assert.equal(matchesProductSearch({ ...product, collections: [], variants: [], category: null }, 'sage'), true);
});

test('catalogue validation preserves valid data and distinguishes empty catalogue from malformed data', () => {
  const catalogue = [product];
  assert.equal(validateProductCatalogue(catalogue), catalogue);
  assert.deepEqual(validateProductCatalogue([]), []);
  assert.deepEqual(validateProductCatalogue([{ name: 'Kurta', slug: 'kurta', collections: [], variants: [] }]),
    [{ name: 'Kurta', slug: 'kurta', collections: [], variants: [] }]);
  for (const value of [null, {}, { products: [product] }, [null], [
    { ...product, name: ' ' },
  ], [{ ...product, slug: '' }], [{ ...product, collections: null }],
  [{ ...product, variants: {} }], [{ ...product, collections: ['Work Edit'] }],
  [{ ...product, variants: [null] }], [{ ...product, fabric: {} }]]) {
    assert.throws(() => validateProductCatalogue(value), /invalid product catalogue/);
  }
});

test('loader calls only the same-origin public API with GET, uncached data and cancellation signal', async () => {
  const controller = new AbortController();
  const catalogue = [product];
  let calls = 0;
  const loaded = await loadSearchProducts({ signal: controller.signal, fetcher: async (url, options) => {
    calls += 1;
    assert.equal(url, '/api/store/products');
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(Object.hasOwn(options, 'body'), false);
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
    return { ok: true, status: 200, json: async () => catalogue };
  } });
  assert.equal(calls, 1);
  assert.equal(loaded, catalogue);
});

test('HTTP, JSON, schema and network failures reject instead of becoming empty search results', async () => {
  await assert.rejects(loadSearchProducts({ fetcher: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  await assert.rejects(loadSearchProducts({ fetcher: async () => ({ ok: true, json: async () => {
    throw new SyntaxError('HTML instead of JSON');
  } }) }), /could not be read/);
  await assert.rejects(loadSearchProducts({ fetcher: async () => ({ ok: true, json: async () => ({ message: 'unavailable' }) }) }),
    /invalid product catalogue/);
  const networkError = new TypeError('Connection lost');
  await assert.rejects(loadSearchProducts({ fetcher: async () => { throw networkError; } }), error => error === networkError);
});

test('cancellation is preserved and a valid empty response remains an empty catalogue', async () => {
  const abort = new DOMException('Cancelled', 'AbortError');
  await assert.rejects(loadSearchProducts({ fetcher: async () => { throw abort; } }), error => error === abort);
  await assert.rejects(loadSearchProducts({ fetcher: async () => ({ ok: true, json: async () => { throw abort; } }) }),
    error => error === abort);
  assert.deepEqual(await loadSearchProducts({ fetcher: async () => ({ ok: true, json: async () => [] }) }), []);
});
