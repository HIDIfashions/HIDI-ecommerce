import { CollectionLinks } from "@/components/collection-links";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionBrowser } from "@/components/collection-browser";
import { getProducts } from "@/lib/api";
import { absoluteUrl, safeJsonLd } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const labels: Record<string, { title: string; copy: string }> = {
  all: { title: "Shop All", copy: "Explore the complete HIDI edit in one place." },
  "new-arrivals": { title: "All Products", copy: "Explore the complete HIDI edit in one place." },
  "work-edit": { title: "Work Wear", copy: "Considered Indian wear for your working week." },
  everyday: { title: "Casual Wear", copy: "Easy HIDI styles for everyday plans." },
  occasion: { title: "Occasional Wear", copy: "HIDI styles for celebrations and special occasions." },
  "casual-wear": {"title": "Casual Kurta Sets for Women", "copy": "Explore casual kurta sets and Indian wear for everyday dressing. Browse printed and embroidered designs, then compare each style’s fabric, garment measurements, included pieces and available sizes. Check whether your chosen outfit includes pants, a dupatta or both."},
  "work-wear": {"title": "Office Wear Kurta Sets for Women", "copy": "Build your working wardrobe with HIDI’s office wear kurta sets. Compare straight and coordinated silhouettes, floral designs and embroidery. Check the fabric, garment measurements, included pieces and available sizes on each product before choosing your work outfit."},
  "occasional-wear": {"title": "Occasion Wear Kurta & Anarkali Sets", "copy": "Explore occasion wear kurta and Anarkali sets for celebrations and festive plans. Discover embroidered designs and outfits with dupattas, with the exact included pieces listed on each product. Compare fabric, garment measurements and available sizes before choosing your outfit."},
  "ananyas-pick": { title: "Ananya’s Pick", copy: "Ananya’s selected styles from Casual, Work and Occasional Wear." },
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
  const collection = labels[slug];
  if (!collection) notFound();
  const products = await getProducts(slug === "all" || slug === "new-arrivals" ? undefined : slug);
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
    <header className="collection-header" style={{display:"block"}}><h1>{collection.title}</h1>{["casual-wear","work-wear","occasional-wear"].includes(slug) && <><p className="hidi-collection-intro" style={{maxWidth:"68ch",margin:"12px auto 0",fontSize:15,lineHeight:1.6}}>{collection.copy}</p><CollectionLinks current={slug} /></>}</header>
    <CollectionBrowser products={products} />
  </div>;
}
