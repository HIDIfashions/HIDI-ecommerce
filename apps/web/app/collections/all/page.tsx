import type { Metadata } from "next";
import { CollectionBrowser } from "@/components/collection-browser";
import { getProducts } from "@/lib/api";
import { absoluteUrl, safeJsonLd } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const title = "Women’s Kurta Sets & Indian Wear";
const description = "Browse HIDI women’s kurta sets and Indian wear across work, casual and occasion edits. Compare product details, current prices and size information.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/collections/all" },
  openGraph: {
    type: "website",
    url: "/collections/all",
    title: `${title} | HIDI`,
    description,
    images: ["/brand/hidi-hero-green-garden-fullbody.webp"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | HIDI`,
    description,
    images: ["/brand/hidi-hero-green-garden-fullbody.webp"],
  },
};

export default async function ShopAllPage() {
  const products = await getProducts();
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: title, item: absoluteUrl("/collections/all") },
    ],
  };

  return (
    <div className="container collection-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      <header className="collection-header" style={{ display: "block" }}>
        <h1>{title}</h1>
        <p className="hidi-collection-intro" style={{ display: "block" }}>{description}</p>
      </header>

      <CollectionBrowser products={products} />
    </div>
  );
}
