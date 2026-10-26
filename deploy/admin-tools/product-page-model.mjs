// Match the existing storefront's labelled-fact contract without a SQL migration.
import { DETAIL_FIELDS, detailLine, stripDetailLines, readDetailValues } from './product-detail-fields.mjs';
export const FACTS = DETAIL_FIELDS;
export const narrative = stripDetailLines;
export function readFields(product) {
  const result = {};
  for (const key of ['name', 'categoryId', 'fabric', 'care']) result[key] = product[key] ?? '';
  result.description = narrative(product.description);
  result.shortDescription = narrative(product.shortDescription);
  result.collectionIds = (product.collections ?? []).map(item => item.collectionId);
  Object.assign(result, readDetailValues(product));
  return result;
}
function validate(value, label, max, required = false, singleLine = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(label + ' must be text of at most ' + max + ' characters.');
  if (required && !value.trim()) throw new Error(label + ' is required.');
  if (singleLine && /[\r\n]/.test(value)) throw new Error(label + ' must be on one line.');
  return value.trim() || null;
}
export function detailsPayload(product, fields) {
  const before = readFields(product), payload = {};
  for (const [key, label, limit, required] of [['name', 'Product name', 160, true], ['fabric', 'Fabric', 300], ['care', 'Care', 2000]]) {
    payload[key] = fields[key] === before[key] ? product[key] ?? null : validate(fields[key], label, limit, required);
  }
  const factsChanged = FACTS.some(fact => fields[fact.key] !== before[fact.key]);
  const narrativeChanged = fields.description !== before.description || fields.shortDescription !== before.shortDescription;
  for (const fact of FACTS) validate(fields[fact.key], fact.label, 1000, false, true);
  if (String(fields.description).split(/\r?\n/).some(detailLine) || String(fields.shortDescription).split(/\r?\n/).some(detailLine)) throw new Error('Use the separate Product details fields for labelled facts.');
  // Unrelated changes preserve original bytes, duplicate legacy facts and nulls.
  // A fact edit removes its old copies from BOTH fallback sources, so clearing
  // Includes cannot unexpectedly reveal an old value from shortDescription.
  payload.shortDescription = !factsChanged && fields.shortDescription === before.shortDescription
    ? product.shortDescription ?? null : validate(fields.shortDescription, 'Short description', 400);
  if (!factsChanged && !narrativeChanged) payload.description = product.description ?? null;
  else {
    const lines = [validate(fields.description, 'Full description', 10000), ...FACTS.filter(fact => fields[fact.key].trim()).map(fact => fact.stored + ': ' + fields[fact.key].trim())].filter(Boolean);
    payload.description = validate(lines.join('\n'), 'Full description including specifications', 10000);
  }
  payload.categoryId = fields.categoryId || null;
  payload.collectionIds = [...fields.collectionIds];
  payload.expectedUpdatedAt = product.updatedAt;
  return payload;
}
export function cm(value) { return value == null ? '' : String(value / 10); }
const measurementRanges = { bustMm: [200, 3000], waistMm: [200, 3000], hipMm: [200, 3000], shoulderMm: [100, 1000], sleeveLengthMm: [50, 1500], garmentLengthMm: [100, 2500] };
export const MEASUREMENTS = [ ['bustMm', 'Garment bust'], ['waistMm', 'Garment waist'], ['hipMm', 'Garment hip'], ['shoulderMm', 'Shoulder'], ['sleeveLengthMm', 'Sleeve length'], ['garmentLengthMm', 'Garment length'] ];
function paise(value, label) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) throw new Error(label + ': enter rupees with up to two decimal places.');
  const [whole, decimal = ''] = value.trim().split('.'), result = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result < 1 || result > 100000000) throw new Error(label + ' must be ₹0.01–₹10,00,000.');
  return result;
}
export function variantPayload(product, values) {
  const result = { pricePaise: paise(values.price, 'Selling price'), mrpPaise: paise(values.mrp, 'MRP'), active: values.active, expectedUpdatedAt: product.updatedAt };
  if (result.pricePaise > result.mrpPaise) throw new Error('Selling price cannot exceed MRP.');
  const weight = values.weight.trim();
  if (weight && (!/^\d+$/.test(weight) || Number(weight) < 1 || Number(weight) > 100000)) throw new Error('Packaged weight must be 1–100,000 whole grams, or blank.');
  result.weightGrams = weight ? Number(weight) : null;
  for (const [key, label] of MEASUREMENTS) {
    const value = values[key].trim(), [min, max] = measurementRanges[key];
    if (!value) { result[key] = null; continue; }
    if (!/^\d+(?:\.\d)?$/.test(value)) throw new Error(label + ': enter centimetres with at most one decimal place.');
    const mm = Math.round(Number(value) * 10);
    if (!Number.isSafeInteger(mm) || mm < min || mm > max) throw new Error(label + ' is outside the supported garment range.');
    result[key] = mm;
  }
  return result;
}
export function gallery(product, color) {
  const seen = new Set(), images = product.variants.filter(v => v.active && v.color === color).flatMap(v => v.images ?? []);
  return (images.length ? images : product.images ?? []).filter(photo => photo.url && !seen.has(photo.url) && seen.add(photo.url)).sort((a, b) => a.position - b.position);
}
export function contentGaps(product, fields) {
  const gaps = [];
  for (const [key, label] of [['fabric', 'Fabric'], ['care', 'Care'], ['includes', 'Included pieces'], ['fit', 'Fit']]) if (!fields[key]?.trim()) gaps.push(label);
  const colors = [...new Set(product.variants.filter(v => v.active).map(v => v.color))];
  for (const color of colors) if (!gallery(product, color).length) gaps.push('Photos for ' + color);
  if (product.variants.some(v => v.active && (!v.bustMm || !v.garmentLengthMm))) gaps.push('Verified bust and length for every enabled size');
  return gaps;
}
