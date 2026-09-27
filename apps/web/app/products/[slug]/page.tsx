import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { ProductGallery } from "@/components/product-gallery";
import { ProductInfoAccordion } from "@/components/product-info-accordion";
import { WishlistButton } from "@/components/wishlist-button";
import { ProductReviews } from "@/components/product-reviews";
import { ProductQualitySummary } from "@/components/product-quality-summary";
import { ProductContactActions } from "@/components/product-contact-actions";
import { RetentionTracker } from "@/components/retention-tracker";
import { ProductCard } from "@/components/product-card";
import { RecentlyViewedProducts } from "@/components/recently-viewed-products";
import { formatPaise, getProduct, getProductReviews, getRelatedProducts } from "@/lib/api";
import { absoluteUrl, safeJsonLd } from "@/lib/site-url";
import { productOffers } from "@/lib/seo";
import { DeliveryCheck } from "@/components/delivery-check";

export const dynamic = "force-dynamic";

const getProductPageData = cache(getProduct);

function productDescription(product: NonNullable<Awaited<ReturnType<typeof getProduct>>>) {
  const value =
    product.shortDescription?.trim() ||
    product.description?.trim() ||
    `Shop ${product.name} from HIDI — modern Indian wear for work, everyday and occasions.`;
  return value.length > 160 ? value.slice(0, 157).trimEnd() + "…" : value;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductPageData(slug);

  if (!product) {
    return {
      title: "Product not found",
      robots: { index: false, follow: false },
    };
  }

  const description = productDescription(product);
  const canonical = `/products/${encodeURIComponent(product.slug)}`;
  const images = product.images.slice(0, 4).map((image) => ({
    url: image.url,
    alt: image.alt || product.name,
  }));

  return {
    title: product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title: product.name,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: images.length ? images.map((image) => image.url) : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductPageData(slug);
  if (!product) notFound();
  const [reviews, related] = await Promise.all([
    getProductReviews(product.id),
    getRelatedProducts(product.slug, 4),
  ]);

  const collection = product.collections[0] ?? { slug: "new-arrivals", name: "New Arrivals" };
  const gallery = product.images?.length ? product.images : [
    { id: "fallback-1", url: "", alt: product.name, position: 1 },
    { id: "fallback-2", url: "", alt: product.name, position: 2 },
  ];

  const canonicalUrl = absoluteUrl(`/products/${encodeURIComponent(product.slug)}`);
  const schemaImages = product.images
    .filter((image) => Boolean(image.url))
    .map((image) => absoluteUrl(image.url));
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": canonicalUrl + "#product",
    name: product.name,
    description: productDescription(product),
    url: canonicalUrl,
    ...(schemaImages.length ? { image: schemaImages } : {}),
    brand: { "@type": "Brand", name: "HIDI" },
    ...(product.fabric ? { material: product.fabric } : {}),
    offers: productOffers(product, canonicalUrl),
    ...(reviews.reviewCount > 0 && reviews.averageRating > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: Number(reviews.averageRating.toFixed(1)),
        reviewCount: reviews.reviewCount,
      },
    } : {}),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: collection.name,
        item: absoluteUrl(`/collections/${encodeURIComponent(collection.slug)}`),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: canonicalUrl,
      },
    ],
  };

  return <div className="container product-page">
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd([productJsonLd, breadcrumbJsonLd]) }}
    />
    <RetentionTracker productId={product.id} slug={product.slug} />
    <div className="breadcrumbs"><Link href="/">Home</Link> / <Link href={`/collections/${collection.slug}`}>{collection.name}</Link> / {product.name}</div>
    <div className="pdp-grid">
      <ProductGallery productName={product.name} images={gallery} />
      <aside className="pdp-info">
        <p className="eyebrow">{product.category?.name ?? "HIDI EDIT"}</p>
        <div className="pdp-title-row">
          <h1>{product.name}</h1>
          <WishlistButton slug={product.slug} compact />
        </div>
        <p className="pdp-subtitle">{product.shortDescription}</p>
        <div className="pdp-price">{formatPaise(product.minPricePaise)} <span>inclusive of taxes</span></div>
        <p className="pdp-description">{product.description}</p>
        <AddToCart product={product} />
        <ProductContactActions product={product} />
        <ProductQualitySummary product={product} />
        <DeliveryCheck />
        <ProductInfoAccordion product={product} />
      </aside>
    </div>
    {related.length > 0 && (
      <section className="pdp-related">
        <div className="pdp-related-heading">
          <div>
            <p className="eyebrow">YOU MAY ALSO LIKE</p>
            <h2>More from the HIDI edit.</h2>
          </div>
          <Link href="/collections/all" className="text-link">Shop all</Link>
        </div>
        <div className="pdp-related-grid">
          {related.map((item) => <ProductCard key={item.id} product={item} />)}
        </div>
      </section>
    )}

    <RecentlyViewedProducts currentSlug={product.slug} />

    <ProductReviews data={reviews} />
  </div>;
}
