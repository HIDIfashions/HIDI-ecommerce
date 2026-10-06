import type { Product } from "./domain";
import { discountPercent } from "./domain";

export type CatalogSort = "recommended" | "price-low" | "price-high" | "discount";
export type CatalogFilters = { sizes: string[]; colors: string[]; min?: number; max?: number; discount?: number };
export const emptyCatalogFilters: CatalogFilters = { sizes: [], colors: [] };

export function catalogFacets(products: Product[]) {
  return {
    sizes: Array.from(new Set(products.flatMap(p => p.variants.filter(v => v.available > 0).map(v => v.size)))).sort(),
    colors: Array.from(new Set(products.flatMap(p => p.variants.filter(v => v.available > 0).map(v => v.color)))).sort(),
  };
}
export function filterAndSortProducts(source: Product[], filters: CatalogFilters, sort: CatalogSort) {
  const filtered = source.filter(product => product.variants.some(variant =>
    variant.available > 0 &&
    (!filters.sizes.length || filters.sizes.includes(variant.size)) &&
    (!filters.colors.length || filters.colors.includes(variant.color)) &&
    (filters.min === undefined || variant.pricePaise >= filters.min * 100) &&
    (filters.max === undefined || variant.pricePaise <= filters.max * 100)
  ) && (filters.discount === undefined || discountPercent(product) >= filters.discount));
  return [...filtered].sort((a, b) => sort === "price-low" ? a.minPricePaise - b.minPricePaise : sort === "price-high" ? b.minPricePaise - a.minPricePaise : sort === "discount" ? discountPercent(b) - discountPercent(a) : 0);
}
