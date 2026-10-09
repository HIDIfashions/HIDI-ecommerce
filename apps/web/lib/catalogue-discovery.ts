import type { ApiProduct, ApiVariant } from "./api";
export type CatalogueFilters = { sizes: string[]; colors: string[]; fabrics: string[]; price: string; sort: string };
export const PRICE_LABELS: Record<string, string> = { under1500: "Under ₹1,500", "1500to2000": "₹1,500–₹2,000", over2000: "Above ₹2,000" };
export function priceMatches(paise: number, filter: string): boolean {
  if (!Number.isSafeInteger(paise) || paise < 0) return false;
  if (filter === "under1500") return paise < 150000;
  if (filter === "1500to2000") return paise >= 150000 && paise <= 200000;
  if (filter === "over2000") return paise > 200000;
  return true;
}
/** Size, colour and price must be available on the SAME SKU. Never mutate stock. */
export function matchingVariants(product: ApiProduct, filters: CatalogueFilters): ApiVariant[] {
  return product.variants.filter(v => v.available > 0 &&
    (!filters.sizes.length || filters.sizes.includes(v.size)) &&
    (!filters.colors.length || filters.colors.includes(v.color)) && priceMatches(v.pricePaise, filters.price));
}
export function filterCatalogue(products: ApiProduct[], filters: CatalogueFilters): ApiProduct[] {
  const variantFiltered = Boolean(filters.sizes.length || filters.colors.length || filters.price);
  const relevantPrice = (p: ApiProduct) => {
    const values = matchingVariants(p, filters).map(v => v.pricePaise);
    return values.length ? Math.min(...values) : p.minPricePaise;
  };
  return products.filter(p => (!filters.fabrics.length || Boolean(p.fabric && filters.fabrics.includes(p.fabric))) &&
    (!variantFiltered || (p.inStock && matchingVariants(p, filters).length > 0)))
    .sort((a, b) => filters.sort === "price-low" ? relevantPrice(a) - relevantPrice(b)
      : filters.sort === "price-high" ? relevantPrice(b) - relevantPrice(a)
      : filters.sort === "name" ? a.name.localeCompare(b.name, "en", { sensitivity: "base" }) : 0);
}
export function normalizeSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
/** Token order is irrelevant; overlay and full search use this same rule. */
export function matchesProductSearch(product: ApiProduct, query: string): boolean {
  const words = normalizeSearch(query.slice(0, 160)).split(" ").filter(Boolean);
  if (!words.length) return false;
  const haystack = normalizeSearch([product.name, product.shortDescription, product.description, product.fabric,
    product.category?.name, ...product.collections.flatMap(c => c.slug === "work-edit" ? [c.name, "Workwear Edit"] : [c.name]), ...product.variants.flatMap(v => [v.color, v.size, v.sku])].filter(Boolean).join(" "));
  return words.every(word => haystack.includes(word));
}
