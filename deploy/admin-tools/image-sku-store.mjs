const fail = (status, message) => Object.assign(new Error(message), {status});
export function createImageSkuStore({env = process.env, requestFetch = fetch, getToken} = {}) {
  let cached;
  async function token() {
    if (getToken) return getToken();
    if (cached?.expires > Date.now() + 120000) return cached.value;
    const url = new URL(env.IDENTITY_ENDPOINT || 'http://169.254.169.254/metadata/identity/oauth2/token');
    url.searchParams.set('api-version', env.IDENTITY_ENDPOINT ? '2019-08-01' : '2018-02-01'); url.searchParams.set('resource', 'https://storage.azure.com/');
    const client = env.AZURE_CLIENT_ID || env.MANAGED_IDENTITY_CLIENT_ID; if (client) url.searchParams.set('client_id', client);
    const response = await requestFetch(url, {headers: env.IDENTITY_ENDPOINT ? {'X-IDENTITY-HEADER': env.IDENTITY_HEADER || ''} : {Metadata: 'true'}, redirect: 'error', signal: AbortSignal.timeout(10000)});
    const body = await response.json();
    if (!response.ok || typeof body.access_token !== 'string') throw fail(503, 'Image SKU storage identity is unavailable.');
    cached = {value: body.access_token, expires: Date.now() + Number(body.expires_in || 300) * 1000}; return cached.value;
  }
  async function call(method, value, etag) {
    const account = env.AZURE_STORAGE_ACCOUNT || '';
    if (!/^[a-z0-9]{3,24}$/.test(account)) throw fail(503, 'Image SKU storage is unavailable.');
    const headers = {Authorization: 'Bearer ' + await token(), 'x-ms-version': '2023-11-03', 'x-ms-date': new Date().toUTCString()};
    if (method === 'PUT') Object.assign(headers, {'Content-Type': 'application/json', 'x-ms-blob-type': 'BlockBlob', 'x-ms-blob-cache-control': 'private, no-store', ...(etag ? {'If-Match': etag} : {'If-None-Match': '*'})});
    return requestFetch('https://' + account + '.blob.core.windows.net/product-media/admin/product-image-skus/v1.json', {method, headers, body: value ? JSON.stringify(value) : undefined, redirect: 'error', signal: AbortSignal.timeout(15000)});
  }
  return {
    async read() {
      const response = await call('GET');
      if (response.status === 404) return {bindings: [], etag: null};
      if (!response.ok) throw fail(503, 'Saved Image SKU mappings could not be loaded.');
      const text = await response.text(); if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw fail(503, 'Image SKU registry exceeds its limit.');
      let data; try {data = JSON.parse(text);} catch {throw fail(503, 'Image SKU registry is invalid.');}
      if (data.version !== 1 || !Array.isArray(data.bindings) || data.bindings.length > 10000 || !response.headers.get('etag')) throw fail(503, 'Image SKU registry is invalid.');
      return {bindings: data.bindings, etag: response.headers.get('etag')};
    },
    async write(bindings, etag) {
      if (bindings.length > 10000) throw fail(409, 'Image SKU registry is full.');
      const response = await call('PUT', {version: 1, bindings}, etag);
      if (response.status === 412) throw fail(409, 'Image SKU mappings changed. Retry this import.');
      if (response.status !== 201) throw fail(503, 'Image SKU mapping was not confirmed saved. Retry the import.');
    },
  };
}
