import type { ApiProduct } from "./api";

const INDEXABLE_PRODUCTION_HOSTS = new Set([
  "thehidi.com",
  "www.thehidi.com",
  "hidiindia.com",
  "www.hidiindia.com",
]);

export function isSearchIndexingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  // Launch is explicit. A validation/preview deployment can never opt in.
  if (env.DEPLOYMENT_STAGE === "validation" || env.VERCEL_ENV === "preview") return false;
  if (env.ALLOW_PUBLIC_DOMAIN !== "true") return false;
  try {
    const url = new URL(env.SITE_URL || env.NEXT_PUBLIC_SITE_URL || "");
    return url.protocol === "https:" && INDEXABLE_PRODUCTION_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Sizes/colours are offers from HIDI, not an aggregation of merchants. */
export function productOffers(product: ApiProduct, url: string) {
  return product.variants.map((variant) => ({
    "@type": "Offer",
    sku: variant.sku,
    name: [product.name, variant.color, variant.size].filter(Boolean).join(" — "),
    priceCurrency: "INR",
    price: (variant.pricePaise / 100).toFixed(2),
    availability: variant.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    seller: { "@type": "Organization", name: "HIDI" },
    url,
  }));
}
