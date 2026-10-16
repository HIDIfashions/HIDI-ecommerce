const WISHLIST_KEY = "hidi_wishlist";
export const WISHLIST_EVENT = "hidi-wishlist-updated";

export type WishlistItem = {
  slug: string;
  variantId?: string;
  size?: string;
  color?: string;
};

function normalizeWishlistItem(value: unknown): WishlistItem | null {
  if (typeof value === "string") return { slug: value };
  if (!value || typeof value !== "object") return null;

  const item = value as Record<string, unknown>;
  if (typeof item.slug !== "string" || !item.slug) return null;

  return {
    slug: item.slug,
    variantId: typeof item.variantId === "string" ? item.variantId : undefined,
    size: typeof item.size === "string" ? item.size : undefined,
    color: typeof item.color === "string" ? item.color : undefined,
  };
}

export function getWishlistItems(): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    const bySlug = new Map<string, WishlistItem>();
    for (const value of parsed) {
      const item = normalizeWishlistItem(value);
      if (item) bySlug.set(item.slug, item);
    }
    return Array.from(bySlug.values());
  } catch {
    return [];
  }
}

export function getWishlistSlugs(): string[] {
  return getWishlistItems().map((item) => item.slug);
}

export function setWishlistItems(items: WishlistItem[]) {
  if (typeof window === "undefined") return;
  const bySlug = new Map<string, WishlistItem>();
  for (const item of items) bySlug.set(item.slug, item);
  const unique = Array.from(bySlug.values());
  window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(unique));
  window.dispatchEvent(new CustomEvent(WISHLIST_EVENT, { detail: unique }));
}

export function setWishlistSlugs(slugs: string[]) {
  const current = new Map(getWishlistItems().map((item) => [item.slug, item]));
  setWishlistItems(slugs.map((slug) => current.get(slug) ?? { slug }));
}

export function saveWishlistItem(item: WishlistItem) {
  const current = getWishlistItems().filter((saved) => saved.slug !== item.slug);
  setWishlistItems([...current, item]);
  return true;
}

export function removeWishlistSlug(slug: string) {
  setWishlistItems(getWishlistItems().filter((item) => item.slug !== slug));
  return false;
}

export function toggleWishlistSlug(slug: string) {
  const current = getWishlistItems();
  const exists = current.some((item) => item.slug === slug);
  if (exists) return removeWishlistSlug(slug);
  return saveWishlistItem({ slug });
}
