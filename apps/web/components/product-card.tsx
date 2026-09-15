import Link from "next/link";
import { ApiProduct, formatPaise } from "@/lib/api";

const tones = ["indigo", "sage", "wine", "sand"];
export function ProductCard({ product }: { product: ApiProduct }) {
  const tone = tones[Math.abs(product.slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % tones.length];
  return <article className="product-card">
    <Link href={`/products/${product.slug}`} className={`product-art art-${tone}`}>
      {!product.inStock && <span className="product-badge">Sold out</span>}
      <div className="art-monogram">H</div><div className="art-caption">HIDI / {product.name}</div>
    </Link>
    <div className="product-meta"><div><Link href={`/products/${product.slug}`} className="product-name">{product.name}</Link><p>{product.shortDescription ?? "HIDI everyday edit"}</p></div><strong>{formatPaise(product.minPricePaise)}</strong></div>
  </article>;
}
