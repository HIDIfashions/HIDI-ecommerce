import type { Metadata } from "next";
import { CollectionBrowser } from "@/components/collection-browser";
import { getProducts } from "@/lib/api";
import { absoluteUrl, safeJsonLd } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const title = "HIDI Kurta Sets & Indian Wear";
const description = "Explore HIDI kurta sets for everyday dressing, work and celebrations. Browse printed and embroidered styles, then compare each outfit’s fabric, included pieces and available sizes.";

export const metadata: Metadata = {
  title: { absolute: "HIDI Kurta Sets & Indian Wear for Women | Official Store" },
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
      { "@type": "ListItem", position: 2, name: "Shop All", item: absoluteUrl("/collections/all") },
    ],
  };

  return (
    <div className="container collection-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      <header className="collection-header">
        <h1>Shop All</h1>
      </header>

      <CollectionBrowser products={products} />
    </div>
  );
}
