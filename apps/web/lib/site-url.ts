const LOCAL_SITE_URL = "http://localhost:3000";
const CANONICAL_PRODUCTION_HOSTS = new Set([
  "thehidi.com",
  "www.thehidi.com",
  "hidiindia.com",
  "www.hidiindia.com",
]);

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function canonicalProductionUrl(value?: string) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(withProtocol(value.trim()));
    const hostname = url.hostname.toLowerCase();
    if (!CANONICAL_PRODUCTION_HOSTS.has(hostname)) return undefined;
    return new URL(`https://${hostname}/`);
  } catch {
    return undefined;
  }
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
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return new URL(LOCAL_SITE_URL);
  }
}

export function absoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, getSiteUrl()).toString();
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
