import type { ApiProduct } from "./api";
import { productFacts, productNarrative } from "./product-facts";
import { DETAIL_FIELDS } from '../../../deploy/admin-tools/product-detail-fields.mjs';
export type ProductSpecification = { label: string; value: string };

/** PDP presentation corrections; catalogue records and SEO metadata stay untouched. */
export function pdpInformation(product: ApiProduct, specifications: ProductSpecification[] = []) {
  const facts = productFacts(product);
  const isFuchsiaSet = product.slug === "hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants";
  const isRedSleevelessSet = product.slug === "hidi-054-red-embroidered-kurta-with-pants"
    && product.name === "2 Piece Embroidered Sleeveless Kurta Set & Bottom Straight Pants"
    && product.variants.length > 0 && product.variants.every(variant => variant.color.toLowerCase() === "red");
  const conciseName = product.name.replace(/^\s*\d+\s*piece\s+/i, "").replace(/\bAlong With\b/gi, "with").replace(/\s*&\s*Bottom\s+/gi, " with ").replace(/\s+/g, " ").trim();
  // A piece count is not model information. Only show an identifiable sizing detail.
  const model = facts.model && /\b(?:height|wearing|wears|\d\s*(?:ft|cm|feet))\b/i.test(facts.model) ? facts.model : null;
  const maintained = DETAIL_FIELDS.filter(field => !['includes','fit','lining','model'].includes(field.key) && facts.details[field.key])
    .map(field => ({label:field.label,value:facts.details[field.key]}));
  const labels = new Set(maintained.map(spec => spec.label.toLowerCase()));
  return {
    ...facts,
    model,
    specifications: [...maintained, ...specifications.filter(spec => !labels.has(spec.label.toLowerCase()) && (spec.label !== "Lining" || !facts.lining))],
    title: isFuchsiaSet ? "Fuchsia Pink Kurta Set with Straight Pants" : isRedSleevelessSet ? "Red Embroidered Sleeveless Kurta Set" : conciseName,
    includes: isFuchsiaSet || isRedSleevelessSet ? "Kurta + straight pants · 2 pieces" : facts.includes,
    fit: isFuchsiaSet || isRedSleevelessSet ? null : facts.fit,
    narrative: isFuchsiaSet
      ? "A fuchsia pink two-piece set with multicolour floral and bird detailing, a mandarin neckline and matching straight pants."
      : productNarrative(product.description),
  };
}
