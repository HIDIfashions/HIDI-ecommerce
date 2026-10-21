const LOCAL_SITE_URL = "http://localhost:3000";
const CANONICAL_PRODUCTION_ORIGIN = "https://hidiindia.com";
const HIDI_PUBLIC_HOSTS = new Set([
  "thehidi.com",
  "www.thehidi.com",
  "hidiindia.com",
  "www.hidiindia.com",
]);

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function normalizeHidiPublicUrl(value: string | URL) {
  try {
    const url = new URL(typeof value === "string" ? withProtocol(value.trim()) : value.toString());
    if (!HIDI_PUBLIC_HOSTS.has(url.hostname.toLowerCase()) || !["http:", "https:"].includes(url.protocol)) return undefined;
    url.protocol = "https:";
    url.hostname = "hidiindia.com";
    url.port = "";
    return url;
  } catch {
    return undefined;
  }
}

function canonicalProductionUrl(value?: string) {
  if (!value?.trim()) return undefined;
  const normalized = normalizeHidiPublicUrl(value);
  return normalized ? new URL(`${CANONICAL_PRODUCTION_ORIGIN}/`) : undefined;
}

export function getSiteUrl(): URL {
  const primaryProductionUrl = canonicalProductionUrl(
    process.env.HIDI_PRIMARY_DOMAIN?.trim() ||
      process.env.NEXT_PUBLIC_HIDI_PRIMARY_DOMAIN?.trim(),
  );

  if (primaryProductionUrl) return primaryProductionUrl;

  const configured =
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    LOCAL_SITE_URL;

  try {
    const url = new URL(withProtocol(configured));
    const productionUrl = normalizeHidiPublicUrl(url);
    if (productionUrl) return new URL(`${CANONICAL_PRODUCTION_ORIGIN}/`);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return new URL(LOCAL_SITE_URL);
  }
}

export function absoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return normalizeHidiPublicUrl(pathOrUrl)?.toString() ?? pathOrUrl;
  return new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, getSiteUrl()).toString();
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
