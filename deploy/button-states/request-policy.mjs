// Classify requests that the browser regression has already chosen to abort.
// A true result affects diagnostics only; it never permits a request to send.
const analyticsOrigins = new Set([
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
]);

export function isBlockedTelemetry(method, rawUrl, baseOrigin) {
  if (method !== 'POST') return false;
  let base, url;
  try {
    base = new URL(baseOrigin);
    url = new URL(rawUrl, base);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(base.protocol) ||
      !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
  if (url.origin === base.origin && url.pathname === '/api/hidi/performance') return true;
  if (analyticsOrigins.has(url.origin) && ['/g/collect', '/collect'].includes(url.pathname)) return true;
  return url.origin === 'https://lumberjack.razorpay.com' && url.pathname === '/v2/logz';
}
