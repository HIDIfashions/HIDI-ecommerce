import { createRequire } from 'node:module';

const fail = code => Object.assign(new Error(code), { code });
function safeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (!/^(?:[a-z0-9-]+\.blob\.core\.windows\.net|(?:[a-z0-9-]+\.)*thehidi\.com|(?:www\.)?hidiindia\.com)$/.test(url.hostname)) return null;
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}
function azureModules() {
  for (const filename of ['/app/apps/web/package.json', '/app/package.json']) {
    try {
      const require = createRequire(filename);
      return { ...require('@azure/identity'), ...require('@azure/storage-blob') };
    } catch {}
  }
  throw fail('AZURE_UPLOAD_SDK_UNAVAILABLE');
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
    mediaBaseSafeUrl: safeUrl(media), siteUrl: safeUrl(process.env.SITE_URL),
    managedIdentityClientConfigured: Boolean(process.env.AZURE_CLIENT_ID),
    productContainerAccessible: false,
  };
  if (report.accountConfigured && report.accountMatchesCapture && report.mediaProviderAzure) {
    try {
      const { DefaultAzureCredential, BlobServiceClient } = azureModules();
      const client = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential());
      await client.getContainerClient('product-media').getProperties();
      report.productContainerAccessible = true;
    } catch (error) {
      report.storageFailureCode = /^[A-Za-z0-9_]{1,80}$/.test(String(error?.code)) ? error.code : 'STORAGE_CHECK_FAILED';
      report.storageHttpStatus = Number.isInteger(error?.statusCode) ? error.statusCode : null;
    }
  }
  console.log('HIDI_MEDIA_CHECK::' + JSON.stringify(report));
}
