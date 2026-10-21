const STOREFRONT_MEDIA_HOSTS = new Set([
  "thehidi.com",
  "www.thehidi.com",
  "hidiindia.com",
  "www.hidiindia.com",
  "thidigk.thehidi.com",
  "azure-preview.thehidi.com",
]);

export const PRODUCT_DERIVATIVE_VERSION = "v1";
export const PRODUCT_DERIVATIVE_WIDTHS = Object.freeze([384, 640, 828, 1080, 1200, 1920]);

function validWidth(width) {
  return Number.isInteger(width) && PRODUCT_DERIVATIVE_WIDTHS.includes(width);
}

function safeOriginalKey(key) {
  return typeof key === "string" &&
    /^products\/variants\/[a-z0-9_-]+\/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(key) &&
    !key.includes("..");
}

export function productMediaKey(source) {
  if (typeof source !== "string" || !source || source.length > 2000 || source.includes("\\") || source.includes("../")) return null;

  if (source.startsWith("/media/products/")) {
    const pathname = source.split("?", 1)[0]
      .replace(/^\/media\/products\/(?:_display_v[23]\//)?/, "/products/");
    const key = pathname.slice(1);
    return safeOriginalKey(key) ? key : null;
  }

  let url;
  try { url = new URL(source); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;

  const host = url.hostname.toLowerCase();
  if (STOREFRONT_MEDIA_HOSTS.has(host) && url.pathname.startsWith("/media/products/")) {
    const key = url.pathname
      .replace(/^\/media\/products\/(?:_display_v[23]\//)?/, "products/");
    return safeOriginalKey(key) ? key : null;
  }

  if (host === "media.thehidi.com" && url.pathname.startsWith("/products/")) {
    const key = url.pathname.slice(1);
    return safeOriginalKey(key) ? key : null;
  }

  return null;
}

export function productDerivativeKey(originalKey, width) {
  if (!safeOriginalKey(originalKey) || !validWidth(width)) return null;
  const relative = originalKey.slice("products/".length).replace(/\.(?:jpg|jpeg|png|webp|avif)$/i, "");
  return `products/_derivatives/${PRODUCT_DERIVATIVE_VERSION}/${relative}/w${width}.webp`;
}

export function productDerivativeUrl(source, width) {
  const key = productMediaKey(source);
  const derivative = key ? productDerivativeKey(key, width) : null;
  if (!derivative) return null;

  try {
    const url = new URL(source);
    if (url.hostname.toLowerCase() === "media.thehidi.com" && url.pathname.startsWith("/products/")) {
      return `https://media.thehidi.com/${derivative}`;
    }
  } catch {}

  return `/media/${derivative}`;
}

export function productDerivativeSrcSet(source, widths = PRODUCT_DERIVATIVE_WIDTHS) {
  const entries = [];
  for (const width of widths) {
    const url = productDerivativeUrl(source, width);
    if (url) entries.push(`${url} ${width}w`);
  }
  return entries.length ? entries.join(", ") : null;
}

export function preferredProductDerivative(source, width = 1200) {
  const target = PRODUCT_DERIVATIVE_WIDTHS.find(candidate => candidate >= width) ??
    PRODUCT_DERIVATIVE_WIDTHS[PRODUCT_DERIVATIVE_WIDTHS.length - 1];
  return productDerivativeUrl(source, target);
}
