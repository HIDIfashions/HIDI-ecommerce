import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/api";
import { absoluteUrl } from "@/lib/site-url";
import { isSearchIndexingEnabled } from "@/lib/seo";

export const dynamic = "force-dynamic";

const PUBLIC_ROUTES = [
  { path: "/", priority: 1, changeFrequency: "daily" as const },
  { path: "/collections/casual-wear", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/collections/work-wear", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/collections/occasional-wear", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/collections/ananyas-pick", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/collections/all", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/shipping", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "/returns", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "/offers", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "/contact", priority: 0.4, changeFrequency: "monthly" as const },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isSearchIndexingEnabled()) return [];
  const staticEntries: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const products = await getProducts();
    const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
      url: absoluteUrl(`/products/${encodeURIComponent(product.slug)}`),
      changeFrequency: "daily",
      priority: 0.8,
      images: product.images.filter((image) => Boolean(image.url)).map((image) => absoluteUrl(image.url)),
    }));

    return [...staticEntries, ...productEntries];
  } catch {
    // Keep core pages discoverable even if the catalogue API is temporarily unavailable.
    return staticEntries;
  }
}
