import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { formatPaise, getProduct } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();
  const collection = product.collections[0] ?? { slug: "new-arrivals", name: "New Arrivals" };
  return <div className="container product-page">
    <div className="breadcrumbs"><Link href="/">Home</Link> / <Link href={`/collections/${collection.slug}`}>{collection.name}</Link> / {product.name}</div>
    <div className="pdp-grid">
      <div className="pdp-gallery">{[1,2,3,4].map((i) => <div key={i} className="pdp-image product-art art-sand"><div className="art-monogram">H</div><div className="art-caption">Image {i} · HIDI product photography</div></div>)}</div>
      <aside className="pdp-info">
        <p className="eyebrow">{product.category?.name ?? "HIDI EDIT"}</p><h1>{product.name}</h1><p className="pdp-subtitle">{product.shortDescription}</p>
        <div className="pdp-price">{formatPaise(product.minPricePaise)} <span>inclusive of taxes</span></div>
        <p className="pdp-description">{product.description}</p>
        <AddToCart product={product} />
        <button className="wishlist-button">♡ Add to wishlist</button>
        <div className="delivery-box"><strong>Delivery</strong><div><input placeholder="Enter PIN code" inputMode="numeric" /><button>Check</button></div></div>
        <details open><summary>Product details</summary><p>{product.fabric ? `Fabric: ${product.fabric}. ` : ""}{product.care ?? "Final fabric composition and care details will come from the HIDI product master."}</p></details>
        <details><summary>Shipping & returns</summary><p>Clear delivery promise and easy returns/exchanges. Final launch policy should be approved before go-live.</p></details>
      </aside>
    </div>
  </div>;
}
