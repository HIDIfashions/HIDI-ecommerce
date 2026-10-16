const fail = message => Object.assign(new Error(message), { status: 503 });
let cached;
async function storageToken(env) {
  if (cached?.expires > Date.now() + 120000) return cached.value;
  const url = new URL(env.IDENTITY_ENDPOINT || 'http://169.254.169.254/metadata/identity/oauth2/token');
  url.searchParams.set('api-version', env.IDENTITY_ENDPOINT ? '2019-08-01' : '2018-02-01');
  url.searchParams.set('resource', 'https://storage.azure.com/');
  const client = env.AZURE_CLIENT_ID || env.MANAGED_IDENTITY_CLIENT_ID;
  if (client) url.searchParams.set('client_id', client);
  const headers = env.IDENTITY_ENDPOINT ? { 'X-IDENTITY-HEADER': env.IDENTITY_HEADER || '' } : { Metadata: 'true' };
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  if (!response.ok || typeof body.access_token !== 'string') throw fail('Storage identity is unavailable. Retry photo cleanup.');
  cached = { value: body.access_token, expires: Date.now() + Number(body.expires_in || 300) * 1000 };
  return cached.value;
}

function safeKey(value) {
  let key;
  try { key = decodeURIComponent(value); } catch { throw fail('Invalid stored photo path.'); }
  if (!key.startsWith('products/') || key.length > 1024 || /[\\\x00-\x1f?#%]/.test(key) || key.split('/').some(p => !p || p === '.' || p === '..')) throw fail('Invalid stored photo path.');
  return key;
}

/** Resolve only this account's product photos. Never fetch a database-supplied host. */
export function ownedProductKey(image, env = process.env) {
  const account = env.AZURE_STORAGE_ACCOUNT || '';
  const path = image.storagePath || '';
  let fromPath;
  if (path.startsWith('azure://')) {
    const prefixes = ['azure://product-media/', `azure://${account}/product-media/`];
    const prefix = prefixes.find(p => path.startsWith(p));
    if (!prefix) return null;
    fromPath = safeKey(path.slice(prefix.length));
  }
  let fromUrl;
  const value = image.url || '';
  if (value.startsWith('/media/products/')) fromUrl = safeKey(value.slice('/media/'.length));
  else if (/^https:\/\//.test(value)) {
    const url = new URL(value);
    const bases = [`https://${account}.blob.core.windows.net/product-media`, env.MEDIA_PUBLIC_BASE_URL].filter(Boolean);
    for (const base of bases) {
      const expected = new URL(base.replace(/\/$/, '') + '/');
      if (url.origin === expected.origin && url.pathname.startsWith(expected.pathname)) {
        if (url.search || url.hash || url.username || url.password) throw fail('Invalid stored photo URL.');
        fromUrl = safeKey(url.pathname.slice(expected.pathname.length));
        break;
      }
    }
  }
  if (fromPath && fromUrl && fromPath !== fromUrl) throw fail('Stored photo URL and path disagree.');
  return fromPath || fromUrl || null;
}

export function createProductPhotoStorage({ env = process.env, requestFetch = fetch, getToken = () => storageToken(env) } = {}) {
  const account = env.AZURE_STORAGE_ACCOUNT || '';
  async function request(method, container, key) {
    if (!/^[a-z0-9]{3,24}$/.test(account)) throw fail('Product storage is unavailable. Retry photo cleanup.');
    const url = new URL(`https://${account}.blob.core.windows.net/${container}/${key.split('/').map(encodeURIComponent).join('/')}`);
    return requestFetch(url, { method, redirect: 'error', headers: { Authorization: `Bearer ${await getToken()}`, 'x-ms-version': '2023-11-03', 'x-ms-date': new Date().toUTCString(), ...(method === 'DELETE' ? { 'x-ms-delete-snapshots': 'include' } : {}) }, signal: AbortSignal.timeout(10000) });
  }
  return {
    key: image => ownedProductKey(image, env),
    async protectedKeys() {
      const container = env.AZURE_STORAGE_CONTAINER || env.MEDIA_STORAGE_CONTAINER || env.AZURE_BLOB_CONTAINER || env.BLOB_CONTAINER || env.R2_BUCKET || 'product-media';
      if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(container)) throw fail('Media storage configuration is invalid.');
      const keys = new Set();
      const visit = value => {
        if (typeof value === 'string') {
          // Brand assets are outside product cleanup. They can appear beside
          // reused product photos in the same homepage configuration.
          let brandAsset = false;
          if (value.startsWith('https://')) {
            const url = new URL(value);
            const bases = [`https://${account}.blob.core.windows.net/product-media`, env.MEDIA_PUBLIC_BASE_URL].filter(Boolean);
            brandAsset = bases.some(base => {
              const expected = new URL(base.replace(/\/$/, '') + '/brand/');
              return url.origin === expected.origin && url.pathname.startsWith(expected.pathname);
            });
          }
          if (!brandAsset) { const key = ownedProductKey({ url: value }, env); if (key) keys.add(key); }
        }
        else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
      };
      for (const key of ['brand/hero/current.json', 'brand/landing-media/current.json']) {
        const response = await request('GET', container, key);
        if (response.status === 404) continue;
        if (!response.ok) throw fail('Cannot verify homepage photo references. Retry photo cleanup.');
        const body = await response.text();
        if (Buffer.byteLength(body) > 1024 * 1024) throw fail('Media configuration exceeds the cleanup limit.');
        visit(JSON.parse(body));
      }
      return keys;
    },
    async remove(key) {
      safeKey(key);
      const response = await request('DELETE', 'product-media', key);
      if (![202, 404].includes(response.status)) throw fail('Photo cleanup could not finish. Retry cleanup to complete deletion.');
    },
  };
}
