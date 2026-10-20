import type { ApiProduct } from "./api";
import type { ProductSpecification } from "./pdp-information";
import reviewedSpecifications from "./pdp-reviewed-specifications.json";

type ReviewedProduct = {
  productId: string;
  catalogueName: string;
  catalogueFabric: string | null;
  catalogueDescription: string | null;
  styleCode: string;
  specifications: ProductSpecification[];
};

/** Called by the server page so the full audit snapshot stays out of client bundles. */
export function reviewedPdpSpecifications(product: ApiProduct): ProductSpecification[] {
  const reviewed = (reviewedSpecifications as Record<string, ReviewedProduct>)[product.slug];
  const styleCodes = new Set(product.variants.flatMap(variant =>
    Array.from(variant.sku.matchAll(/(HIDI|KUR|COR)[_-](\d{3})(?!\d)/gi), match => `${match[1].toUpperCase()}_${match[2]}`),
  ));
  // A catalogue edit invalidates the dated source review until it is rechecked.
  const matchesReview = reviewed && styleCodes.size === 1 && styleCodes.has(reviewed.styleCode)
    && reviewed.productId === product.id
    && reviewed.catalogueName === product.name
    && reviewed.catalogueFabric === (product.fabric ?? null)
    && reviewed.catalogueDescription === (product.description ?? null);
  return matchesReview ? reviewed.specifications.map(({ label, value }) => ({ label, value })) : [];
}
