import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";
import { isSearchIndexingEnabled } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/admin",
      ],
    },
    // Crawlers must reach validation pages to observe the noindex header/tag.
    ...(isSearchIndexingEnabled() ? {
      sitemap: absoluteUrl("/sitemap.xml"),
      host: absoluteUrl("/").replace(/\/$/, ""),
    } : {}),
  };
}
