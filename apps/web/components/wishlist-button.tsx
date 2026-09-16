"use client";

import { useEffect, useState } from "react";
import { getWishlistSlugs, toggleWishlistSlug, WISHLIST_EVENT } from "@/lib/wishlist";

export function WishlistButton({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(getWishlistSlugs().includes(slug));
    sync();
    window.addEventListener(WISHLIST_EVENT, sync);
    return () => window.removeEventListener(WISHLIST_EVENT, sync);
  }, [slug]);

  return (
    <button
      type="button"
      className="wishlist-button"
      aria-pressed={saved}
      onClick={() => setSaved(toggleWishlistSlug(slug))}
    >
      {saved ? "♥ Saved to wishlist" : "♡ Add to wishlist"}
    </button>
  );
}
