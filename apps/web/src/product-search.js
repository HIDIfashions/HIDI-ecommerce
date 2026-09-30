// Match the existing commerce search without inventing inventory or hiding API failures.
function normalizeSearch(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function matchesProductSearch(product, query) {
  const words = normalizeSearch(String(query ?? '').slice(0, 160)).split(' ').filter(Boolean);
  if (!words.length) return false;
  const haystack = normalizeSearch([
    product.name, product.shortDescription, product.description, product.fabric,
    product.category?.name, ...product.collections.map(collection => collection.name),
    ...product.variants.flatMap(variant => [variant.color, variant.size, variant.sku]),
  ].filter(Boolean).join(' '));
  return words.every(word => haystack.includes(word));
}

const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const optionalText = value => value == null || typeof value === 'string';
const requiredText = value => typeof value === 'string' && value.trim().length > 0;

export function validateProductCatalogue(value) {
  const valid = Array.isArray(value) && value.every(product => record(product)
    && requiredText(product.name) && requiredText(product.slug)
    && ['fabric', 'shortDescription', 'description'].every(key => optionalText(product[key]))
    && (product.category == null || (record(product.category) && optionalText(product.category.name)))
    && Array.isArray(product.collections)
    && product.collections.every(collection => record(collection) && requiredText(collection.name))
    && Array.isArray(product.variants)
    && product.variants.every(variant => record(variant)
      && ['color', 'size', 'sku'].every(key => optionalText(variant[key]))));
  if (!valid) throw new Error('HIDI returned an invalid product catalogue. Please try again.');
  return value;
}

export async function loadSearchProducts({ signal, fetcher = fetch } = {}) {
  const response = await fetcher('/api/store/products', {
    method: 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json' }, signal,
  });
  if (!response?.ok || typeof response.json !== 'function') {
    const status = Number.isInteger(response?.status) ? ` (HTTP ${response.status})` : '';
    throw new Error(`Unable to load HIDI products${status}. Please try again.`);
  }
  let products;
  try {
    products = await response.json();
  } catch (cause) {
    if (cause?.name === 'AbortError' || signal?.aborted) throw cause;
    throw new Error('The HIDI product response could not be read. Please try again.', { cause });
  }
  return validateProductCatalogue(products);
}
