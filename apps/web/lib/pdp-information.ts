import type { ApiProduct } from "./api";
import { productFacts, productNarrative } from "./product-facts";
export type ProductSpecification = { label: string; value: string };

/** PDP presentation corrections; catalogue records and SEO metadata stay untouched. */
export function pdpInformation(product: ApiProduct, specifications: ProductSpecification[] = []) {
  const facts = productFacts(product);
  const isFuchsiaSet = product.slug === "hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants";
  // A piece count is not model information. Only show an identifiable sizing detail.
  const model = facts.model && /\b(?:height|wearing|wears|\d\s*(?:ft|cm|feet))\b/i.test(facts.model) ? facts.model : null;
  return {
    ...facts,
    model,
    specifications: specifications.filter(spec => spec.label !== "Lining" || !facts.lining),
    title: isFuchsiaSet ? "Fuchsia Pink Kurta Set with Straight Pants" : product.name,
    includes: isFuchsiaSet ? "Kurta + straight pants · 2 pieces" : facts.includes,
    fit: isFuchsiaSet ? null : facts.fit,
    narrative: isFuchsiaSet
      ? "A fuchsia pink two-piece set with multicolour floral and bird detailing, a mandarin neckline and matching straight pants."
      : productNarrative(product.description),
  };
}
