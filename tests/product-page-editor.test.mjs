import test from 'node:test';
import assert from 'node:assert/strict';
import { readFields, detailsPayload, variantPayload, gallery } from '../deploy/admin-tools/product-page-model.mjs';
import { parseEdit, parseVariantEdit } from '../apps/api/src/admin/products/product-input.ts';
const record = () => ({ name: 'Aashi', categoryId: 'cotton', shortDescription: 'Three piece set\nIncludes: old fallback', description: 'Original narrative\r\n Includes : kurta, pants, dupatta\r\nFit: Straight\r\nFit: duplicate legacy\r\nSupplier code: AA_123', fabric: 'Cotton', care: null, updatedAt: '2026-10-13T00:00:00.000Z', collections: [{ collectionId: 'old-inactive' }], variants: [], images: [] });
test('an unrelated edit preserves raw descriptions, unknown supplier fields, nulls and inactive collections', () => {
  const p = record(), f = readFields(p); f.name = 'Renamed'; const body = detailsPayload(p, f);
  assert.equal(body.description, p.description); assert.equal(body.shortDescription, p.shortDescription); assert.equal(body.care, null); assert.deepEqual(body.collectionIds, ['old-inactive']);
  assert.equal(parseEdit(body).name, 'Renamed');
});
test('clearing a fact removes its description and short-description fallbacks', () => {
  const p = record(), f = readFields(p); f.includes = ''; const body = detailsPayload(p, f);
  assert(!/includes\s*:/i.test(body.description)); assert(!/includes\s*:/i.test(body.shortDescription)); assert.equal(readFields({ ...p, ...body }).includes, '');
  assert(body.description.includes('Supplier code: AA_123')); assert.equal(readFields({ ...p, ...body }).fit, 'Straight'); parseEdit(body);
});
test('all four specification fields round-trip through the actual backend contract', () => {
  const p = record(), f = readFields(p); Object.assign(f, { includes: 'Kurta + pants + dupatta', fit: 'Relaxed', lining: 'Unlined', model: '168 cm; wears M' });
  const body = detailsPayload(p, f); parseEdit(body); const result = readFields({ ...p, ...body });
  for (const key of ['includes', 'fit', 'lining', 'model']) assert.equal(result[key], f[key]);
  assert.equal(body.expectedUpdatedAt, p.updatedAt); assert.equal(Object.keys(body).some(k => /stock|status|sku|slug/i.test(k)), false);
});
test('combined text and one-line fact validation prevent overflowing storage or injecting a second label', () => {
  const p = record(), f = readFields(p); f.includes = 'Kurta\nFit: invented'; assert.throws(() => detailsPayload(p, f), /one line/);
  f.includes = 'Kurta'; f.description = 'x'.repeat(10000); assert.throws(() => detailsPayload(p, f), /10000/);
  f.description = 'Fit: inserted into the wrong field'; assert.throws(() => detailsPayload(p, f), /separate/);
});
test('SKU edits preserve the exact paise and mm contracts and do not submit inventory or identity', () => {
  const values = { price: '1999.50', mrp: '2499', weight: '350', active: true, bustMm: '101.6', waistMm: '', hipMm: '106.7', shoulderMm: '38.1', sleeveLengthMm: '55.9', garmentLengthMm: '114.3' };
  const result = variantPayload(record(), values); assert.equal(result.pricePaise, 199950); assert.equal(result.bustMm, 1016); assert.equal(result.waistMm, null); parseVariantEdit(result);
  assert(!('color' in result)); assert(!('sku' in result)); assert(!('inventory' in result));
  assert.throws(() => variantPayload(record(), { ...values, price: '2500' }), /exceed/);
  assert.throws(() => variantPayload(record(), { ...values, bustMm: '101.65' }), /decimal/);
});
test('gallery follows enabled colour variants and uses shared fallback without duplicate photos', () => {
  const photo = { id: 'one', url: '/one.png', position: 0 }, p = record(); p.images = [{ id: 'fallback', url: '/fallback.png', position: 0 }];
  p.variants = [{ color: 'Sky Blue', active: true, images: [photo] }, { color: 'Sky Blue', active: true, images: [{ ...photo, id: 'two' }] }, { color: 'Sky Blue', active: false, images: [{ id: 'disabled', url: '/disabled.png', position: 0 }] }];
  assert.deepEqual(gallery(p, 'Sky Blue'), [photo]); assert.deepEqual(gallery(p, 'Other'), p.images);
});
