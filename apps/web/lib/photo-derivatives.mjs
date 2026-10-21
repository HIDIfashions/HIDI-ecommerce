import sharp from "sharp";
import { resizedImage } from "../../../deploy/collection-speed/images.mjs";
import { PRODUCT_DERIVATIVE_WIDTHS, productDerivativeKey } from "./product-image-derivatives.mjs";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

async function uploadDerivative(blob, bytes, photo, width, signal) {
  try {
    await blob.uploadData(bytes, {
      conditions: { ifNoneMatch: "*" },
      abortSignal: signal,
      metadata: {
        hidi_source_sha256: photo.sha256,
        hidi_derivative_width: String(width),
        hidi_derivative_version: "v1",
      },
      blobHTTPHeaders: {
        blobContentType: "image/webp",
        blobCacheControl: CACHE_CONTROL,
      },
    });
    return { created: true };
  } catch (error) {
    if (![409, 412].includes(error?.statusCode)) throw error;
    const saved = await blob.getProperties({ abortSignal: signal });
    const sameMetadata =
      saved.contentType === "image/webp" &&
      saved.metadata?.hidi_source_sha256 === photo.sha256 &&
      saved.metadata?.hidi_derivative_width === String(width) &&
      saved.metadata?.hidi_derivative_version === "v1";
    if (!sameMetadata || saved.contentLength !== bytes.length) {
      throw new Error("Existing product derivative does not match this source image");
    }
    const existing = await blob.downloadToBuffer(0, bytes.length, { abortSignal: signal });
    if (!existing.equals(bytes)) throw new Error("Existing product derivative bytes do not match this source image");
    return { created: false };
  }
}

export async function createAndUploadProductDerivatives(
  container,
  originalKey,
  photo,
  {
    widths = PRODUCT_DERIVATIVE_WIDTHS,
    processor = sharp,
    signal = AbortSignal.timeout(600000),
  } = {},
) {
  if (!photo?.path || !/^[a-f0-9]{64}$/.test(photo.sha256 ?? "")) throw new Error("Invalid product derivative source");
  const requested = [...new Set(widths)];
  if (!requested.length || requested.some(width => !PRODUCT_DERIVATIVE_WIDTHS.includes(width))) {
    throw new Error("Invalid product derivative widths");
  }

  const results = [];
  for (const width of requested) {
    if (signal.aborted) throw signal.reason ?? new Error("Product derivative generation aborted");
    const key = productDerivativeKey(originalKey, width);
    if (!key) throw new Error("Invalid product image key for derivatives");
    const bytes = await resizedImage(processor, photo.path, width, "webp", 75);
    const blob = container.getBlockBlobClient(key);
    const status = await uploadDerivative(blob, bytes, photo, width, signal);
    results.push({ width, key, bytes: bytes.length, created: status.created });
  }
  return results;
}
