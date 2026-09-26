import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/api";
import { absoluteUrl } from "@/lib/site-url";

const PUBLIC_ROUTES = [
  { path: "/", priority: 1, changeFrequency: "daily" as const },
  { path: "/collections/new-arrivals", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/collections/work-edit", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/collections/everyday", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/collections/occasion", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/collections/all", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/shipping", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "/returns", priority: 0.4, changeFrequency: "monthly" as const },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
    }));

    return [...staticEntries, ...productEntries];
  } catch {
    // Keep core pages discoverable even if the catalogue API is temporarily unavailable.
    return staticEntries;
  }
}
