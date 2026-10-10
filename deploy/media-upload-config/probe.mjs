import { createHash, randomUUID } from 'node:crypto';

const fail = code => Object.assign(new Error(code), { code });
function safeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (!/^(?:[a-z0-9-]+\.blob\.core\.windows\.net|(?:[a-z0-9-]+\.)*thehidi\.com|(?:www\.)?hidiindia\.com)$/.test(url.hostname)) return null;
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}
async function storageToken() {
  const endpoint = process.env.IDENTITY_ENDPOINT;
  if (!endpoint || !process.env.IDENTITY_HEADER || !process.env.AZURE_CLIENT_ID) throw fail('EXISTING_STORAGE_IDENTITY_MISSING');
  const url = new URL(endpoint);
  url.searchParams.set('api-version', '2019-08-01');
  url.searchParams.set('resource', 'https://storage.azure.com/');
  url.searchParams.set('client_id', process.env.AZURE_CLIENT_ID);
  const response = await fetch(url, { headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER }, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok || typeof body.access_token !== 'string') throw fail('EXISTING_STORAGE_TOKEN_UNAVAILABLE');
  return body.access_token;
}
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jwZkAAAAASUVORK5CYII=', 'base64');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function verifyOwnedUpload({ request, requestFetch = fetch, baseUrl, runId, nonce = randomUUID() }) {
  if (safeUrl(baseUrl) !== baseUrl || !/^\d+$/.test(runId) || !/^[a-f0-9-]{36}$/.test(nonce)) throw fail('UNSAFE_MEDIA_PROBE_TARGET');
  const key = `products/upload-checks/media-config-${runId}-${nonce}.png`;
  let etag, attempted = false;
  const report = { passed: false, readOnly: false, blobWrites: true, databaseWrites: false,
    existingObjectsChanged: false, publicReadMatches: false, ownedProbeCleaned: false, probeKey: key };
  try {
    attempted = true;
    const created = await request('PUT', key, PIXEL, {
      'If-None-Match': '*', 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'image/png',
      'x-ms-blob-cache-control': 'public, max-age=31536000, immutable',
      'x-ms-meta-hidi_media_probe': runId, 'x-ms-meta-hidi_media_nonce': nonce,
    });
    if (created.status !== 201) {
      const serviceCode = String(created.headers.get('x-ms-error-code') || 'ERROR').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 40);
      throw fail(`BLOB_WRITE_HTTP_${created.status}_${serviceCode}`);
    }
    etag = created.headers.get('etag');
    if (!etag) throw fail('MEDIA_PROBE_UPLOAD_ETAG_MISSING');
    const downloaded = await requestFetch(`${baseUrl}/${key}`, { signal: AbortSignal.timeout(30000) });
    if (!downloaded.ok || !downloaded.headers.get('content-type')?.startsWith('image/png')) throw fail('PUBLIC_MEDIA_READ_FAILED');
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    if (bytes.length !== PIXEL.length || digest(bytes) !== digest(PIXEL)) throw fail('PUBLIC_MEDIA_BYTES_DIFFER');
    report.publicReadMatches = true;
    report.uploadedBytes = PIXEL.length;
    report.passed = true;
  } finally {
    // A lost PUT response can leave an object. Delete only confirmed ownership.
    if (attempted && !etag) {
      const found = await request('HEAD', key);
      if (found.status === 200 && found.headers.get('x-ms-meta-hidi_media_probe') === runId
          && found.headers.get('x-ms-meta-hidi_media_nonce') === nonce) etag = found.headers.get('etag');
      else if (found.status !== 404 && found.status !== 200) throw fail('MEDIA_PROBE_OWNERSHIP_UNCONFIRMED');
    }
    if (etag) {
      const removed = await request('DELETE', key, undefined, { 'If-Match': etag });
      if (removed.status !== 202 && removed.status !== 404) throw fail('OWNED_MEDIA_PROBE_CLEANUP_REQUIRED');
      const missing = await request('HEAD', key);
      if (missing.status !== 404) throw fail('OWNED_MEDIA_PROBE_CLEANUP_NOT_CONFIRMED');
      report.ownedProbeCleaned = true;
    }
  }
  return report;
}
export async function run(expectedAccount, payload) {
  const account = String(process.env.AZURE_STORAGE_ACCOUNT || '').trim();
  const media = String(process.env.MEDIA_PUBLIC_BASE_URL || '');
  const report = {
    passed: true, readOnly: true, blobWrites: false, databaseWrites: false,
    mediaProviderAzure: process.env.MEDIA_STORAGE_PROVIDER === 'azure',
    accountConfigured: /^[a-z0-9]{3,24}$/.test(account),
    accountMatchesCapture: account === expectedAccount,
    mediaBaseConfigured: Boolean(media), mediaBaseStartsHttps: media.startsWith('https://'),
    mediaBaseHasOuterWhitespace: media !== media.trim(),
    mediaBaseSafeUrl: safeUrl(media), mediaBaseIsRelativeMedia: media === '/media', siteUrl: safeUrl(process.env.SITE_URL),
    managedIdentityClientConfigured: Boolean(process.env.AZURE_CLIENT_ID),
    productContainerAccessible: false,
  };
  if (report.accountConfigured && report.accountMatchesCapture && report.mediaProviderAzure) {
    try {
      const token = await storageToken();
      const request = async (method, key, bytes, extra = {}) => {
        const url = key ? `https://${account}.blob.core.windows.net/product-media/${key}` : `https://${account}.blob.core.windows.net/product-media?restype=container`;
        return fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'x-ms-version': '2023-11-03',
          'x-ms-date': new Date().toUTCString(), ...extra }, body: bytes, signal: AbortSignal.timeout(30000) });
      };
      const properties = await request('HEAD');
      report.productContainerAccessible = properties.status === 200;
      if (!report.productContainerAccessible) {
        report.storageHttpStatus = properties.status;
        report.storageFailureCode = properties.headers.get('x-ms-error-code') || 'PRODUCT_CONTAINER_READ_REJECTED';
      }
      if (payload?.mode === 'uploadProbe') {
        if (!report.productContainerAccessible) throw fail('PRODUCT_CONTAINER_UNAVAILABLE');
        const result = await verifyOwnedUpload({ request, baseUrl: payload.baseUrl, runId: payload.runId });
        console.log('HIDI_MEDIA_CHECK::' + JSON.stringify(result));
        return;
      }
    } catch (error) {
      if (payload?.mode === 'uploadProbe') throw error;
      report.storageFailureCode = /^[A-Za-z0-9_]{1,80}$/.test(String(error?.code)) ? error.code : 'STORAGE_CHECK_FAILED';
      report.storageHttpStatus = Number.isInteger(error?.statusCode) ? error.statusCode : null;
    }
  }
  console.log('HIDI_MEDIA_CHECK::' + JSON.stringify(report));
}
