import type { Metadata } from "next";
import { CollectionBrowser } from "@/components/collection-browser";
import { getProducts } from "@/lib/api";
import { absoluteUrl, safeJsonLd } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const labels: Record<string, { title: string; copy: string }> = {
  all: { title: "Shop All", copy: "Explore the complete HIDI edit in one place." },
  "new-arrivals": { title: "New Arrivals", copy: "Fresh HIDI pieces, added in small considered edits." },
  "work-edit": { title: "Work Edit", copy: "Polished Indian wear for meetings, commutes and everything after." },
  everyday: { title: "Everyday", copy: "Easy silhouettes designed to earn their place in your weekly rotation." },
  occasion: { title: "Occasion", copy: "Elevated colour and detail, without the noise." },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = labels[slug];

  if (!collection) {
    return {
      title: "Collection not found",
      robots: { index: false, follow: false },
    };
  }

  const canonical = `/collections/${encodeURIComponent(slug)}`;
  return {
    title: collection.title,
    description: collection.copy,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title: `${collection.title} | HIDI`,
      description: collection.copy,
      images: ["/brand/hidi-hero-green-garden-fullbody.webp"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${collection.title} | HIDI`,
      description: collection.copy,
      images: ["/brand/hidi-hero-green-garden-fullbody.webp"],
    },
  };
}


export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = labels[slug] ?? labels["new-arrivals"];
  const products = await getProducts(slug === "all" ? undefined : slug);
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      {
        "@type": "ListItem",
        position: 2,
        name: collection.title,
        item: absoluteUrl(`/collections/${encodeURIComponent(slug)}`),
      },
    ],
  };

  return <div className="container collection-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
    <header className="collection-header"><p className="eyebrow">HIDI EDIT</p><h1>{collection.title}</h1><p>{collection.copy}</p></header>
    <CollectionBrowser products={products} />
  </div>;
}
