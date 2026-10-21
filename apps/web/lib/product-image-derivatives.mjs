import sharp from 'sharp';
import {
  PERSISTENT_DERIVATIVE_WIDTHS,
  persistentDerivativeBlobKey,
  resizedImage,
} from '../../../deploy/collection-speed/images.mjs';

const MASTER_WIDTH = 1920;
const MASTER_QUALITY = 92;
const DISPLAY_QUALITY = 75;
const MAX_PARALLEL_RENDERS = 2;

/**
 * Render shopper-ready derivatives from the validated disk-backed original.
 * The original file is never modified. One bounded 1920px WebP master is
 * created first so the expensive original decode happens only once.
 */
export async function renderProductDerivatives(originalKey, sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath) throw new Error('Product photo source path is required');
  const keys = PERSISTENT_DERIVATIVE_WIDTHS.map(width => {
    const key = persistentDerivativeBlobKey(originalKey,width,'webp');
    if (!key) throw new Error('Invalid product image key for derivatives');
    return {width,key};
  });

  const master = await resizedImage(sharp,sourcePath,MASTER_WIDTH,'webp',MASTER_QUALITY);
  const results = [];
  for (let index = 0; index < keys.length; index += MAX_PARALLEL_RENDERS) {
    const group = keys.slice(index,index + MAX_PARALLEL_RENDERS);
    const rendered = await Promise.all(group.map(async item => ({
      ...item,
      format: 'webp',
      contentType: 'image/webp',
      bytes: await resizedImage(sharp,master,item.width,'webp',DISPLAY_QUALITY),
    })));
    results.push(...rendered);
  }
  return results;
}
