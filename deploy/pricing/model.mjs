export const target15 = mrp => Math.floor((mrp * 85 + 50) / 100);
export function sellingForDiscount(mrp, discount) {
  const value=String(discount).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw Error('Enter a discount from 0 to 99.99 with at most two decimal places.');
  const [whole,fraction='']=value.split('.'),basisPoints=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(mrp)||mrp<1||mrp>100000000||!Number.isSafeInteger(basisPoints)||basisPoints<0||basisPoints>=10000)throw Error('Enter a discount from 0 to 99.99 and a valid MRP.');
  const price=Math.floor((mrp*(10000-basisPoints)+5000)/10000);
  if(price<1)throw Error('The calculated selling price must be at least ₹0.01.');
  return price;
}
export function priceStatus(mrp, price) {
  const valid = Number.isSafeInteger(mrp) && Number.isSafeInteger(price) && mrp > 0 && price > 0 && price <= mrp && mrp <= 2147483647;
  return { valid, exact15: valid && price === target15(mrp), percent: valid ? (mrp - price) * 100 / mrp : null, suggestedPaise: valid ? target15(mrp) : null };
}
export function catalogueStatus(products) {
  const variants = Array.isArray(products) ? products.flatMap(p => p.variants || []) : [];
  return { products: products.length, variants: variants.length, ready: products.length > 0 && products.every(p => p.variants?.length > 0) && variants.every(v => priceStatus(v.mrpPaise, v.pricePaise).exact15), qualifying: variants.filter(v => priceStatus(v.mrpPaise, v.pricePaise).exact15).length };
}
export function paise(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())) throw Error('Use a positive rupee amount with at most two decimal places.');
  const [whole, fraction=''] = String(value).trim().split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result < 1 || result > 100000000) throw Error('Price is outside the supported range.');
  return result;
}
export function variantPayload(product, variant, mrp, price) {
  const mrpPaise = paise(mrp), pricePaise = paise(price);
  if (pricePaise > mrpPaise) throw Error('Selling price cannot exceed MRP.');
  if (!product.updatedAt || !variant.id || !(variant.weightGrams == null || Number.isSafeInteger(variant.weightGrams))) throw Error('Reload this product before saving.');
  const body = { mrpPaise, pricePaise, weightGrams: variant.weightGrams, active: variant.active, expectedUpdatedAt: product.updatedAt };
  for (const key of ['bustMm','waistMm','hipMm','shoulderMm','sleeveLengthMm','garmentLengthMm']) body[key] = variant[key] ?? null;
  return body;
}
