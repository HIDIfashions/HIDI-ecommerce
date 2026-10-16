export const IMAGE_SKU_ENDPOINT = '/api/hidi/product-image-skus';
export const canonicalColour = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export const imageSkuKey = value => String(value ?? '').normalize('NFKC').trim().toUpperCase();
export const validImageSku = value => /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/.test(value) && value.length <= 64;
const MIME = {jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png', avif: 'image/avif'};
export function validateImageSkuRows(input) {
  const rows = input.map(row => ({...row, imageSku: imageSkuKey(row.imageSku), errors: [...row.errors]}));
  const targets = new Map(), codes = new Map();
  for (const row of rows) {
    if (row.mode !== 'NEW' || !row.imageSku) continue;
    if (!validImageSku(row.imageSku)) row.errors.push('Image SKU must use letters, numbers, underscores or hyphens, start with a letter, and be at most 64 characters. Example: KUR_001.');
    const target = row.productSlug + '\u0000' + canonicalColour(row.color);
    if (!targets.has(target)) targets.set(target, new Set()); targets.get(target).add(row.imageSku);
    if (!codes.has(row.imageSku)) codes.set(row.imageSku, new Set()); codes.get(row.imageSku).add(target);
  }
  for (const row of rows) if (row.mode === 'NEW') {
    const choices = targets.get(row.productSlug + '\u0000' + canonicalColour(row.color));
    if (choices?.size > 1) row.errors.push('Use one Image SKU for every size of the same product and colour.');
    else if (choices?.size === 1 && !row.imageSku) row.imageSku = [...choices][0];
    if (row.imageSku && codes.get(row.imageSku)?.size > 1) row.errors.push('Image SKU ' + row.imageSku + ' is used for different products or colours. Use a unique code for each product colour.');
  }
  return rows;
}
async function request(url, method = 'GET', body) {
  const response = await fetch(url, {method, credentials: 'same-origin', cache: 'no-store', headers: body ? {'content-type': 'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined});
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.message || 'Unable to complete Image SKU mapping.'), {status: response.status});
  return value;
}
export async function preflightMappings(rows) {
  const bindings = rows.filter(row => row.mode === 'NEW' && row.imageSku).map(row => ({imageSku: row.imageSku, productSlug: row.productSlug, color: row.color}));
  if (bindings.length) await request(IMAGE_SKU_ENDPOINT + '/preflight', 'POST', {bindings});
}
export async function saveImageSku(row, product) {
  if (!row.imageSku) return;
  await request(IMAGE_SKU_ENDPOINT, 'POST', {imageSku: row.imageSku, productId: product.id, color: row.color, expectedUpdatedAt: product.updatedAt});
}
export function parseImageSkuPhoto(name) {
  const base = String(name).replace(/\\/g, '/').split('/').pop();
  const match = base?.match(/^(.+)_([0-9]{1,4})(?:_main)?\.([a-z0-9]+)$/i);
  if (!match) return null;
  const imageSku = imageSkuKey(match[1]), sequence = Number(match[2]), extension = match[3].toLowerCase();
  if (!validImageSku(imageSku)) return null;
  return {imageSku, sequence, mime: MIME[extension], isMain: sequence === 1};
}
export function photoTarget(product, binding) {
  if (!product?.id || product.id !== binding.productId || !['DRAFT', 'ACTIVE'].includes(product.status)) throw new Error('The mapped product is unavailable or archived. Review its Image SKU before uploading.');
  const variants = (product.variants || []).filter(variant => canonicalColour(variant.color) === canonicalColour(binding.color));
  if (!variants.length || !variants.some(variant => variant.active !== false)) throw new Error('The mapped colour has no active size variants.');
  // The existing upload endpoint shares photos with the exact stored colour spelling.
  if (new Set(variants.map(variant => variant.color)).size !== 1) throw new Error('This product has conflicting spellings for the same colour. Correct its colour variants before uploading.');
  variants.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {variantId: variants.find(variant => variant.active !== false).id, targetVariantIds: variants.map(variant => variant.id).sort(), productId: product.id, color: variants[0].color};
}
export async function prepareMappedPhotos(candidates, api = request) {
  if (!candidates.some(item => item.error && parseImageSkuPhoto(item.sourceName))) return candidates;
  const registry = await api(IMAGE_SKU_ENDPOINT);
  if (!Array.isArray(registry.bindings)) throw new Error('Image SKU mapping response is incomplete.');
  const bindings = new Map(registry.bindings.map(binding => [binding.imageSku, binding]));
  const products = new Map();
  const output = [];
  for (const item of candidates) {
    const parsed = parseImageSkuPhoto(item.sourceName), binding = parsed && bindings.get(parsed.imageSku);
    if (!binding) {output.push({...item, error: item.error ? 'No saved Image SKU or HIDI SKU matches this filename. Import the product with image_sku first.' : null}); continue;}
    let target, error = null;
    try {
      if (!parsed.mime) throw new Error('Use JPEG, JPG, WebP, PNG or AVIF images.');
      if (item.file.size < 1 || item.file.size > 12 * 1024 * 1024) throw new Error('Each image must be between 1 byte and 12 MB.');
      if (item.file.type && item.file.type !== parsed.mime) throw new Error('Image type and filename extension do not match.');
      if (parsed.sequence < 1 || parsed.sequence > 9999) throw new Error('Photo number must be 1–9999. Example: KUR_001_1.jpeg.');
      if (!products.has(binding.productId)) products.set(binding.productId, await api('/api/admin/products/' + encodeURIComponent(binding.productId)));
      target = photoTarget(products.get(binding.productId), binding);
      if (!item.error && item.variantId && !target.targetVariantIds.includes(item.variantId)) throw new Error('This filename matches another HIDI SKU as well. Use a different Image SKU.');
    } catch (caught) {error = caught.message;}
    const file = parsed.mime && !item.file.type ? new File([item.file], item.file.name, {type: parsed.mime}) : item.file;
    output.push({...item, ...target, file, sku: parsed.imageSku, imageSku: parsed.imageSku, sequence: parsed.sequence, isMain: parsed.isMain, error});
  }
  const numbers = new Map();
  for (const item of output) if (item.imageSku) {
    const key = item.imageSku + '\u0000' + item.sequence;
    if (!numbers.has(key)) numbers.set(key, []); numbers.get(key).push(item);
  }
  for (const items of numbers.values()) if (items.length > 1) for (const item of items) item.error = 'Duplicate photo number for ' + item.imageSku + '. Upload either the JPEG or WebP for this number, or give the files different numbers.';
  return output.sort((a, b) => a.imageSku && b.imageSku ? a.imageSku.localeCompare(b.imageSku) || a.sequence - b.sequence : a.imageSku ? -1 : b.imageSku ? 1 : 0);
}
const uploaded = new WeakMap();
const attempted = new WeakSet();
function confirms(product, item, suffix, legacyAlt) {
  const targets = item.targetVariantIds.map(id => product.variants?.find(variant => variant.id === id));
  const images = targets[0]?.images || [];
  return images.find(image => typeof image.url === 'string' && (
    new URL(image.url, 'https://local.invalid').pathname.endsWith(suffix) && targets.every(target => target?.images?.some(photo => photo.url === image.url)) ||
    legacyAlt && image.alt === legacyAlt && targets.every(target => target?.images?.some(photo => photo.url === image.url && photo.alt === legacyAlt))
  ));
}
export async function uploadMappedPhotoCandidate(item, api = request) {
  if (item.error || !item.imageSku || !item.variantId) throw new Error(item.error || 'Photo has no saved Image SKU mapping.');
  if (uploaded.has(item)) return uploaded.get(item);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await item.file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([item.imageSku, String(item.sequence), item.file.type, digest].join('\u0000')));
  const key = [...new Uint8Array(keyBytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const suffix = '/batch-' + key + '.' + ({'image/jpeg':'jpg','image/webp':'webp','image/png':'png','image/avif':'avif'})[item.file.type];
  // Preserve uploads made with the first Image SKU release during an upgrade.
  const legacyAlt = 'Image SKU ' + item.imageSku + ' · photo ' + item.sequence + ' · sha256:' + digest;
  const path = '/api/admin/products/' + encodeURIComponent(item.productId);
  const current = await api(path), target = photoTarget(current, {productId: item.productId, color: item.color});
  if (target.variantId !== item.variantId || target.targetVariantIds.join() !== item.targetVariantIds.join()) throw new Error('Product size variants changed after the photo preview. Select the photos again.');
  const alt = current.name + ' · ' + item.color + ' · photo ' + item.sequence;
  const previous = confirms(current, item, suffix, legacyAlt);
  if (previous) {const result = {id: item.variantId, skipped: true, images: current.variants.find(variant => variant.id === item.variantId).images}; uploaded.set(item, result); return result;}
  if (attempted.has(item)) throw new Error('The previous upload is still unconfirmed. Review the saved product photos before selecting this file again.');
  attempted.add(item);
  const form = new FormData(); form.set('file', item.file); form.set('applyToColor', 'true'); form.set('imageSku', item.imageSku); form.set('photoNumber', String(item.sequence)); form.set('alt', alt);
  let saved, failure;
  try {
    const response = await fetch('/api/admin/inventory/' + encodeURIComponent(item.variantId) + '/images', {method: 'POST', credentials: 'same-origin', body: form, signal: AbortSignal.timeout(90000)});
    saved = await response.json().catch(() => ({}));
    if (!response.ok || saved.id !== item.variantId || !confirms({variants: item.targetVariantIds.map(id => ({id, images: saved.images}))}, item, suffix)) throw new Error(saved.message || 'Photo attachment was not confirmed.');
  } catch (error) {failure = error;}
  // A lost successful response is reconciled before allowing a retry.
  const after = await api(path).catch(() => null);
  if (!after || !confirms(after, item, suffix, legacyAlt)) throw new Error((failure?.message || 'Photo attachment could not be confirmed for every size.') + ' Check the product photos, then resume.');
  const result = {id: item.variantId, images: after.variants.find(variant => variant.id === item.variantId).images};
  uploaded.set(item, result); return result;
}
