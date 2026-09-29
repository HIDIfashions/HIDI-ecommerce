/** Keep migrated images on this storefront's private-Blob media proxy. */
export function productImageSource(source: string): string {
  try {
    const url = new URL(source);
    if (url.protocol === "https:" && ["thehidi.com", "www.thehidi.com", "thidigk.thehidi.com", "azure-preview.thehidi.com"].includes(url.hostname) && url.pathname.startsWith("/media/products/")) {
      return url.pathname + url.search;
    }
  } catch {
    // Next Image also supports local absolute paths.
  }
  return source;
}

export function canOptimizeProductImage(source: string): boolean {
  if (source.startsWith("/") && !source.startsWith("//")) return true;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:") return false;
    return (url.hostname === "media.thehidi.com" && url.pathname.startsWith("/products/")) ||
      (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/"));
  } catch {
    return false;
  }
}
