import NetInfo from "@react-native-community/netinfo";
import { hidiEndpoints } from "../network/endpoints";
import { hidiRequest } from "../network/apiClient";
import { ApiProduct } from "../models/product";
import { localStore } from "../storage/localStore";

export type CatalogSnapshot = {
  products: ApiProduct[];
  freshness: "fresh" | "offline-cache";
  savedAt?: number;
};

function validProduct(value: unknown): value is ApiProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Partial<ApiProduct>;
  return typeof product.id === "string" &&
    typeof product.slug === "string" &&
    typeof product.name === "string" &&
    Array.isArray(product.images) &&
    Array.isArray(product.variants) &&
    Array.isArray(product.collections);
}

export async function getCatalog(): Promise<CatalogSnapshot> {
  const connection = await NetInfo.fetch().catch(() => null);
  if (connection?.isConnected === false) {
    const cached = await localStore.catalogCache();
    const products = (cached?.products ?? []).filter(validProduct);
    if (products.length) return { products, freshness: "offline-cache", savedAt: cached?.savedAt };
    throw Object.assign(new Error("You’re offline and there is no saved catalogue on this device yet."), { code: "OFFLINE_NO_CACHE" });
  }

  try {
    const products = await hidiRequest<ApiProduct[]>(hidiEndpoints.products);
    if (!Array.isArray(products) || !products.every(validProduct)) throw new Error("Invalid catalogue response.");
    await localStore.saveCatalogCache(products);
    return { products, freshness: "fresh" };
  } catch (error) {
    const cached = await localStore.catalogCache();
    const products = (cached?.products ?? []).filter(validProduct);
    if (products.length) return { products, freshness: "offline-cache", savedAt: cached?.savedAt };
    throw error;
  }
}

export async function getFeatured(limit = 6) {
  try {
    const products = await hidiRequest<ApiProduct[]>(hidiEndpoints.featured + "?limit=" + Math.min(Math.max(limit, 1), 8));
    return Array.isArray(products) ? products.filter(validProduct) : [];
  } catch {
    return [];
  }
}

export function normalizeSearch(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesSearch(product: ApiProduct, query: string) {
  const words = normalizeSearch(query.slice(0, 160)).split(" ").filter(Boolean);
  if (!words.length) return false;
  const haystack = normalizeSearch([
    product.name,
    product.shortDescription,
    product.description,
    product.fabric,
    product.category?.name,
    ...product.collections.map((item) => item.name),
    ...product.variants.flatMap((variant) => [variant.color, variant.size, variant.sku]),
  ].filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export type Filters = {
  sizes: string[];
  colors: string[];
  fabrics: string[];
  minPricePaise?: number;
  maxPricePaise?: number;
};

export type SortKey = "recommended" | "newest" | "price-low" | "price-high" | "rating";

export const emptyFilters: Filters = { sizes: [], colors: [], fabrics: [] };

export function filterProducts(products: ApiProduct[], filters: Filters) {
  return products.filter((product) => {
    if (filters.fabrics.length && (!product.fabric || !filters.fabrics.includes(product.fabric))) return false;
    const variants = product.variants.filter((variant) => variant.available > 0);
    if (filters.sizes.length && !variants.some((variant) => filters.sizes.includes(variant.size))) return false;
    if (filters.colors.length && !variants.some((variant) => filters.colors.includes(variant.color))) return false;
    if (filters.minPricePaise !== undefined && product.maxPricePaise < filters.minPricePaise) return false;
    if (filters.maxPricePaise !== undefined && product.minPricePaise > filters.maxPricePaise) return false;
    return true;
  });
}

export function sortProducts(products: ApiProduct[], sort: SortKey) {
  const result = [...products];
  if (sort === "price-low") return result.sort((a,b) => a.minPricePaise - b.minPricePaise || a.id.localeCompare(b.id));
  if (sort === "price-high") return result.sort((a,b) => b.minPricePaise - a.minPricePaise || a.id.localeCompare(b.id));
  if (sort === "rating") return result.sort((a,b) => (b.averageRating ?? -1) - (a.averageRating ?? -1) || a.id.localeCompare(b.id));
  return result;
}

export function facets(products: ApiProduct[]) {
  const sizes = new Set<string>(), colors = new Set<string>(), fabrics = new Set<string>();
  for (const product of products) {
    if (product.fabric) fabrics.add(product.fabric);
    for (const variant of product.variants) if (variant.available > 0) {
      if (variant.size) sizes.add(variant.size);
      if (variant.color) colors.add(variant.color);
    }
  }
  return {
    sizes: Array.from(sizes).sort(),
    colors: Array.from(colors).sort(),
    fabrics: Array.from(fabrics).sort(),
  };
}
