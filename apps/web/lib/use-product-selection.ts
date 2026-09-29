"use client";
import { useEffect, useState } from "react";
import type { ApiProduct } from "./api";
import { PRODUCT_VARIANT_EVENT, type ProductVariantSelection } from "./product-sharing";
export function useProductSelection(product: ApiProduct) {
  const [selection, setSelection] = useState<ProductVariantSelection | null>(null);
  useEffect(() => {
    const sync = (event: Event) => {
      const value = (event as CustomEvent<ProductVariantSelection>).detail;
      if (value?.slug !== product.slug || !product.variants.some(v => v.color === value.color)) return;
      const variant = product.variants.find(v => v.id === value.variantId && v.color === value.color && v.available > 0);
      setSelection({ slug: product.slug, color: value.color, variantId: variant?.id ?? "", size: variant?.size });
    };
    window.addEventListener(PRODUCT_VARIANT_EVENT, sync);
    return () => window.removeEventListener(PRODUCT_VARIANT_EVENT, sync);
  }, [product]);
  const valid = selection?.slug === product.slug ? selection : null;
  const color = valid?.color ?? product.variants[0]?.color ?? "";
  const variants = product.variants.filter(v => v.color === color);
  const variant = variants.find(v => v.id === valid?.variantId && v.available > 0);
  return { color, variants, variant };
}
