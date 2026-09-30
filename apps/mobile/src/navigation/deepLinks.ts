export type HidiDeepLink = { type: "product"; slug: string } | { type: "collection"; slug: string; title: string };
const WEB_HOSTS = new Set(["thehidi.com", "www.thehidi.com", "thidigk.thehidi.com"]);
function decodeSlug(value: string) {
  try { const slug = decodeURIComponent(value); return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug) ? slug : null; } catch { return null; }
}
export function parseHidiDeepLink(value?: string | null): HidiDeepLink | null {
  if (!value || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) return null;
  const app = value.match(/^hidi:\/\/(products|collections)\/([^/?#]+)\/?(?:[?#].*)?$/i);
  const web = value.match(/^https:\/\/([^/?#]+)\/(products|collections)\/([^/?#]+)\/?(?:[?#].*)?$/i);
  if (!app && (!web || !WEB_HOSTS.has(web[1]!.toLowerCase()))) return null;
  const kind = app ? app[1] : web![2];
  const slug = decodeSlug(app ? app[2]! : web![3]!);
  if (!slug) return null;
  return kind?.toLowerCase() === "products" ? { type: "product", slug } : { type: "collection", slug, title: slug.split("-").filter(Boolean).map(x => x[0]!.toUpperCase() + x.slice(1)).join(" ") };
}
