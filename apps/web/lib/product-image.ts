/** Keep migrated images on this storefront's private-Blob media proxy. */
const STOREFRONT_MEDIA_HOSTS = new Set([
  "thehidi.com",
  "www.thehidi.com",
  "hidiindia.com",
  "www.hidiindia.com",
  "thidigk.thehidi.com",
  "azure-preview.thehidi.com",
]);

/** Version the display URL so a previous oversized optimiser response expires immediately. */
function displaySource(path: string): string {
  const url = new URL(path, "https://hidiindia.com");
  url.pathname = url.pathname.replace(/^\/media\/products\/(?:_display_v2\/)?/, "/media/products/_display_v2/");
  return url.pathname + url.search;
}

export function productImageSource(source: string): string {
  try {
    const url = new URL(source);
    if (url.protocol === "https:" && STOREFRONT_MEDIA_HOSTS.has(url.hostname.toLowerCase()) && url.pathname.startsWith("/media/products/")) {
      return displaySource(url.pathname + url.search);
    }
  } catch {
    // Next Image also supports local absolute paths.
  }
  return source.startsWith("/media/products/") ? displaySource(source) : source;
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
