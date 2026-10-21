// Read-only private-policy fixture for the two local runtime processes in candidate.mjs.
// It prevents either runtime from reaching Azure Storage and rejects every mutation.
import { readFileSync } from 'node:fs';

const originalFetch = globalThis.fetch.bind(globalThis);
const fixture = JSON.parse(readFileSync(new URL('./fixtures/privacy-metadata-before.json', import.meta.url), 'utf8'));
const state = {
  schema: 1,
  draft: fixture.draft,
  published: { version: 3, draft: fixture.draft },
  history: [],
};
const stateText = JSON.stringify(state);

globalThis.fetch = async (input, options = {}) => {
  const request = input instanceof Request ? input : null;
  let url;
  try { url = new URL(request?.url || input); }
  catch { return originalFetch(input, options); }
  const method = String(options.method || request?.method || 'GET').toUpperCase();
  if (url.pathname === '/hidi-seo-fixture-token') {
    if (method !== 'GET') throw new Error('Fixture identity is read-only');
    return new Response(JSON.stringify({ access_token: 'read-only-fixture', expires_in: 3600 }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.hostname === 'fixture.blob.core.windows.net') {
    if (method === 'HEAD' && url.searchParams.get('restype') === 'container') return new Response(null, { status: 200 });
    if (method === 'GET' && url.pathname === '/hidi-private-policies/state.json') {
      return new Response(stateText, { status: 200, headers: {
        'content-type': 'application/json', 'content-length': String(Buffer.byteLength(stateText)), etag: '"read-only-fixture"',
      } });
    }
    throw new Error(`Private-policy fixture refused ${method} ${url.pathname}`);
  }
  return originalFetch(input, options);
};
