"use client";

import { useEffect, useState } from "react";
import type { ApiProduct } from "@/lib/api";
import { getWishlistItems, type WishlistItem, WISHLIST_EVENT } from "@/lib/wishlist";
import { ProductCard } from "./product-card";
import styles from "./wishlist-page.module.css";

/** Reuse the same card; the previous extra select/Add button would duplicate controls. */
export function WishlistPageClient({ products }: { products: ApiProduct[] }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => { setItems(getWishlistItems()); setReady(true); };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === "hidi_wishlist") sync();
    };
    sync();
    window.addEventListener(WISHLIST_EVENT, sync);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(WISHLIST_EVENT, sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  if (!ready) return <p role="status">Loading your saved pieces…</p>;
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const productsInWishlist = products.filter((product) => bySlug.has(product.slug));
  if (!productsInWishlist.length) return <div className="catalog-empty">
    <h2>{items.length ? "Your saved pieces are not currently listed." : "Your wishlist is empty."}</h2>
    <p>{items.length ? "Your wishlist is still saved in this browser. Browse the collection for more styles."
      : "Tap a heart beneath any product to keep it here."}</p>
  </div>;
  return <div className={styles.grid}>
    {productsInWishlist.map((product) => <ProductCard key={product.id}
      product={product} initialVariantId={bySlug.get(product.slug)?.variantId} />)}
  </div>;
}
