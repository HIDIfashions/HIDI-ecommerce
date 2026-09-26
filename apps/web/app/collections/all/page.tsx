import type { Metadata } from "next";
import { CollectionBrowser } from "@/components/collection-browser";
import { getProducts } from "@/lib/api";
import { absoluteUrl, safeJsonLd } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const title = "Shop All";
const description = "Explore the complete HIDI edit in one place.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/collections/all" },
  openGraph: {
    type: "website",
    url: "/collections/all",
    title: "Shop All | HIDI",
    description,
    images: ["/brand/hidi-hero-green-garden-fullbody.webp"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shop All | HIDI",
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
      <header className="collection-header">
        <p className="eyebrow">HIDI EDIT</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <CollectionBrowser products={products} />
    </div>
  );
}
