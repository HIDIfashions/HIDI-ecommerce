import Link from "next/link";
import { ApiProduct, formatPaise } from "@/lib/api";
import { CatalogImage } from "./catalog-image";

export function ProductCard({ product }: { product: ApiProduct }) {
  const primaryImage = product.images?.[0];

  return <article className="product-card">
    <Link
      href={`/products/${product.slug}`}
      className="product-art"
      style={{ position: "relative", background: "#eee8df" }}
    >
      <CatalogImage
        src={primaryImage?.url}
        alt={primaryImage?.alt ?? product.name}
        sizes="(max-width: 720px) 50vw, (max-width: 1100px) 33vw, 25vw"
        fallbackLabel={`HIDI / ${product.name}`}
      />
      {!product.inStock && <span className="product-badge" style={{ zIndex: 2 }}>Sold out</span>}
    </Link>
    <div className="product-meta">
      <div>
        <Link href={`/products/${product.slug}`} className="product-name">{product.name}</Link>
        <p>{product.shortDescription ?? "HIDI everyday edit"}</p>
      </div>
      <strong>{formatPaise(product.minPricePaise)}</strong>
    </div>
  </article>;
}
