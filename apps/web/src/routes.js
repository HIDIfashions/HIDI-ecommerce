// These routes are served by HIDI's commerce frontend on the same origin.
const collectionPaths = Object.freeze({
  occasion: '/collections/occasion',
  'new-arrivals': '/collections/new-arrivals',
  'work-edit': '/collections/work-edit',
  everyday: '/collections/everyday',
});

export function collectionRoute(edit = '') {
  const key = String(edit).trim().toLowerCase().replace(/\s+/g, '-');
  return Object.prototype.hasOwnProperty.call(collectionPaths, key)
    ? collectionPaths[key] : '/collections/all';
}

export function searchRoute(query = '') {
  return `/search?${new URLSearchParams({ q: String(query).trim() })}`;
}

export function newsletterConfirmed(result) {
  return result?.ok === true || result?.success === true;
}

export function newsletterError(result, status) {
  if (typeof result?.message === 'string' && result.message.trim()) return result.message;
  if (Array.isArray(result?.message)) {
    const messages = result.message.filter((value) => typeof value === 'string' && value.trim());
    if (messages.length) return messages.join(' ');
  }
  if (typeof result?.error === 'string' && result.error.trim()) return result.error;
  return status === 503
    ? 'HIDI updates are temporarily unavailable. Please try again later.'
    : 'Your subscription could not be confirmed. Please try again later.';
}
