export type HidiDeepLink =
  | { type: "product"; slug: string }
  | { type: "collection"; slug: string; title: string };

const WEB_HOSTS = new Set(["thehidi.com", "www.thehidi.com", "thidigk.thehidi.com"]);

function decodeSlug(value: string) {
  try {
    const slug = decodeURIComponent(value).trim();
    return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

function collectionTitle(slug: string) {
  return slug.split("-").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

export function parseHidiDeepLink(value?: string | null): HidiDeepLink | null {
  if (!value) return null;

  const appMatch = value.match(/^hidi:\/\/(products|collections)\/([^/?#]+)/i);
  if (appMatch) {
    const slug = decodeSlug(appMatch[2]);
    if (!slug) return null;
    return appMatch[1].toLowerCase() === "products"
      ? { type: "product", slug }
      : { type: "collection", slug, title: collectionTitle(slug) };
  }

  const webMatch = value.match(/^https:\/\/([^/?#]+)\/(products|collections)\/([^/?#]+)/i);
  if (!webMatch || !WEB_HOSTS.has(webMatch[1].toLowerCase())) return null;

  const slug = decodeSlug(webMatch[3]);
  if (!slug) return null;
  return webMatch[2].toLowerCase() === "products"
    ? { type: "product", slug }
    : { type: "collection", slug, title: collectionTitle(slug) };
}
