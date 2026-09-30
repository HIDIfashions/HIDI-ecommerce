// Runtime settings are read once from public/config.js, before React mounts.
export const config = window.HIDI_CONFIG || {};
const baseUrl = import.meta.env.BASE_URL;
export function asset(path) {
  return `${baseUrl}assets/${String(path).replace(/^\/+/, '')}`;
}
export function safeWebUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, window.location.href);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
export const officialUrl = safeWebUrl(config.siteUrl) || 'https://thidigk.thehidi.com/';
