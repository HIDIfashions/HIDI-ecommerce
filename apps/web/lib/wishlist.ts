const WISHLIST_KEY = "hidi_wishlist";
export const WISHLIST_EVENT = "hidi-wishlist-updated";

export function getWishlistSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function setWishlistSlugs(slugs: string[]) {
  if (typeof window === "undefined") return;
  const unique = Array.from(new Set(slugs));
  window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(unique));
  window.dispatchEvent(new CustomEvent(WISHLIST_EVENT, { detail: unique }));
}

export function toggleWishlistSlug(slug: string) {
  const current = getWishlistSlugs();
  const next = current.includes(slug)
    ? current.filter((item) => item !== slug)
    : [...current, slug];
  setWishlistSlugs(next);
  return next.includes(slug);
}
