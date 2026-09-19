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
import { formatPaise, getProduct, getProductReviews, getRelatedProducts } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
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

  return <div className="container product-page">
    <RetentionTracker productId={product.id} slug={product.slug} />
    <div className="breadcrumbs"><Link href="/">Home</Link> / <Link href={`/collections/${collection.slug}`}>{collection.name}</Link> / {product.name}</div>
    <div className="pdp-grid">
      <ProductGallery productName={product.name} images={gallery} />
      <aside className="pdp-info">
        <p className="eyebrow">{product.category?.name ?? "HIDI EDIT"}</p><h1>{product.name}</h1><p className="pdp-subtitle">{product.shortDescription}</p>
        <div className="pdp-price">{formatPaise(product.minPricePaise)} <span>inclusive of taxes</span></div>
        <p className="pdp-description">{product.description}</p>
        <AddToCart product={product} />
        <WishlistButton slug={product.slug} />
        <ProductContactActions product={product} />
        <ProductQualitySummary product={product} />
        <div className="delivery-box"><strong>Delivery</strong><div><input placeholder="Enter PIN code" inputMode="numeric" /><button>Check</button></div></div>
        <ProductInfoAccordion product={product} />
      </aside>
    </div>
    <ProductReviews data={reviews} />

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
  </div>;
}
