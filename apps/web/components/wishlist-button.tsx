"use client";

import { useEffect, useState } from "react";
import { PRODUCT_VARIANT_EVENT } from "./add-to-cart";
import {
  getWishlistItems,
  removeWishlistSlug,
  saveWishlistItem,
  WISHLIST_EVENT,
  WishlistItem,
} from "@/lib/wishlist";

export function WishlistButton({ slug }: { slug: string }) {
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
      className="wishlist-button"
      aria-pressed={saved}
      onClick={toggle}
    >
      {saved ? "♥ Saved to wishlist" : "♡ Add to wishlist"}
    </button>
  );
}
