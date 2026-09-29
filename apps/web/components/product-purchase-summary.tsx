"use client";
import type { ApiProduct } from "@/lib/api";
import { cardPrice, money } from "@/lib/product-card-utils";
import { useProductSelection } from "@/lib/use-product-selection";
import { ProductGallery } from "./product-gallery";
export function ProductPurchaseSummary({ product }: { product: ApiProduct }) {
  const { color, variants, variant } = useProductSelection(product);
  const price = cardPrice(variants, variant?.id ?? "", product.minPricePaise);
  return <div aria-live="polite" aria-atomic="true" data-pdp-summary>
    <div className="pdp-price">{price.from ? "From " : ""}{money(price.pricePaise)}
      {price.mrpPaise && <del className="pdp-mrp">MRP {money(price.mrpPaise)}</del>}
      <span>inclusive of taxes</span>
    </div>
    <p className="pdp-selected-detail">{color}{variant ? ` · Size ${variant.size} · SKU ${variant.sku}` : " · Select a size below"}</p>
  </div>;
}
export function ProductMedia({ product }: { product: ApiProduct }) {
  const { color, variants } = useProductSelection(product);
  const seen = new Set<string>();
  const specific = variants.flatMap(v => v.images ?? []).filter(image => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url); return true;
  }).sort((a,b) => a.position - b.position);
  const images = specific.length ? specific : product.images;
  return <ProductGallery key={product.id + ":" + color} productName={product.name}
    images={images.length ? images : [{ id: "unavailable", url: "", alt: product.name, position: 0 }]} />;
}
