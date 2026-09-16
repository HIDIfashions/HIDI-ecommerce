"use client";

import { useEffect, useState } from "react";
import { ApiProduct } from "@/lib/api";
import { getWishlistSlugs, WISHLIST_EVENT } from "@/lib/wishlist";
import { ProductCard } from "./product-card";

export function WishlistPageClient({ products }: { products: ApiProduct[] }) {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setSlugs(getWishlistSlugs());
    sync();
    window.addEventListener(WISHLIST_EVENT, sync);
    return () => window.removeEventListener(WISHLIST_EVENT, sync);
  }, []);

  const saved = products.filter((product) => slugs.includes(product.slug));

  if (!saved.length) {
    return <div className="catalog-empty"><h2>Your wishlist is empty.</h2><p>Save pieces you love and they’ll appear here.</p></div>;
  }

  return <div className="product-grid">{saved.map((product) => <ProductCard key={product.id} product={product} />)}</div>;
}
