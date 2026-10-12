export const canonicalOrigin = 'https://hidiindia.com';
const legacyHosts = new Set(['thehidi.com', 'www.thehidi.com', 'thidigk.thehidi.com', 'azure-preview.thehidi.com', 'www.hidiindia.com']);
const identityKeys = new Set(['@id', 'url', 'logo', 'image', 'item', 'contentUrl']);

export function identityUrl(value) {
  if (typeof value !== 'string') return value;
  try {
    const url = new URL(value);
    return legacyHosts.has(url.hostname) && ['http:', 'https:'].includes(url.protocol)
      ? canonicalOrigin + url.pathname + url.search + url.hash : value;
  } catch { return value; }
}

function normalizeGraph(value, key = '') {
  if (Array.isArray(value)) return value.map(item => normalizeGraph(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeGraph(v, k)]));
  return identityKeys.has(key) ? identityUrl(value) : value;
}

/** Transform machine-readable head fields only; keep body, assets and commerce scripts byte-identical. */
export function normalizeSeoIdentity(html) {
  const boundary = html.search(/<\/head>/i);
  if (boundary < 0) return html;
  const head = html.slice(0, boundary)
    .replace(/<script\b([^>]*\btype=["']application\/ld\+json["'][^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs, json) => {
      try { return '<script' + attrs + '>' + JSON.stringify(normalizeGraph(JSON.parse(json))).replace(/</g, '\\u003c') + '</script>'; }
      catch { return tag; }
    })
    .replace(/<meta\b[^>]*(?:property=["']og:image["']|name=["']twitter:image["'])[^>]*>/gi, tag =>
      tag.replace(/\bcontent=(["'])(.*?)\1/i, (match, quote, url) => 'content=' + quote + identityUrl(url) + quote));
  return head + html.slice(boundary);
}
