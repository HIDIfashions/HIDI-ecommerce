import {createHash} from 'node:crypto';
import { renderProductDerivatives } from './product-image-derivatives.mjs';

const DERIVATIVE_VERSION = 'v1';
const DERIVATIVE_UPLOAD_CONCURRENCY = 2;

async function uploadImmutableDerivative(container, item, sourceSha256) {
  const blob = container.getBlockBlobClient(item.key);
  const derivativeSha256=createHash('sha256').update(item.bytes).digest('hex');
  try {
    await blob.uploadData(item.bytes, {
      conditions: { ifNoneMatch: '*' },
      metadata: {
        hidi_source_sha256: sourceSha256,
        hidi_derivative_version: DERIVATIVE_VERSION,
        hidi_width: String(item.width),
        hidi_format: 'webp',
        hidi_derivative_sha256: derivativeSha256,
      },
      blobHTTPHeaders: {
        blobContentType: item.contentType,
        blobCacheControl: 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    const status = error?.statusCode;
    if (![409,412].includes(status ?? 0)) throw error;
    const saved = await blob.getProperties();
    const metadata = saved.metadata ?? {};
    if (saved.contentLength !== item.bytes.length ||
        saved.contentType !== item.contentType ||
        metadata.hidi_source_sha256 !== sourceSha256 ||
        metadata.hidi_derivative_version !== DERIVATIVE_VERSION ||
        metadata.hidi_width !== String(item.width) ||
        metadata.hidi_format !== 'webp' ||
        metadata.hidi_derivative_sha256 !== derivativeSha256) {
      throw new Error('Saved product derivative differs from this source photo');
    }
    const existing=await blob.downloadToBuffer(0,item.bytes.length);
    if(existing.length!==item.bytes.length ||
        createHash('sha256').update(existing).digest('hex')!==derivativeSha256) {
      throw new Error('Saved product derivative bytes differ from this source photo');
    }
  }
}

export async function persistProductDerivatives(container, originalKey, photo, options = {}) {
  if (!container?.getBlockBlobClient) throw new Error('Product media container is required');
  if (!photo?.path || !/^[a-f0-9]{64}$/.test(photo.sha256 || '')) throw new Error('Validated product photo is required');
  const render = options.render ?? renderProductDerivatives;
  const derivatives = await render(originalKey,photo.path);
  for (let index = 0; index < derivatives.length; index += DERIVATIVE_UPLOAD_CONCURRENCY) {
    await Promise.all(
      derivatives.slice(index,index + DERIVATIVE_UPLOAD_CONCURRENCY)
        .map(item => uploadImmutableDerivative(container,item,photo.sha256)),
    );
  }
  return derivatives.map(({key,width}) => ({key,width}));
}
