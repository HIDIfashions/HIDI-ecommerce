"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { PRODUCT_VARIANT_EVENT } from "@/lib/product-sharing";
import {
  getWishlistItems,
  removeWishlistSlug,
  saveWishlistItem,
  WISHLIST_EVENT,
  WishlistItem,
} from "@/lib/wishlist";

export function WishlistButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<WishlistItem | null>(null);

  useEffect(() => {
    const sync = () => {
      const item = getWishlistItems().find((savedItem) => savedItem.slug === slug) ?? null;
      setSaved(!!item);
      if (item?.variantId) setSelected(item);
    };

    const onVariantSelected = (event: Event) => {
      const detail = (event as CustomEvent<WishlistItem>).detail;
      if (detail?.slug === slug) setSelected(detail);
    };

    sync();
    window.addEventListener(WISHLIST_EVENT, sync);
    window.addEventListener(PRODUCT_VARIANT_EVENT, onVariantSelected);
    return () => {
      window.removeEventListener(WISHLIST_EVENT, sync);
      window.removeEventListener(PRODUCT_VARIANT_EVENT, onVariantSelected);
    };
  }, [slug]);

  function toggle() {
    if (saved) {
      removeWishlistSlug(slug);
      setSaved(false);
      return;
    }

    saveWishlistItem(selected?.variantId ? selected : { slug });
    setSaved(true);
  }

  return (
    <button
      type="button"
      className={compact ? "wishlist-button wishlist-button-compact" : "wishlist-button"}
      aria-pressed={saved}
      aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
      onClick={toggle}
    >
      {compact ? <Heart size={20} fill={saved ? "currentColor" : "none"} aria-hidden="true" /> : (saved ? "♥ Saved to wishlist" : "♡ Add to wishlist")}
    </button>
  );
}
